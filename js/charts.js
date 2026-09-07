/*
 * TremorPSD — gráficos (Chart.js 4 + canvas próprio para o espectrograma)
 * Paleta validada (azul/laranja, seguros para daltonismo), temas claro/escuro
 * lidos das variáveis CSS, tooltips com crosshair, exportação para PNG.
 */
(function (root) {
  'use strict';

  const BANDS = [
    { key: 'pd', label: 'Parkinsoniano 4–6 Hz', short: 'Parkinsoniano', abbr: 'DP', from: 4, to: 6, cssVar: '--chart-band-pd' },
    { key: 'ept', label: 'Fisiológico 8–12 Hz', short: 'Fisiológico', abbr: 'Fisiol.', from: 8, to: 12, cssVar: '--chart-band-et' },
    { key: 'ot', label: 'Ortostático 13–18 Hz', short: 'Ortostático', abbr: 'OT', from: 13, to: 18, cssVar: '--chart-band-ot' },
  ];

  function cssVar(name, el) {
    return getComputedStyle(el || document.documentElement).getPropertyValue(name).trim();
  }
  function theme() {
    return {
      primary: cssVar('--chart-primary') || '#007AFF',
      secondary: cssVar('--chart-secondary') || '#D9730D',
      muted: cssVar('--chart-muted') || '#8E8E93',
      grid: cssVar('--chart-grid') || 'rgba(0,0,0,0.1)',
      fill: cssVar('--chart-fill') || 'rgba(0,122,255,0.16)',
      label: cssVar('--label-secondary') || '#666',
      text: cssVar('--label') || '#000',
      surface: cssVar('--bg-elevated') || '#fff',
      bands: Object.fromEntries(BANDS.map(b => [b.key, cssVar(b.cssVar) || 'rgba(0,0,0,0.05)'])),
      dark: document.documentElement.getAttribute('data-theme') === 'dark',
    };
  }
  const fmtNum = (v, d) => Number(v).toFixed(d).replace('.', ',');
  function fontFamily() { return '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif'; }

  /** Reduz o número de pontos para desenhar (mantém extremos por bloco). */
  function decimate(xs, ys, maxPoints) {
    const n = xs.length;
    if (n <= maxPoints) { const out = new Array(n); for (let i = 0; i < n; i++) out[i] = { x: xs[i], y: ys[i] }; return out; }
    const block = Math.ceil(n / (maxPoints / 2));
    const out = [];
    for (let s = 0; s < n; s += block) {
      let mn = s, mx = s;
      for (let i = s; i < Math.min(n, s + block); i++) { if (ys[i] < ys[mn]) mn = i; if (ys[i] > ys[mx]) mx = i; }
      const a = Math.min(mn, mx), b = Math.max(mn, mx);
      out.push({ x: xs[a], y: ys[a] }); if (b !== a) out.push({ x: xs[b], y: ys[b] });
    }
    return out;
  }

  // ---- Plugins ----------------------------------------------------------
  const bandsPlugin = {
    id: 'tremorBands',
    beforeDatasetsDraw(chart, _args, opts) {
      if (!opts || !opts.enabled) return;
      const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
      const t = opts.theme;
      ctx.save();
      BANDS.forEach(b => {
        const x1 = x.getPixelForValue(b.from), x2 = x.getPixelForValue(b.to);
        if (!isFinite(x1) || !isFinite(x2)) return;
        ctx.fillStyle = t.bands[b.key];
        ctx.fillRect(Math.max(x1, chart.chartArea.left), top, Math.min(x2, chart.chartArea.right) - Math.max(x1, chart.chartArea.left), bottom - top);
        ctx.fillStyle = t.label; ctx.font = `500 10px ${fontFamily()}`; ctx.textAlign = 'center';
        const avail = Math.abs(x2 - x1) - 4;
        const txt = ctx.measureText(b.short).width <= avail ? b.short : (ctx.measureText(b.abbr).width <= avail ? b.abbr : '');
        if (txt) ctx.fillText(txt, (x1 + x2) / 2, top + 11);
      });
      // Tremor essencial 4–12 Hz: chave superior
      const e1 = x.getPixelForValue(4), e2 = x.getPixelForValue(12);
      ctx.strokeStyle = t.label; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(e1, top + 18); ctx.lineTo(e2, top + 18); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = `500 10px ${fontFamily()}`; ctx.textAlign = 'center'; ctx.fillText(Math.abs(e2 - e1) > 120 ? 'Essencial 4–12 Hz' : 'TE 4–12', (e1 + e2) / 2, top + 29);
      ctx.restore();
    },
  };
  const peakPlugin = {
    id: 'tremorPeak',
    afterDatasetsDraw(chart, _args, opts) {
      if (!opts || !opts.peak) return;
      const { ctx, chartArea: { top, bottom, left, right }, scales: { x, y } } = chart;
      const t = opts.theme, p = opts.peak;
      const px = x.getPixelForValue(p.freq);
      if (!isFinite(px) || px < left || px > right) return;
      ctx.save();
      ctx.strokeStyle = t.secondary; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke(); ctx.setLineDash([]);
      if (isFinite(p.fLeft) && isFinite(p.fRight) && isFinite(p.power)) {
        const yh = y.getPixelForValue(p.power / 2);
        const xl = x.getPixelForValue(p.fLeft), xr = x.getPixelForValue(p.fRight);
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xl, yh); ctx.lineTo(xr, yh); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xl, yh - 4); ctx.lineTo(xl, yh + 4); ctx.moveTo(xr, yh - 4); ctx.lineTo(xr, yh + 4); ctx.stroke();
      }
      ctx.fillStyle = t.secondary; ctx.font = `600 11px ${fontFamily()}`; ctx.textAlign = px > (left + right) / 2 ? 'right' : 'left';
      ctx.fillText(`Pico ${fmtNum(p.freq, 1)} Hz`, px + (px > (left + right) / 2 ? -6 : 6), top + 44);
      ctx.restore();
    },
  };
  const crosshairPlugin = {
    id: 'tremorCrosshair',
    afterDraw(chart, _args, opts) {
      if (!opts || !opts.enabled) return;
      const active = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
      if (!active.length) return;
      const { ctx, chartArea: { top, bottom } } = chart;
      const x = active[0].element.x;
      ctx.save(); ctx.strokeStyle = opts.theme.label; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
    },
  };
  const hlinePlugin = {
    id: 'tremorHLine',
    afterDatasetsDraw(chart, _args, opts) {
      if (!opts || !isFinite(opts.value)) return;
      const { ctx, chartArea: { left, right }, scales: { y } } = chart;
      const py = y.getPixelForValue(opts.value);
      ctx.save(); ctx.strokeStyle = opts.theme.label; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = opts.theme.label; ctx.font = `500 10px ${fontFamily()}`; ctx.textAlign = 'right';
      ctx.fillText(opts.label || '', right - 4, py - 4); ctx.restore();
    },
  };
  if (root.Chart) root.Chart.register(bandsPlugin, peakPlugin, crosshairPlugin, hlinePlugin);

  function baseOptions(t, xTitle, yTitle, extra) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false, animation: false, normalized: true,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.dark ? 'rgba(44,44,46,0.96)' : 'rgba(255,255,255,0.96)',
          titleColor: t.text, bodyColor: t.text, borderColor: t.grid, borderWidth: 1,
          padding: 8, displayColors: false, titleFont: { family: fontFamily(), weight: '600', size: 12 }, bodyFont: { family: fontFamily(), size: 12 },
        },
        tremorCrosshair: { enabled: true, theme: t },
        tremorBands: { enabled: false }, tremorPeak: {}, tremorHLine: {},
      },
      scales: {
        x: { type: 'linear', title: { display: !!xTitle, text: xTitle, color: t.label, font: { family: fontFamily(), size: 11 } }, ticks: { color: t.label, font: { family: fontFamily(), size: 11 }, maxTicksLimit: 8 }, grid: { color: t.grid, drawTicks: false }, border: { display: false } },
        y: { title: { display: !!yTitle, text: yTitle, color: t.label, font: { family: fontFamily(), size: 11 } }, ticks: { color: t.label, font: { family: fontFamily(), size: 11 }, maxTicksLimit: 6 }, grid: { color: t.grid, drawTicks: false }, border: { display: false } },
      },
      elements: { line: { borderWidth: 2, tension: 0 }, point: { radius: 0, hitRadius: 8, hoverRadius: 4 } },
    }, extra || {});
  }

  // ---- Configurações dos gráficos --------------------------------------
  function timeConfig(R, t, opts) {
    opts = opts || {};
    const S = R.signal;
    const maxPts = opts.maxPoints || 2400;
    const filtered = decimate(S.time, S.filtered, maxPts);
    const raw = decimate(S.time, S.raw, maxPts);
    const datasets = [
      { label: 'Aceleração filtrada (1–30 Hz)', data: filtered, borderColor: t.primary, borderWidth: 1.5, order: 1 },
    ];
    if (opts.showRaw !== false) datasets.push({ label: 'Sinal bruto (sem tendência)', data: raw, borderColor: t.muted, borderWidth: 1, order: 2, hidden: false });
    if (R.envelope) {
      const env = decimate(S.time, R.envelope, Math.min(maxPts, 800));
      datasets.push({ label: 'Envelope (Hilbert)', data: env, borderColor: t.secondary, borderWidth: 1.5, order: 0 });
    }
    return {
      type: 'line', data: { datasets },
      options: baseOptions(t, 'Tempo (s)', 'Aceleração (m/s²)', {
        parsing: false,
        plugins: Object.assign(baseOptions(t).plugins, { tooltip: Object.assign(baseOptions(t).plugins.tooltip, { callbacks: { title: (items) => `t = ${fmtNum(items[0].parsed.x, 2)} s`, label: (item) => `${item.dataset.label}: ${fmtNum(item.parsed.y, 3)} m/s²` } }) }),
      }),
    };
  }

  function psdConfig(R, t, opts) {
    opts = opts || {};
    const sp = R.spectrum;
    const fmax = Math.min(sp.bandHigh + 1, 26);
    const pts = [];
    for (let i = 0; i < sp.freqs.length && sp.freqs[i] <= fmax; i++) pts.push({ x: sp.freqs[i], y: sp.psd[i] });
    const m = R.metrics;
    const peak = isFinite(m.peakFreq) ? { freq: m.peakFreq, power: m.peakPower, fLeft: m.fwhmLeft, fRight: m.fwhmRight } : null;
    const o = baseOptions(t, 'Frequência (Hz)', 'PSD ((m/s²)²/Hz)', { parsing: false });
    o.scales.x.min = 0; o.scales.x.max = fmax; o.scales.x.ticks.stepSize = 2; o.scales.x.ticks.maxTicksLimit = 14;
    o.scales.y.min = 0;
    o.scales.y.ticks.callback = (v) => Number(v).toExponential(1).replace('.', ',');
    o.plugins.tremorBands = { enabled: true, theme: t };
    o.plugins.tremorPeak = { peak, theme: t };
    o.plugins.tooltip.callbacks = { title: (items) => `${fmtNum(items[0].parsed.x, 2)} Hz`, label: (item) => `PSD: ${Number(item.parsed.y).toExponential(2)} (m/s²)²/Hz` };
    return { type: 'line', data: { datasets: [{ label: 'PSD (Welch)', data: pts, borderColor: t.primary, backgroundColor: t.fill, fill: 'origin', borderWidth: 2 }] }, options: o };
  }

  function instFreqConfig(R, t) {
    const st = R.stability;
    const m = R.metrics;
    const pts = st ? st.times.map((tt, i) => ({ x: tt, y: st.freqs[i] })) : [];
    const win = R.spectrogram.windows.filter(w => w.detected).map(w => ({ x: w.tCenter, y: w.peakFreq }));
    const o = baseOptions(t, 'Tempo (s)', 'Frequência (Hz)', { parsing: false });
    const f0 = isFinite(m.peakFreq) ? m.peakFreq : 6;
    o.scales.y.min = Math.max(0, Math.floor(f0 - 3)); o.scales.y.max = Math.ceil(f0 + 3);
    o.plugins.tremorHLine = { value: m.instFreqMean, label: `média ${fmtNum(m.instFreqMean || 0, 2)} Hz`, theme: t };
    o.plugins.tooltip.callbacks = { title: (items) => `t = ${fmtNum(items[0].parsed.x, 2)} s`, label: (item) => `${item.dataset.label}: ${fmtNum(item.parsed.y, 2)} Hz` };
    o.interaction = { mode: 'nearest', axis: 'xy', intersect: false };
    return {
      type: 'scatter',
      data: { datasets: [
        { label: 'Frequência instantânea (ciclo a ciclo)', data: pts, backgroundColor: t.primary, pointRadius: 2.5, pointHoverRadius: 5, showLine: false, order: 1 },
        { label: 'Pico por janela (3 s)', data: win, borderColor: t.secondary, backgroundColor: t.secondary, pointRadius: 3, showLine: true, borderWidth: 2, order: 0 },
      ] },
      options: o,
    };
  }

  // ---- Espectrograma (canvas próprio) ---------------------------------------
  function drawSpectrogram(canvas, R, t, opts) {
    opts = opts || {};
    const dpr = opts.dpr || (root.devicePixelRatio || 1);
    const cssW = opts.width || canvas.clientWidth || 600, cssH = opts.height || canvas.clientHeight || 240;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    if (!opts.width) { canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px'; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = t.surface; ctx.fillRect(0, 0, cssW, cssH);
    const sg = R.spectrogram; const wins = sg.windows;
    const padL = 44, padR = 12, padT = 10, padB = 30;
    const W = cssW - padL - padR, H = cssH - padT - padB;
    const fmax = Math.min(R.spectrum.bandHigh, 25);
    const iMax = Math.min(sg.freqs.length - 1, Math.floor(fmax / sg.df));
    const iMin = Math.max(1, Math.floor(R.spectrum.bandLow / sg.df));
    if (!wins.length) return;
    let lo = Infinity, hi = -Infinity;
    wins.forEach(w => { for (let k = iMin; k <= iMax; k++) { const v = 10 * Math.log10(w.psd[k] + 1e-12); if (v < lo) lo = v; if (v > hi) hi = v; } });
    lo = Math.max(lo, hi - 40);
    const tEnd = wins[wins.length - 1].tEnd, tStart = wins[0].tStart;
    const colW = W / wins.length;
    // rampa sequencial de um único matiz (claro: branco→azul→marinho; escuro: marinho→azul→claro)
    const ramp = t.dark ? [[28, 28, 30], [10, 60, 140], [10, 132, 255], [170, 215, 255]] : [[255, 255, 255], [180, 215, 255], [0, 122, 255], [10, 40, 110]];
    const color = (u) => {
      u = Math.min(1, Math.max(0, u)); const seg = u * (ramp.length - 1); const i = Math.min(ramp.length - 2, Math.floor(seg)); const f = seg - i;
      const c = ramp[i].map((a, k) => Math.round(a + (ramp[i + 1][k] - a) * f)); return `rgb(${c[0]},${c[1]},${c[2]})`;
    };
    const rowH = H / (iMax - iMin + 1);
    wins.forEach((w, j) => {
      for (let k = iMin; k <= iMax; k++) {
        const v = 10 * Math.log10(w.psd[k] + 1e-12);
        ctx.fillStyle = color((v - lo) / (hi - lo));
        const y = padT + H - (k - iMin + 1) * rowH;
        ctx.fillRect(padL + j * colW, y, Math.ceil(colW) + 0.5, rowH + 0.5);
      }
    });
    // traço do pico por janela
    ctx.strokeStyle = t.secondary; ctx.lineWidth = 2; ctx.beginPath(); let started = false;
    wins.forEach((w, j) => {
      if (!w.detected) { started = false; return; }
      const x = padL + (j + 0.5) * colW, y = padT + H - (w.peakFreq / sg.df - iMin + 0.5) * rowH;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // eixos
    ctx.fillStyle = t.label; ctx.font = `11px ${fontFamily()}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let f = 0; f <= fmax; f += 5) { const y = padT + H - (f / sg.df - iMin + 0.5) * rowH; if (y < padT || y > padT + H) continue; ctx.fillText(String(f), padL - 6, y); ctx.fillStyle = t.grid; ctx.fillRect(padL, y, W, 1); ctx.fillStyle = t.label; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const nT = Math.min(8, Math.floor(tEnd - tStart));
    for (let i = 0; i <= nT; i++) { const tt = tStart + (tEnd - tStart) * i / nT; const x = padL + ((tt - tStart) / (tEnd - tStart)) * W; ctx.fillText(fmtNum(tt, 0), x, padT + H + 6); }
    ctx.save(); ctx.translate(12, padT + H / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Frequência (Hz)', 0, 0); ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('Tempo (s)', padL + W / 2, cssH - 2);
    canvas._spec = { padL, padT, W, H, wins, tStart, tEnd, iMin, rowH, df: sg.df };
  }

  // ---- Objeto de gráficos da tela ------------------------------------------
  function create(ids) {
    const charts = { time: null, psd: null, inst: null };
    let lastR = null;
    function destroy() { Object.keys(charts).forEach(k => { if (charts[k]) { charts[k].destroy(); charts[k] = null; } }); }
    function update(R) {
      lastR = R; destroy();
      const t = theme();
      const el = (id) => document.getElementById(id);
      charts.time = new Chart(el(ids.time), timeConfig(R, t));
      charts.psd = new Chart(el(ids.psd), psdConfig(R, t));
      charts.inst = new Chart(el(ids.inst), instFreqConfig(R, t));
      drawSpectrogram(el(ids.spec), R, t);
    }
    function refresh() { if (lastR) update(lastR); }
    function clear() { destroy(); ['time', 'psd', 'inst', 'spec'].forEach(k => { const c = document.getElementById(ids[k]); if (c) { const ctx = c.getContext('2d'); ctx && ctx.clearRect(0, 0, c.width, c.height); } }); lastR = null; }
    function png(kind, scale) {
      const c = document.getElementById(ids[kind]);
      if (!c) return null;
      return c.toDataURL('image/png');
    }
    return { update, refresh, clear, png, charts };
  }

  /** Renderiza os quatro gráficos fora da tela (tema claro para impressão) e devolve PNG e JPEG. */
  function renderForReport(R, opts) {
    opts = Object.assign({ width: 1200, height: 480, dpr: 2, forceLight: true, jpegQuality: 0.9 }, opts || {});
    const html = document.documentElement;
    const prev = html.getAttribute('data-theme');
    if (opts.forceLight) html.setAttribute('data-theme', 'light');
    const t = theme();
    const png = {}, jpg = {};
    const toJpeg = (c) => {
      const w = document.createElement('canvas'); w.width = c.width; w.height = c.height;
      const ctx = w.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w.width, w.height); ctx.drawImage(c, 0, 0);
      return w.toDataURL('image/jpeg', opts.jpegQuality);
    };
    const make = (cfg) => {
      const c = document.createElement('canvas');
      c.width = opts.width * opts.dpr; c.height = opts.height * opts.dpr;
      c.style.width = opts.width + 'px'; c.style.height = opts.height + 'px';
      const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + opts.width + 'px;height:' + opts.height + 'px;';
      holder.appendChild(c); document.body.appendChild(holder);
      cfg.options.responsive = false; cfg.options.devicePixelRatio = opts.dpr; cfg.options.animation = false;
      const ch = new Chart(c, cfg);
      const out = { png: c.toDataURL('image/png'), jpg: toJpeg(c) };
      ch.destroy(); holder.remove();
      return out;
    };
    const a = make(timeConfig(R, t, { maxPoints: 4000 })); png.time = a.png; jpg.time = a.jpg;
    const b = make(psdConfig(R, t)); png.psd = b.png; jpg.psd = b.jpg;
    const d = make(instFreqConfig(R, t)); png.inst = d.png; jpg.inst = d.jpg;
    const sc = document.createElement('canvas');
    drawSpectrogram(sc, R, t, { width: opts.width, height: opts.height, dpr: opts.dpr });
    png.spec = sc.toDataURL('image/png'); jpg.spec = toJpeg(sc);
    if (opts.forceLight) { if (prev) html.setAttribute('data-theme', prev); else html.removeAttribute('data-theme'); }
    return { png, jpg };
  }

  /** Pré-visualização ao vivo durante a coleta (últimos N segundos). */
  function drawLive(canvas, samples, seconds, t) {
    const dpr = root.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 300, cssH = canvas.clientHeight || 90;
    if (canvas.width !== Math.round(cssW * dpr)) { canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr); }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (samples.length < 2) return;
    const tEnd = samples[samples.length - 1].t, tStart = tEnd - seconds;
    let i0 = samples.length - 1; while (i0 > 0 && samples[i0].t > tStart) i0--;
    let mean = 0, n = 0; for (let i = i0; i < samples.length; i++) { mean += samples[i].v; n++; } mean /= n || 1;
    let amp = 0; for (let i = i0; i < samples.length; i++) amp = Math.max(amp, Math.abs(samples[i].v - mean));
    amp = Math.max(amp, 0.2);
    ctx.strokeStyle = t.primary; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = i0; i < samples.length; i++) {
      const x = ((samples[i].t - tStart) / seconds) * cssW, y = cssH / 2 - ((samples[i].v - mean) / amp) * (cssH / 2 - 6);
      if (i === i0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = t.label; ctx.font = `11px ${fontFamily()}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(`±${fmtNum(amp, 2)} m/s²`, cssW - 6, 4);
  }

  root.TremorCharts = { theme, create, renderForReport, drawSpectrogram, drawLive, BANDS, decimate };
})(typeof window !== 'undefined' ? window : this);
