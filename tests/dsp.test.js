// Testes do módulo DSP com sinais sintéticos: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const DSP = require('../js/dsp.js');

// Gerador determinístico (LCG) para reprodutibilidade
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { const u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** Sinal sintético com timestamps jitterados (como DeviceMotion). */
function synth({ fs = 60, seconds = 30, freq = 6, amp = 1, noise = 0.05, jitter = 0.1, harmonic2 = 0, fm = 0, seed = 1, gravity = 9.81 }) {
  const r = rng(seed);
  const times = [], values = [];
  let t = 0, phase = 0, f = freq;
  const dt0 = 1 / fs;
  while (t < seconds) {
    times.push(t);
    const inst = fm ? f : freq;
    values.push(gravity + amp * Math.sin(phase) + harmonic2 * amp * Math.sin(2 * phase) + noise * gauss(r));
    const dt = dt0 * (1 + jitter * (r() - 0.5) * 2);
    phase += 2 * Math.PI * inst * dt;
    if (fm) { f += fm * gauss(r) * Math.sqrt(dt); f = Math.min(freq + 2, Math.max(freq - 2, f)); }
    t += dt;
  }
  return { times, values };
}

test('senoide 6 Hz: pico, TSI≈0, jerk≈1, harmônicos≈0, tremor detectado', () => {
  const { times, values } = synth({ freq: 6, amp: 1, noise: 0.05 });
  const R = DSP.analyze(times, values);
  const m = R.metrics;
  assert.ok(m.detected, 'tremor deve ser detectado');
  assert.ok(Math.abs(m.peakFreq - 6) < 0.1, 'pico ' + m.peakFreq);
  assert.ok(m.tsi < 0.3, 'TSI ' + m.tsi);
  assert.ok(m.instFreqCv < 0.05, 'CV ' + m.instFreqCv);
  assert.ok(Math.abs(m.normalizedJerk - 1) < 0.15, 'jerk ' + m.normalizedJerk);
  assert.ok(m.harmonicRatio < 0.05, 'harm ' + m.harmonicRatio);
  assert.ok(m.relPeakPower > 0.8, 'rel ' + m.relPeakPower);
  assert.ok(m.spectralEntropy < 0.4, 'entropia ' + m.spectralEntropy);
  assert.ok(m.persistence > 0.95, 'persistência ' + m.persistence);
  assert.ok(Math.abs(m.rms - 1 / Math.SQRT2) < 0.05, 'rms ' + m.rms);
  assert.ok(m.fwhm > 0 && m.fwhm < 0.6, 'fwhm ' + m.fwhm);
  // deslocamento: A/(2πf)^2 = 1/(2π·6)^2 m = 0.703 mm
  assert.ok(Math.abs(m.displacementMm - 0.703) < 0.08, 'desloc ' + m.displacementMm);
  assert.equal(R.spectrum.resolution <= 0.26, true);
});

test('5 Hz com 2º harmônico (30%): razão harmônica ≈ 0,09', () => {
  const { times, values } = synth({ freq: 5, amp: 1, harmonic2: 0.3, noise: 0.03, seed: 7 });
  const m = DSP.analyze(times, values).metrics;
  assert.ok(Math.abs(m.peakFreq - 5) < 0.1, 'pico ' + m.peakFreq);
  assert.ok(m.harmonicRatio > 0.06 && m.harmonicRatio < 0.13, 'harm ' + m.harmonicRatio);
  assert.ok(m.harmonics[0].harmonic === 2);
});

test('15 Hz (faixa ortostática) a 60 Hz de amostragem', () => {
  const { times, values } = synth({ freq: 15, amp: 0.5, noise: 0.05, seed: 3 });
  const m = DSP.analyze(times, values).metrics;
  assert.ok(m.detected);
  assert.ok(Math.abs(m.peakFreq - 15) < 0.15, 'pico ' + m.peakFreq);
});

test('modulação de frequência aleatória eleva TSI e CV', () => {
  const a = DSP.analyze(...Object.values(synth({ freq: 6, fm: 0, seed: 11 }))).metrics;
  const b = DSP.analyze(...Object.values(synth({ freq: 6, fm: 1.2, seed: 11 }))).metrics;
  assert.ok(b.tsi > a.tsi * 3, `TSI estável ${a.tsi} vs instável ${b.tsi}`);
  assert.ok(b.instFreqCv > a.instFreqCv * 3, `CV ${a.instFreqCv} vs ${b.instFreqCv}`);
  assert.ok(b.tsi > 0.3, 'TSI instável deve ser > 0,3: ' + b.tsi);
});

test('ruído branco: tremor não detectado, entropia alta', () => {
  const { times, values } = synth({ amp: 0, noise: 0.3, seed: 5 });
  const R = DSP.analyze(times, values);
  assert.equal(R.metrics.detected, false);
  assert.ok(R.metrics.spectralEntropy > 0.85, 'entropia ' + R.metrics.spectralEntropy);
  assert.ok(R.metrics.persistence < 0.3, 'persistência ' + R.metrics.persistence);
});

test('tremor intermitente: persistência ≈ 50%', () => {
  const s = synth({ freq: 6, amp: 1, noise: 0.05, seed: 9, seconds: 40 });
  // zera o tremor na segunda metade (mantém ruído)
  const r = rng(2);
  for (let i = 0; i < s.times.length; i++) if (s.times[i] > 20) s.values[i] = 9.81 + 0.05 * gauss(r);
  const m = DSP.analyze(s.times, s.values).metrics;
  assert.ok(m.persistence > 0.35 && m.persistence < 0.65, 'persistência ' + m.persistence);
  assert.ok(m.detected);
});

test('registro curto lança erro claro; jitter alto gera aviso', () => {
  const s = synth({ seconds: 5 });
  assert.throws(() => DSP.analyze(s.times, s.values), /curto/);
  const j = synth({ jitter: 0.8, seed: 4 });
  const R = DSP.analyze(j.times, j.values);
  assert.ok(R.warnings.some(w => /Jitter/.test(w)));
  assert.ok(Math.abs(R.metrics.peakFreq - 6) < 0.15);
});

test('welch: densidade integrada ≈ variância (Parseval)', () => {
  const fs = 100, n = 4000, r = rng(8);
  const x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = gauss(r);
  const W = DSP.welch(x, fs, { nperseg: 400 });
  const total = DSP.bandPower(W.freqs, W.psd, 0, fs / 2, W.df);
  const varx = DSP.rms(x) ** 2;
  assert.ok(Math.abs(total / varx - 1) < 0.15, `Parseval ${total} vs ${varx}`);
});

test('fwhm: interpolação sub-bin em pico gaussiano', () => {
  const freqs = new Float64Array(201), psd = new Float64Array(201);
  for (let i = 0; i < 201; i++) { freqs[i] = i * 0.1; psd[i] = Math.exp(-((freqs[i] - 6) ** 2) / (2 * 0.5 ** 2)); }
  const w = DSP.fwhm(freqs, psd, 60, 1);
  const expected = 2.3548 * 0.5;
  assert.ok(Math.abs(w.fwhm - expected) < 0.03, w.fwhm);
});

test('filtro passa-banda de fase zero preserva amplitude na banda', () => {
  const fs = 60, n = 1800; const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(2 * Math.PI * 6 * i / fs) + 5 * Math.sin(2 * Math.PI * 0.2 * i / fs);
  const y = DSP.bandpass(x, fs, 1, 25);
  const mid = y.subarray(300, 1500);
  assert.ok(Math.abs(DSP.rms(mid) - 1 / Math.SQRT2) < 0.03, DSP.rms(mid));
});

test('PCA recupera a frequência do tremor (a magnitude vetorial dobraria)', () => {
  const fs = 60, r = rng(21), samples = [];
  for (let i = 0; i < fs * 30; i++) {
    const t = i / fs;
    const trem = Math.sin(2 * Math.PI * 6 * t);
    // tremor ao longo de um eixo oblíquo (x e y), gravidade em z, aceleração linear (sem g)
    samples.push({ t, x: 0.8 * trem + 0.03 * gauss(r), y: 0.6 * trem + 0.03 * gauss(r), z: 0.03 * gauss(r) });
  }
  const sig = DSP.buildSignal(samples, 'auto');
  assert.ok(sig.axisInfo.explained > 0.95, 'variância explicada ' + sig.axisInfo.explained);
  assert.ok(Math.abs(sig.axisInfo.vector[0] - 0.8) < 0.05 && Math.abs(sig.axisInfo.vector[1] - 0.6) < 0.05);
  const m = DSP.analyze(Array.from(sig.times), Array.from(sig.values)).metrics;
  assert.ok(Math.abs(m.peakFreq - 6) < 0.1, 'PCA pico ' + m.peakFreq);
  const norm = DSP.buildSignal(samples, 'norm');
  const mn = DSP.analyze(Array.from(norm.times), Array.from(norm.values)).metrics;
  assert.ok(Math.abs(mn.peakFreq - 12) < 0.2, 'magnitude retificada dobra a frequência: ' + mn.peakFreq);
});
