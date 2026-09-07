/*
 * TremorPSD — aplicação (fluxo, sensores, protocolo, tema, PWA, exportações)
 */
(function () {
  'use strict';
  const APP_VERSION = '2.0.0';
  const DSP = window.TremorDSP, INTERP = window.TremorInterpret, CH = window.TremorCharts, REP = window.TremorReport;
  const $ = (id) => document.getElementById(id);
  const fmt = REP.fmt;

  const state = {
    phase: 'init',          // init | idle | countdown | collecting | analyzing | done | error
    source: 'sensor',       // sensor | demo
    sensor: { events: 0, lastEvent: 0, dts: [], linear: null, listening: false },
    preview: [],            // amostras recentes para a pré-visualização
    samples: [],            // amostras da coleta atual {t,x,y,z,v}
    startT: 0, endT: 0, timer: null, raf: null,
    session: null,
    charts: null,
    deferredInstall: null,
    swWaiting: null,
    reportHtml: null,
    reportImages: null,
  };

  // ---------------------------------------------------------------------
  // Utilidades de interface
  // ---------------------------------------------------------------------
  let toastTimer = null;
  function toast(msg, ms) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms || 2600);
  }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }
  function segmentedValue(id) { const b = $(id).querySelector('[aria-pressed="true"]'); return b ? b.dataset.value : null; }
  function setSegmented(id, value) { $(id).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === value))); }
  function initSegmented(id, onChange) {
    $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; setSegmented(id, b.dataset.value); if (onChange) onChange(b.dataset.value); });
  }
  function openSheet(id) { $('sheetBackdrop').classList.add('show'); $(id).classList.add('show'); document.body.style.overflow = 'hidden'; }
  function closeSheets() { $('sheetBackdrop').classList.remove('show'); document.querySelectorAll('.sheet').forEach(s => s.classList.remove('show')); document.body.style.overflow = ''; }

  // ---------------------------------------------------------------------
  // Tema
  // ---------------------------------------------------------------------
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme(pref) {
    const dark = pref === 'dark' || (pref === 'auto' && mq && mq.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme-pref', pref);
    document.querySelectorAll('.theme-switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themePref === pref)));
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute('content', dark ? '#000000' : '#F2F2F7');
    if (state.charts) state.charts.refresh();
  }
  function initTheme() {
    let pref = 'auto'; try { pref = localStorage.getItem('tremorpsd-theme') || 'auto'; } catch (e) { /* ignore */ }
    applyTheme(pref);
    document.querySelectorAll('.theme-switch button').forEach(b => b.addEventListener('click', () => { const p = b.dataset.themePref; try { localStorage.setItem('tremorpsd-theme', p); } catch (e) { /* ignore */ } applyTheme(p); }));
    if (mq) { const h = () => { if ((document.documentElement.getAttribute('data-theme-pref') || 'auto') === 'auto') applyTheme('auto'); }; if (mq.addEventListener) mq.addEventListener('change', h); else mq.addListener(h); }
  }

  // ---------------------------------------------------------------------
  // PWA: service worker e instalação
  // ---------------------------------------------------------------------
  function initPwa() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        if (reg.waiting && navigator.serviceWorker.controller) { state.swWaiting = reg.waiting; $('updateBanner').classList.add('show'); }
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing; if (!nw) return;
          nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) { state.swWaiting = nw; $('updateBanner').classList.add('show'); } });
        });
      }).catch(err => console.warn('SW:', err));
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
    }
    $('btnUpdate').addEventListener('click', () => { if (state.swWaiting) state.swWaiting.postMessage({ type: 'SKIP_WAITING' }); else location.reload(); });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.deferredInstall = e; let dismissed = false; try { dismissed = localStorage.getItem('tremorpsd-install-dismissed') === '1'; } catch (err) { /* ignore */ } if (!dismissed) $('installBanner').classList.add('show'); });
    $('btnInstall').addEventListener('click', async () => { if (!state.deferredInstall) return; state.deferredInstall.prompt(); try { await state.deferredInstall.userChoice; } catch (e) { /* ignore */ } state.deferredInstall = null; $('installBanner').classList.remove('show'); });
    $('btnInstallDismiss').addEventListener('click', () => { $('installBanner').classList.remove('show'); try { localStorage.setItem('tremorpsd-install-dismissed', '1'); } catch (e) { /* ignore */ } });
    window.addEventListener('appinstalled', () => { $('installBanner').classList.remove('show'); toast('TremorPSD instalado'); });
  }

  // ---------------------------------------------------------------------
  // Sensores
  // ---------------------------------------------------------------------
  function secureContext() { return window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'; }
  async function requestPermission() {
    if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try { const r = await DeviceMotionEvent.requestPermission(); return r === 'granted' ? 'granted' : 'denied'; } catch (e) { return 'denied'; }
    }
    return 'granted';
  }
  function onMotion(ev) {
    const now = Number.isFinite(ev.timeStamp) && ev.timeStamp > 0 ? ev.timeStamp / 1000 : performance.now() / 1000;
    const s = state.sensor;
    if (s.lastEvent) { const dt = now - s.lastEvent; if (dt > 0 && dt < 1) { s.dts.push(dt); if (s.dts.length > 120) s.dts.shift(); } }
    s.lastEvent = now; s.events++;
    let a = ev.acceleration, linear = true;
    if (!a || a.x === null || a.x === undefined || (a.x === 0 && a.y === 0 && a.z === 0 && s.events < 5)) { a = ev.accelerationIncludingGravity; linear = false; }
    if (!a || a.x === null || a.x === undefined) return;
    if (s.linear === null) s.linear = linear;
    const sample = { t: now, x: a.x, y: a.y, z: a.z };
    sample.v = previewValue(sample);
    state.preview.push(sample); if (state.preview.length > 600) state.preview.splice(0, state.preview.length - 600);
    if (state.phase === 'collecting') {
      state.samples.push(sample);
      if (now - state.startT >= currentDuration()) stopCollection();
    }
  }
  function previewValue(s) {
    const mode = $('axisMode').value;
    if (mode === 'x') return s.x; if (mode === 'y') return s.y; if (mode === 'z') return s.z;
    if (mode === 'norm') return Math.hypot(s.x, s.y, s.z);
    // pré-visualização: eixo de maior desvio recente (aproximação barata da PCA)
    const p = state.preview; if (p.length < 30) return s.x;
    let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, szz = 0; const n = Math.min(p.length, 120);
    for (let i = p.length - n; i < p.length; i++) { sx += p[i].x; sy += p[i].y; sz += p[i].z; sxx += p[i].x * p[i].x; syy += p[i].y * p[i].y; szz += p[i].z * p[i].z; }
    const vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2, vz = szz / n - (sz / n) ** 2;
    return vx >= vy && vx >= vz ? s.x : (vy >= vz ? s.y : s.z);
  }
  function sensorRate() { const d = state.sensor.dts; if (d.length < 10) return 0; const m = DSP.median(d); return m > 0 ? 1 / m : 0; }
  function startSensor() {
    if (state.sensor.listening) return;
    window.addEventListener('devicemotion', onMotion, { passive: true });
    state.sensor.listening = true;
    setInterval(watchSensor, 1000);
    watchSensor();
  }
  function watchSensor() {
    if (state.source === 'demo') return;
    const s = state.sensor; const now = performance.now() / 1000;
    const alive = s.events > 0 && (now - s.lastEvent) < 2;
    $('rateChip').textContent = alive ? `${fmt(sensorRate(), 0)} Hz` : '— Hz';
    if (state.phase === 'init' || state.phase === 'idle' || state.phase === 'error') {
      if (alive) setPhase('idle'); else setPhase('error', { text: 'Sensor de movimento não detectado', detail: 'Mova o aparelho. Se persistir, verifique as permissões de movimento e orientação do navegador, ou use o modo demonstração.' });
    }
  }

  // ---------------------------------------------------------------------
  // Fases da interface
  // ---------------------------------------------------------------------
  function setPhase(phase, details) {
    state.phase = phase; details = details || {};
    const icon = $('statusIcon'), text = $('statusText'), detail = $('statusDetail'), btn = $('btnAction');
    icon.className = 'status-icon'; icon.innerHTML = '';
    const svgOk = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
    const svgErr = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>';
    const svgRec = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>';
    btn.className = 'btn block mt-16'; btn.disabled = false;
    switch (phase) {
      case 'init': icon.classList.add('busy'); icon.innerHTML = '<div class="spinner"></div>'; text.textContent = 'Preparando sensores…'; detail.textContent = 'Aguarde a inicialização'; btn.disabled = true; btn.textContent = 'Aguardando sensores'; break;
      case 'idle': icon.classList.add('ready', 'pulse'); icon.innerHTML = svgOk; text.textContent = state.source === 'demo' ? 'Modo demonstração' : 'Pronto para coletar'; detail.textContent = state.source === 'demo' ? 'Sinal sintético será gerado conforme o perfil escolhido.' : `Sensor ativo (${fmt(sensorRate(), 0)} Hz${state.sensor.linear === false ? ', com gravidade' : state.sensor.linear ? ', aceleração linear' : ''}).`; btn.textContent = 'Iniciar coleta'; break;
      case 'countdown': icon.classList.add('busy'); icon.innerHTML = '<div class="spinner"></div>'; text.textContent = 'Prepare-se…'; detail.textContent = 'Assuma a condição de ativação e mantenha o aparelho fixo.'; btn.textContent = 'Cancelar'; btn.classList.add('neutral'); break;
      case 'collecting': icon.classList.add('error'); icon.innerHTML = svgRec; icon.style.color = ''; text.textContent = 'Coletando…'; detail.textContent = ''; btn.textContent = 'Parar e analisar'; btn.classList.add('warning'); break;
      case 'analyzing': icon.classList.add('busy'); icon.innerHTML = '<div class="spinner"></div>'; text.textContent = 'Analisando…'; detail.textContent = `${state.samples.length} amostras`; btn.disabled = true; btn.textContent = 'Processando…'; break;
      case 'done': icon.classList.add('ready'); icon.innerHTML = svgOk; text.textContent = 'Análise concluída'; detail.textContent = details.detail || ''; btn.textContent = 'Nova coleta'; btn.classList.add('secondary'); break;
      case 'error': icon.classList.add('error'); icon.innerHTML = svgErr; text.textContent = details.text || 'Erro'; detail.textContent = details.detail || ''; btn.disabled = state.source !== 'demo'; btn.textContent = state.source === 'demo' ? 'Iniciar coleta' : 'Sensor indisponível'; break;
    }
  }

  // ---------------------------------------------------------------------
  // Protocolo
  // ---------------------------------------------------------------------
  function currentDuration() { const v = parseInt($('duration').value, 10); return Math.min(120, Math.max(10, Number.isFinite(v) ? v : 30)); }
  function readProtocol() {
    return {
      patientId: $('patientId').value.trim(), notes: $('notes').value.trim(),
      condition: segmentedValue('condition'), segment: $('segment').value, side: segmentedValue('side'),
      duration: currentDuration(), axisMode: $('axisMode').value,
    };
  }
  function saveProtocol() { try { const p = readProtocol(); delete p.patientId; delete p.notes; localStorage.setItem('tremorpsd-protocol', JSON.stringify(p)); } catch (e) { /* ignore */ } }
  function loadProtocol() {
    try {
      const p = JSON.parse(localStorage.getItem('tremorpsd-protocol') || 'null'); if (!p) return;
      if (p.condition) setSegmented('condition', p.condition); if (p.side) setSegmented('side', p.side);
      if (p.segment) $('segment').value = p.segment; if (p.axisMode) $('axisMode').value = p.axisMode;
      if (p.duration) { $('duration').value = p.duration; setSegmented('durationPresets', String(p.duration)); }
    } catch (e) { /* ignore */ }
  }
  function updatePlacementHint() {
    const c = segmentedValue('condition'), s = $('segment').value;
    const hints = {
      rest: 'Repouso: membro totalmente apoiado e relaxado (antebraço sobre a coxa ou apoio), aparelho fixo no dorso da mão.',
      posture: 'Postural: braços estendidos à frente, mãos em pronação, sem apoio; aparelho fixo no dorso da mão ou punho.',
      kinetic: 'Cinético: movimento lento e repetido (p.ex., dedo–nariz) durante toda a coleta; o app remove a componente lenta do movimento.',
      orthostatic: 'Em pé: paciente parado, pés afastados na largura dos ombros; aparelho fixo na perna (bolso justo, meia ou faixa) — tremor ortostático 13–18 Hz.',
    };
    let h = hints[c] || '';
    if (c === 'orthostatic' && !['leg', 'foot', 'trunk'].includes(s)) h += ' Para tremor ortostático, escolha "Perna" ou "Tronco" como segmento.';
    $('placementHint').textContent = h;
  }

  // ---------------------------------------------------------------------
  // Coleta
  // ---------------------------------------------------------------------
  function handleAction() {
    if (state.phase === 'idle' || state.phase === 'done' || (state.phase === 'error' && state.source === 'demo')) startCountdown();
    else if (state.phase === 'countdown') cancelCountdown();
    else if (state.phase === 'collecting') stopCollection(true);
  }
  function startCountdown() {
    saveProtocol();
    $('results').hidden = true; $('dock').classList.remove('show');
    state.samples = [];
    if (state.source === 'demo') { runDemo(); return; }
    setPhase('countdown');
    let n = 3; const cd = $('countdown'); cd.hidden = false; cd.textContent = String(n);
    vibrate(40);
    state.timer = setInterval(() => {
      n--; if (n > 0) { cd.textContent = String(n); vibrate(40); return; }
      clearInterval(state.timer); cd.hidden = true; beginCollection();
    }, 1000);
  }
  function cancelCountdown() { clearInterval(state.timer); $('countdown').hidden = true; setPhase('idle'); }
  function beginCollection() {
    state.samples = []; state.startT = state.sensor.lastEvent || performance.now() / 1000;
    setPhase('collecting'); vibrate([60, 40, 60]);
    const tick = () => {
      if (state.phase !== 'collecting') return;
      const now = state.sensor.lastEvent || performance.now() / 1000;
      const el = Math.max(0, now - state.startT), dur = currentDuration();
      $('progressBar').style.width = `${Math.min(100, (el / dur) * 100)}%`;
      $('statusDetail').textContent = `Restam ${fmt(Math.max(0, dur - el), 0)} s · ${state.samples.length} amostras · ${fmt(sensorRate(), 0)} Hz`;
      CH.drawLive($('liveCanvas'), state.preview, 4, CH.theme());
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
    // segurança: encerra mesmo se o sensor parar de emitir eventos
    state.timer = setTimeout(() => { if (state.phase === 'collecting') stopCollection(); }, (currentDuration() + 2) * 1000);
  }
  function stopCollection(manual) {
    if (state.phase !== 'collecting') return;
    clearTimeout(state.timer); cancelAnimationFrame(state.raf);
    $('progressBar').style.width = '0%';
    vibrate(120);
    const dur = state.samples.length > 1 ? state.samples[state.samples.length - 1].t - state.samples[0].t : 0;
    if (manual && dur < 10) { toast(`Registro de ${fmt(dur, 0)} s é curto demais (mínimo 10 s).`); setPhase('idle'); return; }
    setPhase('analyzing');
    setTimeout(() => analyze(state.samples, readProtocol()), 60);
  }

  // ---------------------------------------------------------------------
  // Demonstração (sinal sintético claramente rotulado)
  // ---------------------------------------------------------------------
  function demoSamples(profile, seconds) {
    const fs = 60; let seed = 12345; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const g = () => { const u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const PROFILES = { et: { f: 6.5, amp: 0.9, h2: 0.03, fm: 0.5, jit: 2.5, noise: 0.05, ampMod: 0.25 }, pd: { f: 5, amp: 1.4, h2: 0.35, fm: 0.15, jit: 0.4, noise: 0.05, ampMod: 0.2 }, ot: { f: 15.5, amp: 0.6, h2: 0.05, fm: 0.2, jit: 0.3, noise: 0.06, ampMod: 0.15 }, ept: { f: 10, amp: 0.15, h2: 0, fm: 1.5, jit: 2.0, noise: 0.08, ampMod: 0.5 }, dt: { f: 6, amp: 0.7, h2: 0.08, fm: 1.2, jit: 2.2, noise: 0.06, ampMod: 0.6 }, none: { f: 0, amp: 0, h2: 0, fm: 0, jit: 0, noise: 0.12, ampMod: 0 } }; const P = PROFILES[profile] || PROFILES.et;
    const out = []; let t = 0, ph = 0, f = P.f, ampEnv = 1;
    const dir = [0.75, 0.55, 0.37];
    while (t < seconds) {
      const dt = (1 / fs) * (1 + 0.08 * (r() - 0.5));
      ampEnv += 0.05 * g() * Math.sqrt(dt) * P.ampMod * 10; ampEnv = Math.min(1.6, Math.max(0.3, ampEnv));
      const trem = P.amp * ampEnv * (Math.sin(ph) + P.h2 * Math.sin(2 * ph));
      out.push({ t, x: trem * dir[0] + P.noise * g(), y: trem * dir[1] + P.noise * g(), z: 9.81 + trem * dir[2] + P.noise * g() });
      ph += 2 * Math.PI * f * dt + (P.jit || 0) * g() * Math.sqrt(dt); if (P.fm) { f += P.fm * g() * Math.sqrt(dt); f = Math.min(P.f + 1.5, Math.max(P.f - 1.5, f)); }
      t += dt;
    }
    return out;
  }
  function runDemo() {
    setPhase('collecting'); $('statusDetail').textContent = 'Gerando sinal simulado…';
    const profile = $('demoProfile').value;
    const samples = demoSamples(profile, currentDuration() + 1);
    state.samples = samples; state.preview = samples.slice(-300).map(s => Object.assign({}, s, { v: s.x }));
    CH.drawLive($('liveCanvas'), state.preview, 4, CH.theme());
    setTimeout(() => { setPhase('analyzing'); setTimeout(() => analyze(samples, readProtocol(), profile), 60); }, 300);
  }

  // ---------------------------------------------------------------------
  // Análise e renderização
  // ---------------------------------------------------------------------
  function analyze(samples, protocol, demoProfile) {
    try {
      const sig = DSP.buildSignal(samples, protocol.axisMode);
      const R = DSP.analyze(Array.from(sig.times), Array.from(sig.values));
      R.axisInfo = sig.axisInfo;
      samples.forEach((s, i) => { s.v = sig.values[i]; });
      const interpretation = INTERP.interpret(R, protocol);
      const session = {
        id: Math.random().toString(36).slice(2, 8).toUpperCase() + '-' + Date.now().toString(36).toUpperCase(),
        createdAt: new Date().toISOString(), appVersion: APP_VERSION,
        source: state.source, demoProfile: demoProfile ? $('demoProfile').options[$('demoProfile').selectedIndex].text : null,
        patient: { id: protocol.patientId }, protocol, samples, axisInfo: sig.axisInfo, results: R, interpretation,
        sensor: { linear: state.sensor.linear }, device: { ua: navigator.userAgent, platform: navigator.platform || '', standalone: window.matchMedia && window.matchMedia('(display-mode: standalone)').matches },
      };
      state.session = session; state.reportHtml = null; state.reportImages = null;
      render(session);
      setPhase('done', { detail: R.metrics.detected ? `Pico em ${fmt(R.metrics.peakFreq, 1)} Hz · TSI ${fmt(R.metrics.tsi)}` : 'Sem tremor rítmico detectado' });
      $('results').hidden = false; $('dock').classList.add('show');
      setTimeout(() => $('results').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      console.error(err);
      setPhase('error', { text: 'Falha na análise', detail: err.message || String(err) });
      $('btnAction').disabled = false; $('btnAction').textContent = 'Tentar novamente';
      state.phase = state.source === 'demo' ? 'error' : 'idle';
      toast('Erro: ' + (err.message || err));
    }
  }

  function render(session) {
    const R = session.results, m = R.metrics, it = session.interpretation, p = session.protocol;
    $('resultStamp').textContent = new Date(session.createdAt).toLocaleString('pt-BR');
    // chips
    const chips = [];
    if (session.source === 'demo') chips.push(['danger', 'SIMULAÇÃO']);
    chips.push(['info', INTERP.CONDITIONS[p.condition] + ' · ' + INTERP.SEGMENTS[p.segment] + (INTERP.sideText(p.segment, p.side) ? ' ' + INTERP.sideText(p.segment, p.side) : '')]);
    chips.push([m.detected ? 'ok' : 'warn', m.detected ? `Pico ${fmt(m.peakFreq, 1)} Hz` : 'Sem pico significativo']);
    if (it.hypotheses && it.hypotheses.length) chips.push(['info', `${it.hypotheses[0].label} · ${it.hypotheses[0].confidence}`]);
    $('summaryChips').innerHTML = chips.map(([c, t]) => `<span class="chip ${c}">${esc(t)}</span>`).join('');
    $('summaryText').textContent = it.summary;
    const warns = (R.warnings || []);
    $('warningsBox').hidden = !warns.length; $('warningsBox').innerHTML = warns.map(w => `<div>⚠︎ ${esc(w)}</div>`).join('');
    // tiles
    const tiles = [
      ['Frequência de pico', fmt(m.peakFreq, 1), 'Hz', `FWHM ${fmt(m.fwhm)} Hz`],
      ['TSI', fmt(m.tsi), '', m.tsiCycles ? `${m.tsiCycles} ciclos · corte 1,05` : 'não calculado'],
      ['Irregularidade', fmt(m.instFreqCv * 100, 0), '%', `CV da freq. instantânea (DP ${fmt(m.instFreqSd)} Hz)`],
      ['Razão harmônica', fmt(m.harmonicRatio, 3), '', 'potência 2f–4f / f'],
      ['Amplitude RMS', fmt(m.rms, 3), 'm/s²', `log₁₀ ${fmt(m.logRms)} · ≈ ${fmt(m.displacementMm, 2)} mm no pico`],
      ['Potência relativa', fmt(m.relPeakPower), '', `pico/fundo ${fmt(m.snrDb, 1)} dB`],
      ['Persistência', fmt(m.persistence * 100, 0), '%', 'janelas de 3 s com tremor'],
      ['Entropia espectral', fmt(m.spectralEntropy), '', '0 = tom puro · 1 = ruído'],
      ['Jerk normalizado', fmt(m.normalizedJerk), '', '≈ 1 para senoide'],
      ['DP do pico (janelas)', fmt(m.windowPeakSd), 'Hz', 'variabilidade temporal'],
      ['CV da amplitude', fmt(m.amplitudeCv * 100, 0), '%', 'envelope de Hilbert'],
      ['Amostragem', fmt(R.sampling.fs, 0), 'Hz', `${fmt(R.sampling.duration, 0)} s analisados · jitter ${fmt(R.sampling.jitter * 100, 0)}%`],
    ];
    $('stats').innerHTML = tiles.map(([k, v, u, s]) => `<div class="stat"><div class="k">${esc(k)}</div><div class="v">${esc(v)}${u ? `<small>${esc(u)}</small>` : ''}</div><div class="s">${esc(s)}</div></div>`).join('');
    // gráficos
    if (!state.charts) state.charts = CH.create({ time: 'chartTime', psd: 'chartPSD', inst: 'chartInst', spec: 'chartSpec' });
    state.charts.update(R);
    // interpretação
    const maxScore = it.hypotheses.length ? Math.max(5, it.hypotheses[0].score) : 5;
    $('hypotheses').innerHTML = it.hypotheses.length ? it.hypotheses.map((h, i) => `
      <details class="hyp-item" ${i === 0 ? 'open' : ''}>
        <summary><span class="t-headline" style="min-width:150px">${esc(h.label)}</span><div class="bar"><div style="width:${Math.min(100, h.score / maxScore * 100)}%"></div></div><span class="chip ${h.confidence === 'alta' ? 'ok' : h.confidence === 'moderada' ? 'info' : ''}">${esc(h.confidence)}</span></summary>
        <ul>${h.evidence.map(e => `<li class="${e.dir === '+' ? 'ev-plus' : e.dir === '−' ? 'ev-minus' : ''}"><b>${e.dir}</b> ${esc(e.text)}${e.ref ? ` <span class="t-tertiary">(${esc(e.ref)})</span>` : ''}</li>`).join('')}</ul>
      </details>`).join('') : `<div class="callout">${esc(it.status === 'not_detected' ? 'Nenhum tremor rítmico significativo foi detectado; não há hipótese sindrômica a apresentar.' : 'O padrão não se enquadra claramente em uma síndrome definida; correlacionar com o exame clínico.')}</div>`;
    $('flags').innerHTML = (it.flags || []).map(f => `<div class="callout warn"><b>${esc(f.label)}.</b> ${esc(f.text)}</div>`).join('');
    $('findings').innerHTML = (it.findings || []).map(f => `<div class="finding ${f.level}"><div class="f-label">${esc(f.label)}</div><div>${esc(f.text)}</div></div>`).join('');
    $('suggestions').innerHTML = it.suggestions && it.suggestions.length ? `<p class="t-headline mt-8">Para completar a avaliação</p><ul class="t-subhead t-secondary" style="padding-left:18px;margin:6px 0 0">${it.suggestions.map(s => `<li style="margin:4px 0">${esc(s)}</li>`).join('')}</ul>` : '';
    $('qualityTable').innerHTML = REP.qualityRows(session).map(([k, v]) => `<tr><th style="width:38%">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function resetApp() {
    state.session = null; state.samples = []; state.reportHtml = null; state.reportImages = null;
    $('results').hidden = true; $('dock').classList.remove('show');
    if (state.charts) state.charts.clear();
    setPhase(state.source === 'demo' ? 'idle' : (state.sensor.events ? 'idle' : 'error'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------------------------------------------------------------
  // Relatório e exportações
  // ---------------------------------------------------------------------
  function reportImages() { if (!state.reportImages) state.reportImages = CH.renderForReport(state.session.results); return state.reportImages; }
  function reportHtml() { if (!state.reportHtml) state.reportHtml = REP.htmlReport(state.session, reportImages().jpg); return state.reportHtml; }
  function showReport() {
    if (!state.session) return;
    const frame = $('reportFrame'); frame.srcdoc = reportHtml();
    openSheet('sheetReport');
  }
  async function doExport(kind) {
    const s = state.session; if (!s) return;
    const base = REP.baseName(s);
    try {
      switch (kind) {
        case 'pdf': { const doc = REP.pdfReport(s, reportImages().jpg); doc.save(base + '.pdf'); toast('PDF gerado'); break; }
        case 'html': REP.download(new Blob([reportHtml()], { type: 'text/html;charset=utf-8' }), base + '_relatorio.html'); break;
        case 'json': REP.download(new Blob([REP.jsonSession(s, true)], { type: 'application/json' }), base + '.json'); break;
        case 'csv-metrics': REP.download(new Blob([REP.csvMetrics(s)], { type: 'text/csv;charset=utf-8' }), base + '_metricas.csv'); break;
        case 'csv-raw': REP.download(new Blob([REP.csvRaw(s)], { type: 'text/csv;charset=utf-8' }), base + '_sinal.csv'); break;
        case 'csv-psd': REP.download(new Blob([REP.csvSpectrum(s)], { type: 'text/csv;charset=utf-8' }), base + '_espectro.csv'); break;
        case 'png': { const im = reportImages().png; const names = { time: 'sinal', psd: 'psd', spec: 'espectrograma', inst: 'freq_instantanea' }; for (const k of Object.keys(names)) { REP.download(REP.dataUrlToBlob(im[k]), `${base}_${names[k]}.png`); await new Promise(r => setTimeout(r, 350)); } break; }
        case 'share': {
          const doc = REP.pdfReport(s, reportImages().jpg); const blob = doc.output('blob');
          const file = new File([blob], base + '.pdf', { type: 'application/pdf' });
          const ok = await REP.share([file], 'Relatório TremorPSD', s.interpretation.summary).catch(() => false);
          if (!ok) { REP.download(blob, base + '.pdf'); toast('Compartilhamento indisponível; PDF baixado.'); }
          break;
        }
        case 'print': { showReport(); setTimeout(() => { try { $('reportFrame').contentWindow.print(); } catch (e) { window.print(); } }, 400); break; }
      }
    } catch (err) { console.error(err); toast('Falha ao exportar: ' + (err.message || err)); }
  }

  // ---------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------
  function enterApp(source) {
    state.source = source;
    $('hero').classList.add('leaving'); setTimeout(() => { $('hero').hidden = true; }, 350);
    $('app').hidden = false;
    $('sourceChip').textContent = source === 'demo' ? 'Simulação' : 'Sensor';
    $('sourceChip').className = 'chip ' + (source === 'demo' ? 'danger' : 'info');
    $('demoRow').hidden = source !== 'demo';
    if (source === 'demo') { setPhase('idle'); $('rateChip').textContent = '60 Hz (sim.)'; }
    else { setPhase('init'); startSensor(); }
  }
  async function onStart() {
    if (!secureContext()) { $('heroNote').textContent = 'Os sensores exigem HTTPS (ou localhost). Abra o app por um endereço seguro — ou use o modo demonstração.'; toast('Contexto inseguro: use HTTPS'); return; }
    const perm = await requestPermission();
    if (perm === 'unsupported') { $('heroNote').textContent = 'Este navegador não expõe o acelerômetro (DeviceMotion). Use um smartphone/tablet ou o modo demonstração.'; return; }
    if (perm === 'denied') { $('heroNote').textContent = 'Permissão negada. No iOS: Ajustes › Safari › Movimento e orientação; depois recarregue a página.'; return; }
    enterApp('sensor');
  }
  function init() {
    initTheme(); initPwa();
    initSegmented('condition', updatePlacementHint); initSegmented('side'); initSegmented('durationPresets', (v) => { $('duration').value = v; });
    $('duration').addEventListener('change', () => { const v = currentDuration(); $('duration').value = v; setSegmented('durationPresets', String(v)); });
    $('segment').addEventListener('change', updatePlacementHint);
    loadProtocol(); updatePlacementHint();
    $('btnStart').addEventListener('click', onStart);
    $('btnDemo').addEventListener('click', () => enterApp('demo'));
    $('btnAction').addEventListener('click', handleAction);
    $('btnReset').addEventListener('click', resetApp);
    $('btnInfo').addEventListener('click', () => openSheet('sheetInfo'));
    $('btnInfo2').addEventListener('click', () => openSheet('sheetInfo'));
    $('btnExport').addEventListener('click', () => openSheet('sheetExport'));
    $('btnReport').addEventListener('click', showReport);
    $('btnReportPrint').addEventListener('click', () => { try { $('reportFrame').contentWindow.focus(); $('reportFrame').contentWindow.print(); } catch (e) { window.print(); } });
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
    $('sheetBackdrop').addEventListener('click', closeSheets);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });
    document.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => doExport(b.dataset.export)));
    // Auto-início se já houver permissão implícita (Android) e o usuário abriu via atalho
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'new' && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission !== 'function' && secureContext()) enterApp('sensor');
    window.TremorApp = { state, analyze, demoSamples, enterApp, doExport, version: APP_VERSION };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
