// Teste ponta a ponta com Playwright (Chromium): NODE_PATH=/opt/node22/lib/node_modules node tests/e2e.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 8089, ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = process.env.E2E_OUT || path.join(ROOT, 'tests', 'out');
fs.mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['http-server', ROOT, '-p', String(PORT), '-s', '-c-1'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const results = [];
const check = (name, ok, info) => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2, acceptDownloads: true, locale: 'pt-BR' });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  check('página carrega', await page.title() === 'TremorPSD — Análise quantitativa de tremor');

  // PWA: manifest e recursos pré-cacheados
  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  check('manifest com ícones', manifest.icons.length >= 4 && manifest.display === 'standalone');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const precache = [...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]).filter(u => u && u !== '');
  let missing = [];
  for (const u of precache) { const st = await page.evaluate(async (u) => (await fetch(u, { cache: 'no-store' })).status, u); if (st !== 200) missing.push(u + ':' + st); }
  check('todos os recursos do pré-cache existem', missing.length === 0, missing.join(', '));
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null || false, null, { timeout: 8000 }).catch(() => {});
  const swReady = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && (r.active || r.waiting || r.installing)); });
  check('service worker registrado', swReady);

  // Demo: perfil parkinsoniano em repouso
  await page.click('#btnDemo');
  await page.waitForSelector('#app:not([hidden])');
  await page.selectOption('#demoProfile', 'pd');
  await page.click('#condition button[data-value="rest"]');
  await page.fill('#patientId', 'TESTE-01');
  await page.click('#btnAction');
  await page.waitForSelector('#results:not([hidden])', { timeout: 20000 });
  const summary = await page.textContent('#summaryText');
  check('demo DP: resultado renderizado', /parkinsoniano/i.test(summary), summary.slice(0, 120));
  const tiles = await page.$$eval('#stats .stat', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check('12 métricas exibidas', tiles.length === 12);
  const peak = await page.evaluate(() => window.TremorApp.state.session.results.metrics.peakFreq);
  check('pico ≈ 5 Hz', Math.abs(peak - 5) < 0.8, peak.toFixed(2));
  const chartsDrawn = await page.evaluate(() => ['chartTime', 'chartPSD', 'chartSpec', 'chartInst'].map(id => { const c = document.getElementById(id); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n++; return n > 20; }));
  check('4 gráficos desenhados', chartsDrawn.every(Boolean), JSON.stringify(chartsDrawn));
  await page.screenshot({ path: path.join(OUT, 'demo-light.png'), fullPage: true });

  // Tema escuro
  await page.click('.theme-switch button[data-theme-pref="dark"]');
  await page.waitForTimeout(400);
  check('tema escuro aplicado', await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark');
  await page.screenshot({ path: path.join(OUT, 'demo-dark.png'), fullPage: true });
  await page.click('.theme-switch button[data-theme-pref="light"]');

  // Relatório
  await page.click('#btnReport');
  await page.waitForTimeout(800);
  const frameHtml = await page.evaluate(() => document.getElementById('reportFrame').srcdoc);
  check('relatório HTML gerado', /Relatório de análise quantitativa/.test(frameHtml) && (frameHtml.match(/data:image\/(png|jpeg)/g) || []).length === 4);
  await page.screenshot({ path: path.join(OUT, 'report-sheet.png') });
  await page.keyboard.press('Escape');

  // Exportações
  await page.click('#btnExport');
  await page.waitForTimeout(400);
  for (const kind of ['pdf', 'html', 'json', 'csv-metrics', 'csv-raw', 'csv-psd']) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click(`[data-export="${kind}"]`)]);
    const p = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(p);
    const size = fs.statSync(p).size;
    check(`exporta ${kind}`, size > 200, `${dl.suggestedFilename()} (${size} B)`);
  }
  const pngs = [];
  page.on('download', d => pngs.push(d));
  await page.click('[data-export="png"]');
  await page.waitForTimeout(2500);
  check('exporta 4 PNG', pngs.length === 4, String(pngs.length));
  await page.keyboard.press('Escape');

  // Caminho do sensor real: eventos DeviceMotion sintéticos (6 Hz) em nova página
  const page2 = await context.newPage();
  page2.on('pageerror', e => errors.push(String(e)));
  await page2.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page2.evaluate(() => {
    const fs = 60; const t0 = performance.now();
    window.__motion = setInterval(() => {
      const t = (performance.now() - t0) / 1000; // relógio real: a frequência medida deve ser 6 Hz
      const trem = 0.9 * Math.sin(2 * Math.PI * 6 * t + 0.3 * Math.sin(2 * Math.PI * 0.2 * t));
      const n = () => (Math.random() - 0.5) * 0.1;
      const ev = new DeviceMotionEvent('devicemotion', { acceleration: { x: 0.8 * trem + n(), y: 0.5 * trem + n(), z: 0.2 * trem + n() }, accelerationIncludingGravity: { x: 0.8 * trem + n(), y: 0.5 * trem + n(), z: 9.81 + 0.2 * trem + n() }, rotationRate: null, interval: 1000 / fs });
      window.dispatchEvent(ev);
    }, 1000 / fs);
  });
  await page2.click('#btnStart');
  await page2.waitForSelector('#app:not([hidden])');
  await page2.waitForFunction(() => document.getElementById('btnAction').disabled === false, null, { timeout: 8000 });
  check('sensor detectado (eventos sintéticos)', /Pronto/.test(await page2.textContent('#statusText')));
  await page2.fill('#duration', '12'); await page2.dispatchEvent('#duration', 'change');
  await page2.click('#btnAction');
  await page2.waitForSelector('#countdown:not([hidden])');
  await page2.waitForSelector('#results:not([hidden])', { timeout: 40000 });
  const m2 = await page2.evaluate(() => window.TremorApp.state.session.results.metrics);
  check('sensor: pico ≈ 6 Hz', Math.abs(m2.peakFreq - 6) < 0.2, m2.peakFreq.toFixed(2));
  check('sensor: tremor detectado, TSI finito', m2.detected && Number.isFinite(m2.tsi), `TSI ${m2.tsi.toFixed(2)}`);
  const axis = await page2.evaluate(() => window.TremorApp.state.session.axisInfo);
  check('PCA: variância explicada > 90%', axis.mode === 'auto' && axis.explained > 0.9, JSON.stringify(axis));
  await page2.evaluate(() => clearInterval(window.__motion));

  // Offline (service worker)
  await context.setOffline(true);
  const page3 = await context.newPage();
  let offlineOk = false;
  try { await page3.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load', timeout: 10000 }); offlineOk = (await page3.title()).includes('TremorPSD') && await page3.evaluate(() => !!window.TremorDSP && !!window.Chart); } catch (e) { offlineOk = false; }
  check('funciona offline via service worker', offlineOk);
  await context.setOffline(false);

  check('sem erros de JavaScript no console', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close(); server.kill();
}
const fails = results.filter(r => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} verificações passaram`);
process.exit(fails ? 1 : 0);
