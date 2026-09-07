/*
 * TremorPSD — módulo de processamento de sinais (DSP)
 * ----------------------------------------------------
 * Implementa as métricas descritas em docs/LITERATURA.md.
 * Módulo puro (sem DOM) para permitir testes em Node (tests/dsp.test.js).
 *
 * Convenções:
 *  - aceleração em m/s², tempo em segundos, frequência em Hz
 *  - PSD em (m/s²)²/Hz (densidade unilateral)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TremorDSP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    bandLow: 2,          // Hz — limite inferior da banda de tremor analisada
    bandHigh: 25,        // Hz — limite superior da banda de tremor analisada
    hpCutoff: 1,         // Hz — passa-alta (remove gravidade residual e deriva)
    lpCutoff: 30,        // Hz — passa-baixa (anti-ruído)
    welchSeconds: 4,     // s — comprimento do segmento de Welch
    welchPadFactor: 4,   // zero-padding (nfft = nextpow2(nperseg * fator))
    windowSeconds: 3,    // s — janelas do espectrograma / detecção de tremor (Luft 2019)
    windowStepSeconds: 1,
    peakHalfWidth: 0.5,  // Hz — meia-largura para potência relativa do pico (Luft 2019)
    detectRelPower: 0.30,// fração da potência da banda em ±0,5 Hz para considerar "tremor"
    detectSnrDb: 6,      // dB — pico vs mediana da banda
    discardSeconds: 1,   // s — descarte inicial (toque no botão / acomodação)
    tsiHalfBand: 2,      // Hz — passa-banda f_pico ± 2 Hz para a frequência instantânea (di Biase 2017)
    tsiPeakLow: 2, tsiPeakHigh: 9, // Hz — faixa de busca do pico usada por di Biase 2017 para o TSI
  };

  // ---------------------------------------------------------------------
  // Estatística básica
  // ---------------------------------------------------------------------
  function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function std(a) {
    if (a.length < 2) return 0;
    const m = mean(a); let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - m; s += d * d; }
    return Math.sqrt(s / (a.length - 1));
  }
  function rms(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return a.length ? Math.sqrt(s / a.length) : 0; }
  function percentile(a, p) {
    if (!a.length) return NaN;
    const s = Array.from(a).sort((x, y) => x - y);
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  }
  function median(a) { return percentile(a, 0.5); }
  function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

  // ---------------------------------------------------------------------
  // Pré-processamento
  // ---------------------------------------------------------------------
  /** Estima a taxa de amostragem global e o jitter a partir dos timestamps. */
  function samplingStats(times) {
    const n = times.length;
    if (n < 2) return { fs: 0, jitter: 0, maxGap: 0, duration: 0 };
    const duration = times[n - 1] - times[0];
    const fs = (n - 1) / duration;
    const dts = new Float64Array(n - 1);
    let maxGap = 0;
    for (let i = 1; i < n; i++) { dts[i - 1] = times[i] - times[i - 1]; if (dts[i - 1] > maxGap) maxGap = dts[i - 1]; }
    const m = mean(dts);
    const jitter = m > 0 ? std(dts) / m : 0;
    return { fs, jitter, maxGap, duration };
  }

  /** Reamostra (interpolação linear) para grade uniforme na taxa fs. */
  function resampleUniform(times, values, fs) {
    const n = times.length;
    const t0 = times[0], t1 = times[n - 1];
    const m = Math.floor((t1 - t0) * fs) + 1;
    const out = new Float64Array(m);
    let j = 0;
    for (let i = 0; i < m; i++) {
      const t = t0 + i / fs;
      while (j < n - 2 && times[j + 1] < t) j++;
      const ta = times[j], tb = times[j + 1];
      const w = tb > ta ? (t - ta) / (tb - ta) : 0;
      out[i] = values[j] + (values[j + 1] - values[j]) * Math.min(1, Math.max(0, w));
    }
    return out;
  }

  /** Remove tendência linear (mínimos quadrados). */
  function detrendLinear(x) {
    const n = x.length; if (n < 2) return Float64Array.from(x);
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += x[i]; sxx += i * i; sxy += i * x[i]; }
    const den = n * sxx - sx * sx;
    const b = den !== 0 ? (n * sxy - sx * sy) / den : 0;
    const a = (sy - b * sx) / n;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = x[i] - (a + b * i);
    return out;
  }

  /** Coeficientes de biquad Butterworth (2ª ordem) via transformada bilinear. */
  function biquad(type, fc, fs) {
    const K = Math.tan(Math.PI * fc / fs);
    const Q = Math.SQRT1_2;
    const norm = 1 / (1 + K / Q + K * K);
    let b0, b1, b2;
    if (type === 'low') { b0 = K * K * norm; b1 = 2 * b0; b2 = b0; }
    else { b0 = norm; b1 = -2 * norm; b2 = norm; }
    const a1 = 2 * (K * K - 1) * norm;
    const a2 = (1 - K / Q + K * K) * norm;
    return { b0, b1, b2, a1, a2 };
  }
  function iirApply(x, c) {
    const y = new Float64Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  /** Filtragem de fase zero (forward-backward) com extensão ímpar nas bordas. */
  function filtfilt(x, c, padlen) {
    const n = x.length;
    padlen = Math.min(padlen || 0, n - 1);
    const ext = new Float64Array(n + 2 * padlen);
    for (let i = 0; i < padlen; i++) ext[i] = 2 * x[0] - x[padlen - i];
    for (let i = 0; i < n; i++) ext[padlen + i] = x[i];
    for (let i = 0; i < padlen; i++) ext[padlen + n + i] = 2 * x[n - 1] - x[n - 2 - i];
    let y = iirApply(ext, c);
    y.reverse(); y = iirApply(y, c); y.reverse();
    return y.slice(padlen, padlen + n);
  }
  function highpass(x, fs, fc) { return filtfilt(x, biquad('high', fc, fs), Math.round(fs)); }
  function lowpass(x, fs, fc) { return filtfilt(x, biquad('low', fc, fs), Math.round(fs)); }
  function bandpass(x, fs, lo, hi) {
    let y = x;
    if (lo > 0) y = highpass(y, fs, lo);
    if (hi > 0 && hi < fs / 2) y = lowpass(y, fs, hi);
    return y;
  }


  // ---------------------------------------------------------------------
  // Seleção de eixo: componente principal (PCA) das três componentes
  // ---------------------------------------------------------------------
  /**
   * Projeta o sinal triaxial no eixo de maior variância (1º componente principal).
   * Preserva o sinal (e portanto a frequência) da oscilação, ao contrário da
   * magnitude vetorial |a|, que retifica o sinal e dobra a frequência aparente.
   * As componentes devem estar sem gravidade/deriva (passa-alta) antes da PCA.
   */
  function principalAxis(xs, ys, zs) {
    const n = Math.min(xs.length, ys.length, zs.length);
    const mx = mean(xs), my = mean(ys), mz = mean(zs);
    let cxx = 0, cyy = 0, czz = 0, cxy = 0, cxz = 0, cyz = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx, b = ys[i] - my, c = zs[i] - mz;
      cxx += a * a; cyy += b * b; czz += c * c; cxy += a * b; cxz += a * c; cyz += b * c;
    }
    const C = [[cxx, cxy, cxz], [cxy, cyy, cyz], [cxz, cyz, czz]];
    let v = [1, 1, 1];
    for (let it = 0; it < 200; it++) {
      const w = [C[0][0] * v[0] + C[0][1] * v[1] + C[0][2] * v[2], C[1][0] * v[0] + C[1][1] * v[1] + C[1][2] * v[2], C[2][0] * v[0] + C[2][1] * v[1] + C[2][2] * v[2]];
      const norm = Math.hypot(w[0], w[1], w[2]) || 1;
      const nv = [w[0] / norm, w[1] / norm, w[2] / norm];
      const diff = Math.abs(nv[0] - v[0]) + Math.abs(nv[1] - v[1]) + Math.abs(nv[2] - v[2]);
      v = nv; if (diff < 1e-10) break;
    }
    // orientação determinística: maior componente positiva
    const k = [0, 1, 2].reduce((a, b) => Math.abs(v[a]) >= Math.abs(v[b]) ? a : b);
    if (v[k] < 0) v = v.map(q => -q);
    const proj = new Float64Array(n);
    for (let i = 0; i < n; i++) proj[i] = (xs[i] - mx) * v[0] + (ys[i] - my) * v[1] + (zs[i] - mz) * v[2];
    const total = cxx + cyy + czz;
    const lambda = v[0] * (C[0][0] * v[0] + C[0][1] * v[1] + C[0][2] * v[2]) + v[1] * (C[1][0] * v[0] + C[1][1] * v[1] + C[1][2] * v[2]) + v[2] * (C[2][0] * v[0] + C[2][1] * v[1] + C[2][2] * v[2]);
    return { vector: v, projected: proj, explained: total > 0 ? lambda / total : 1 };
  }

  /**
   * Constrói o sinal 1-D a partir das amostras triaxiais conforme o modo:
   *  'auto' (PCA das componentes passa-alta), 'x' | 'y' | 'z', ou 'norm' (|a| — legado).
   * `samples`: [{t, x, y, z}] em grade não uniforme; retorna { times, values, axisInfo }.
   */
  function buildSignal(samples, mode, fsHint) {
    const n = samples.length;
    const times = new Float64Array(n), xs = new Float64Array(n), ys = new Float64Array(n), zs = new Float64Array(n);
    for (let i = 0; i < n; i++) { times[i] = samples[i].t; xs[i] = samples[i].x; ys[i] = samples[i].y; zs[i] = samples[i].z; }
    const values = new Float64Array(n);
    let axisInfo = { mode };
    if (mode === 'x' || mode === 'y' || mode === 'z') {
      const src = mode === 'x' ? xs : mode === 'y' ? ys : zs;
      values.set(src);
    } else if (mode === 'norm') {
      for (let i = 0; i < n; i++) values[i] = Math.hypot(xs[i], ys[i], zs[i]);
    } else {
      const fs = fsHint || samplingStats(times).fs;
      const hx = highpass(xs, fs, DEFAULTS.hpCutoff), hy = highpass(ys, fs, DEFAULTS.hpCutoff), hz = highpass(zs, fs, DEFAULTS.hpCutoff);
      const p = principalAxis(hx, hy, hz);
      values.set(p.projected);
      axisInfo = { mode: 'auto', vector: p.vector, explained: p.explained };
    }
    return { times, values, axisInfo };
  }

  // ---------------------------------------------------------------------
  // FFT / Welch
  // ---------------------------------------------------------------------
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < half; j++) {
          const ar = re[i + j], ai = im[i + j];
          const br = re[i + j + half] * cr - im[i + j + half] * ci;
          const bi = re[i + j + half] * ci + im[i + j + half] * cr;
          re[i + j] = ar + br; im[i + j] = ai + bi;
          re[i + j + half] = ar - br; im[i + j + half] = ai - bi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  function ifft(re, im) {
    const n = re.length;
    for (let i = 0; i < n; i++) im[i] = -im[i];
    fft(re, im);
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
  }
  function hannPeriodic(n) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / n));
    return w;
  }

  /** Periodograma de um segmento janelado (Hann), unilateral, escala densidade. */
  function periodogram(seg, fs, nfft, win) {
    const n = seg.length;
    const re = new Float64Array(nfft), im = new Float64Array(nfft);
    let wss = 0;
    for (let i = 0; i < n; i++) { re[i] = seg[i] * win[i]; wss += win[i] * win[i]; }
    fft(re, im);
    const half = nfft / 2 + 1;
    const psd = new Float64Array(half);
    const scale = 1 / (fs * wss);
    for (let k = 0; k < half; k++) {
      let v = (re[k] * re[k] + im[k] * im[k]) * scale;
      if (k > 0 && k < half - 1) v *= 2;
      psd[k] = v;
    }
    return psd;
  }

  /** Estimativa de Welch (Hann, 50% de sobreposição, zero-padding). */
  function welch(x, fs, opts) {
    opts = opts || {};
    const n = x.length;
    let nperseg = Math.min(opts.nperseg || Math.round(fs * DEFAULTS.welchSeconds), n);
    const noverlap = Math.floor(nperseg / 2);
    const step = Math.max(1, nperseg - noverlap);
    const nfft = nextPow2(nperseg * (opts.padFactor || DEFAULTS.welchPadFactor));
    const win = hannPeriodic(nperseg);
    const half = nfft / 2 + 1;
    const psd = new Float64Array(half);
    let nseg = 0;
    for (let s = 0; s + nperseg <= n; s += step) {
      const p = periodogram(x.subarray(s, s + nperseg), fs, nfft, win);
      for (let k = 0; k < half; k++) psd[k] += p[k];
      nseg++;
    }
    if (nseg === 0) { // sinal mais curto que um segmento
      const p = periodogram(x, fs, nfft, hannPeriodic(n));
      for (let k = 0; k < half; k++) psd[k] = p[k];
      nseg = 1;
    }
    for (let k = 0; k < half; k++) psd[k] /= nseg;
    const freqs = new Float64Array(half);
    const df = fs / nfft;
    for (let k = 0; k < half; k++) freqs[k] = k * df;
    return { freqs, psd, df, nperseg, nfft, nseg, resolution: fs / nperseg };
  }

  // ---------------------------------------------------------------------
  // Métricas espectrais
  // ---------------------------------------------------------------------
  function indexRange(freqs, f1, f2) {
    let i1 = 0; while (i1 < freqs.length && freqs[i1] < f1) i1++;
    let i2 = freqs.length - 1; while (i2 > 0 && freqs[i2] > f2) i2--;
    return [i1, i2];
  }
  /** Potência integrada (regra do retângulo, largura df) entre f1 e f2. */
  function bandPower(freqs, psd, f1, f2, df) {
    const [i1, i2] = indexRange(freqs, f1, f2);
    let s = 0; for (let k = i1; k <= i2; k++) s += psd[k];
    return s * df;
  }
  /** Pico com interpolação parabólica em [f1, f2]. */
  function findPeak(freqs, psd, f1, f2, df) {
    const [i1, i2] = indexRange(freqs, f1, f2);
    let idx = -1, best = -Infinity;
    for (let k = i1; k <= i2; k++) if (psd[k] > best) { best = psd[k]; idx = k; }
    if (idx < 0) return null;
    let freq = freqs[idx], power = psd[idx];
    if (idx > 0 && idx < psd.length - 1) {
      const a = psd[idx - 1], b = psd[idx], c = psd[idx + 1];
      const den = a - 2 * b + c;
      if (den !== 0) {
        const p = 0.5 * (a - c) / den;
        if (Math.abs(p) <= 1) { freq = freqs[idx] + p * df; power = b - 0.25 * (a - c) * p; }
      }
    }
    return { idx, freq, power };
  }
  /** Largura à meia altura com interpolação linear das travessias. */
  function fwhm(freqs, psd, idx, peakPower) {
    const half = (peakPower || psd[idx]) / 2;
    let l = idx; while (l > 0 && psd[l] > half) l--;
    let r = idx; while (r < psd.length - 1 && psd[r] > half) r++;
    let fl = freqs[l], fr = freqs[r];
    if (l < idx && psd[l + 1] !== psd[l]) fl = freqs[l] + (half - psd[l]) / (psd[l + 1] - psd[l]) * (freqs[l + 1] - freqs[l]);
    if (r > idx && psd[r - 1] !== psd[r]) fr = freqs[r - 1] + (half - psd[r - 1]) / (psd[r] - psd[r - 1]) * (freqs[r] - freqs[r - 1]);
    return { fwhm: Math.max(0, fr - fl), fLeft: fl, fRight: fr, open: (l === 0 || r === psd.length - 1) };
  }
  /** Entropia espectral normalizada (0 = tom puro; 1 = espectro plano) na banda. */
  function spectralEntropy(freqs, psd, f1, f2) {
    const [i1, i2] = indexRange(freqs, f1, f2);
    let tot = 0; for (let k = i1; k <= i2; k++) tot += psd[k];
    if (tot <= 0) return NaN;
    let h = 0, nb = 0;
    for (let k = i1; k <= i2; k++) { const p = psd[k] / tot; if (p > 0) h -= p * Math.log2(p); nb++; }
    return nb > 1 ? h / Math.log2(nb) : 0;
  }
  /** Razão harmônica: potência em 2f..4f (±hw) dividida pela potência no fundamental (±hw). */
  function harmonicRatio(freqs, psd, f0, df, fs, hw) {
    hw = hw || 0.3;
    const fund = bandPower(freqs, psd, f0 - hw, f0 + hw, df);
    let harm = 0, count = 0;
    const perHarmonic = [];
    for (let h = 2; h <= 4; h++) {
      const fh = f0 * h;
      if (fh + hw >= 0.9 * fs / 2) break;
      const p = bandPower(freqs, psd, fh - hw, fh + hw, df);
      perHarmonic.push({ harmonic: h, freq: fh, power: p, ratio: fund > 0 ? p / fund : 0 });
      harm += p; count++;
    }
    return { ratio: fund > 0 ? harm / fund : 0, fundamentalPower: fund, harmonicPower: harm, nHarmonics: count, perHarmonic };
  }

  // ---------------------------------------------------------------------
  // Domínio do tempo: frequência instantânea, TSI, envelope, jerk
  // ---------------------------------------------------------------------
  /** Instantes (em s) dos cruzamentos de zero ascendentes, com interpolação linear. */
  function zeroCrossings(x, fs) {
    const t = [];
    for (let i = 0; i < x.length - 1; i++) {
      if (x[i] < 0 && x[i + 1] >= 0) t.push((i + (-x[i]) / (x[i + 1] - x[i])) / fs);
    }
    return t;
  }
  /**
   * Frequência instantânea ciclo a ciclo e TSI (di Biase et al., Brain 2017):
   * f(n) = 1/(t(n+1)-t(n)); Δf(n) = f(n+1)-f(n); TSI = Q3(Δf) - Q1(Δf).
   * `mask(tCenter)` opcional: retorna true se o ciclo deve ser incluído (janelas com tremor).
   */
  function instantaneousFrequency(xband, fs, mask) {
    const zc = zeroCrossings(xband, fs);
    const f = [], tc = [];
    for (let i = 0; i < zc.length - 1; i++) {
      const per = zc[i + 1] - zc[i];
      if (per <= 0) continue;
      const center = (zc[i] + zc[i + 1]) / 2;
      if (mask && !mask(center)) continue;
      f.push(1 / per); tc.push(center);
    }
    const df = [];
    for (let i = 0; i < f.length - 1; i++) df.push(f[i + 1] - f[i]);
    const tsi = df.length >= 4 ? percentile(df, 0.75) - percentile(df, 0.25) : NaN;
    const m = mean(f);
    return { freqs: f, times: tc, deltaF: df, tsi, meanFreq: m, sdFreq: std(f), cv: m > 0 ? std(f) / m : NaN, nCycles: f.length };
  }
  /** Envelope de amplitude via transformada de Hilbert (FFT). */
  function hilbertEnvelope(x) {
    const n = x.length, nfft = nextPow2(n);
    const re = new Float64Array(nfft), im = new Float64Array(nfft);
    re.set(x);
    fft(re, im);
    for (let k = 0; k < nfft; k++) {
      let h = 0;
      if (k === 0 || k === nfft / 2) h = 1; else if (k < nfft / 2) h = 2;
      re[k] *= h; im[k] *= h;
    }
    ifft(re, im);
    const env = new Float64Array(n);
    for (let i = 0; i < n; i++) env[i] = Math.hypot(re[i], im[i]);
    return env;
  }
  /** Índice de jerk normalizado: RMS(jerk)/(2π·f0·RMS(x)); = 1 para senoide pura em f0. */
  function normalizedJerk(x, fs, f0) {
    if (!(f0 > 0) || x.length < 3) return NaN;
    const j = new Float64Array(x.length - 1);
    for (let i = 0; i < j.length; i++) j[i] = (x[i + 1] - x[i]) * fs;
    const r = rms(x);
    return r > 0 ? rms(j) / (2 * Math.PI * f0 * r) : NaN;
  }

  // ---------------------------------------------------------------------
  // Espectrograma e detecção de tremor por janela (Luft et al., 2019)
  // ---------------------------------------------------------------------
  function spectrogram(x, fs, cfg) {
    const winN = Math.min(x.length, Math.round(cfg.windowSeconds * fs));
    const stepN = Math.max(1, Math.round(cfg.windowStepSeconds * fs));
    const nfft = nextPow2(winN * 4);
    const win = hannPeriodic(winN);
    const df = fs / nfft;
    const half = nfft / 2 + 1;
    const freqs = new Float64Array(half); for (let k = 0; k < half; k++) freqs[k] = k * df;
    const fHi = Math.min(cfg.bandHigh, 0.45 * fs);
    const windows = [];
    for (let s = 0; s + winN <= x.length; s += stepN) {
      const psd = periodogram(x.subarray(s, s + winN), fs, nfft, win);
      const pk = findPeak(freqs, psd, cfg.bandLow, fHi, df);
      const band = bandPower(freqs, psd, cfg.bandLow, fHi, df);
      const around = pk ? bandPower(freqs, psd, pk.freq - cfg.peakHalfWidth, pk.freq + cfg.peakHalfWidth, df) : 0;
      const rel = band > 0 ? around / band : 0;
      const [i1, i2] = indexRange(freqs, cfg.bandLow, fHi);
      const med = median(psd.subarray(i1, i2 + 1));
      const snr = pk && med > 0 ? 10 * Math.log10(pk.power / med) : 0;
      const detected = !!pk && rel >= cfg.detectRelPower && snr >= cfg.detectSnrDb;
      windows.push({ tStart: s / fs, tCenter: (s + winN / 2) / fs, tEnd: (s + winN) / fs, peakFreq: pk ? pk.freq : NaN, peakPower: pk ? pk.power : 0, relPower: rel, snrDb: snr, detected, psd, rmsWindow: rms(x.subarray(s, s + winN)) });
    }
    return { freqs, df, windows, winSeconds: winN / fs };
  }

  // ---------------------------------------------------------------------
  // Pipeline completo
  // ---------------------------------------------------------------------
  /**
   * analyze(times, values, options)
   * @param times  Array de tempos (s), crescente
   * @param values Array de aceleração (m/s²)
   */
  function analyze(times, values, options) {
    const cfg = Object.assign({}, DEFAULTS, options || {});
    const warnings = [];
    if (!times || times.length < 20) throw new Error('Dados insuficientes para análise.');

    // 1) Estatísticas de amostragem
    const ss = samplingStats(times);
    if (!(ss.fs > 10)) throw new Error('Taxa de amostragem muito baixa (' + ss.fs.toFixed(1) + ' Hz).');
    const fs = Math.round(ss.fs * 10) / 10;
    if (ss.jitter > 0.25) warnings.push('Jitter de amostragem elevado (' + (ss.jitter * 100).toFixed(0) + '%): sinal reamostrado por interpolação.');
    if (ss.maxGap > 0.25) warnings.push('Lacuna máxima de ' + ss.maxGap.toFixed(2) + ' s entre amostras (possível perda de eventos do sensor).');

    // 2) Reamostragem uniforme + descarte inicial
    let x = resampleUniform(times, values, fs);
    const t0 = times[0];
    const discard = Math.min(Math.round(cfg.discardSeconds * fs), Math.floor(x.length / 4));
    x = x.subarray(discard);
    const tOffset = discard / fs;
    const duration = x.length / fs;
    if (duration < 8) throw new Error('Registro muito curto (' + duration.toFixed(1) + ' s após o descarte inicial). Colete pelo menos 10 s.');
    if (duration < 30) warnings.push('Registro de ' + duration.toFixed(0) + ' s: a literatura recomenda ≥ 30 s por condição (di Biase 2017 usou 100 s para o TSI).');

    // 3) Pré-processamento
    const raw = Float64Array.from(x);
    const detrended = detrendLinear(x);
    const lp = Math.min(cfg.lpCutoff, 0.45 * fs);
    const filtered = bandpass(detrended, fs, cfg.hpCutoff, lp);
    const amplitudeRms = rms(filtered);
    const timeAxis = new Float64Array(filtered.length);
    for (let i = 0; i < timeAxis.length; i++) timeAxis[i] = i / fs;

    // 4) Welch
    const nperseg = Math.min(Math.round(cfg.welchSeconds * fs), Math.floor(filtered.length / 2));
    const W = welch(filtered, fs, { nperseg, padFactor: cfg.welchPadFactor });
    const fHi = Math.min(cfg.bandHigh, 0.45 * fs);
    const bandTotal = bandPower(W.freqs, W.psd, cfg.bandLow, fHi, W.df);
    const pk = findPeak(W.freqs, W.psd, cfg.bandLow, fHi, W.df);

    // 5) Métricas de pico
    let peak = null;
    if (pk && bandTotal > 0) {
      const wd = fwhm(W.freqs, W.psd, pk.idx, pk.power);
      const around = bandPower(W.freqs, W.psd, pk.freq - cfg.peakHalfWidth, pk.freq + cfg.peakHalfWidth, W.df);
      const [i1, i2] = indexRange(W.freqs, cfg.bandLow, fHi);
      const med = median(W.psd.subarray(i1, i2 + 1));
      const hwp = bandPower(W.freqs, W.psd, wd.fLeft, wd.fRight, W.df);
      // Potência da componente do pico: ±max(0,5 Hz, FWHM) captura o lóbulo principal da janela de Hann
      const wPeak = Math.max(cfg.peakHalfWidth, wd.fwhm);
      const peakBand = bandPower(W.freqs, W.psd, pk.freq - wPeak, pk.freq + wPeak, W.df);
      const peakAmp = Math.sqrt(2 * peakBand); // amplitude de aceleração da componente do pico (senoide: P = A²/2)
      const omega = 2 * Math.PI * pk.freq;
      peak = {
        freq: pk.freq, power: pk.power, fwhm: wd.fwhm, fLeft: wd.fLeft, fRight: wd.fRight, fwhmOpen: wd.open,
        halfWidthPower: hwp, logHalfWidthPower: hwp > 0 ? Math.log10(hwp) : NaN, peakBandPower: peakBand,
        relPower: around / bandTotal, snrDb: med > 0 ? 10 * Math.log10(pk.power / med) : NaN,
        peakAccelAmplitude: peakAmp,
        displacementMm: omega > 0 ? (peakAmp / (omega * omega)) * 1000 : NaN,
        harmonic: harmonicRatio(W.freqs, W.psd, pk.freq, W.df, fs),
      };
    }
    const entropy = spectralEntropy(W.freqs, W.psd, cfg.bandLow, fHi);
    const detected = !!peak && peak.relPower >= cfg.detectRelPower && peak.snrDb >= cfg.detectSnrDb;

    // 6) Espectrograma / persistência
    const spec = spectrogram(filtered, fs, cfg);
    const detWins = spec.windows.filter(w => w.detected);
    const persistence = spec.windows.length ? detWins.length / spec.windows.length : 0;
    const winPeakFreqs = detWins.map(w => w.peakFreq);
    const mask = detWins.length ? (t) => detWins.some(w => t >= w.tStart && t <= w.tEnd) : null;

    // 7) TSI / irregularidade / envelope / jerk (apenas se há pico)
    let stability = null, envelope = null, jerk = NaN, tsiBand = null;
    if (peak) {
      const lo = Math.max(cfg.hpCutoff, peak.freq - cfg.tsiHalfBand);
      const hi = Math.min(peak.freq + cfg.tsiHalfBand, 0.45 * fs);
      tsiBand = [lo, hi];
      if (peak.freq < cfg.tsiPeakLow || peak.freq > cfg.tsiPeakHigh) warnings.push('TSI calculado fora da faixa de validação (2–9 Hz; di Biase 2017): sem valor discriminativo DP vs TE.');
      const xb = bandpass(filtered, fs, lo, hi);
      stability = instantaneousFrequency(xb, fs, mask);
      if (stability.nCycles < 30) warnings.push('Poucos ciclos de tremor (' + stability.nCycles + ') para o TSI: interprete com cautela.');
      const env = hilbertEnvelope(xb);
      const envVals = [];
      for (let i = 0; i < env.length; i++) { const t = i / fs; if (!mask || mask(t)) envVals.push(env[i]); }
      const em = mean(envVals);
      envelope = { values: env, mean: em, sd: std(envVals), cv: em > 0 ? std(envVals) / em : NaN };
      jerk = normalizedJerk(filtered, fs, peak.freq);
    }

    return {
      version: 2,
      config: cfg,
      sampling: { fsRaw: ss.fs, fs, jitter: ss.jitter, maxGap: ss.maxGap, nRaw: times.length, nUsed: filtered.length, durationRaw: ss.duration, duration, discardedSeconds: tOffset, startTime: t0 },
      signal: { time: timeAxis, raw, filtered },
      spectrum: { freqs: W.freqs, psd: W.psd, df: W.df, resolution: W.resolution, nperseg: W.nperseg, nfft: W.nfft, nSegments: W.nseg, bandLow: cfg.bandLow, bandHigh: fHi },
      metrics: {
        detected,
        peakFreq: peak ? peak.freq : NaN,
        peakPower: peak ? peak.power : NaN,
        fwhm: peak ? peak.fwhm : NaN,
        fwhmOpen: peak ? peak.fwhmOpen : false,
        fwhmLeft: peak ? peak.fLeft : NaN,
        fwhmRight: peak ? peak.fRight : NaN,
        halfWidthPower: peak ? peak.halfWidthPower : NaN,
        peakBandPower: peak ? peak.peakBandPower : NaN,
        logHalfWidthPower: peak ? peak.logHalfWidthPower : NaN,
        relPeakPower: peak ? peak.relPower : NaN,
        snrDb: peak ? peak.snrDb : NaN,
        bandPower: bandTotal,
        logBandPower: bandTotal > 0 ? Math.log10(bandTotal) : NaN,
        spectralEntropy: entropy,
        harmonicRatio: peak ? peak.harmonic.ratio : NaN,
        harmonics: peak ? peak.harmonic.perHarmonic : [],
        rms: amplitudeRms,
        logRms: amplitudeRms > 0 ? Math.log10(amplitudeRms) : NaN,
        peakAccelAmplitude: peak ? peak.peakAccelAmplitude : NaN,
        displacementMm: peak ? peak.displacementMm : NaN,
        tsi: stability ? stability.tsi : NaN,
        tsiCycles: stability ? stability.nCycles : 0,
        tsiBand,
        instFreqMean: stability ? stability.meanFreq : NaN,
        instFreqSd: stability ? stability.sdFreq : NaN,
        instFreqCv: stability ? stability.cv : NaN,
        amplitudeCv: envelope ? envelope.cv : NaN,
        normalizedJerk: jerk,
        persistence,
        windowPeakSd: winPeakFreqs.length > 1 ? std(winPeakFreqs) : NaN,
        windowPeakMean: winPeakFreqs.length ? mean(winPeakFreqs) : NaN,
      },
      stability,
      envelope: envelope ? envelope.values : null,
      spectrogram: spec,
      warnings,
    };
  }

  return {
    DEFAULTS, mean, std, rms, percentile, median, nextPow2,
    samplingStats, resampleUniform, detrendLinear, biquad, filtfilt, highpass, lowpass, bandpass,
    fft, ifft, hannPeriodic, periodogram, welch, bandPower, findPeak, fwhm, spectralEntropy, harmonicRatio,
    zeroCrossings, instantaneousFrequency, hilbertEnvelope, normalizedJerk, spectrogram, analyze, principalAxis, buildSignal,
  };
});
