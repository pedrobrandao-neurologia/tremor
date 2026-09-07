/*
 * TremorPSD — relatório e exportações (PDF, HTML, CSV, JSON, PNG, compartilhar)
 */
(function (root) {
  'use strict';
  const I = root.TremorInterpret;

  const fmt = (v, d) => (v === null || v === undefined || Number.isNaN(v) || v === Infinity) ? '—' : Number(v).toFixed(d === undefined ? 2 : d).replace('.', ',');
  const fmtExp = (v) => (Number.isFinite(v) ? Number(v).toExponential(2).replace('.', ',') : '—');
  const dateStr = (iso) => new Date(iso).toLocaleString('pt-BR');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function baseName(session) {
    const d = new Date(session.createdAt);
    const stamp = d.toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const id = (session.patient && session.patient.id) ? '_' + String(session.patient.id).replace(/[^\w-]+/g, '_').slice(0, 24) : '';
    return `TremorPSD_${stamp}${id}`;
  }

  /** Linhas da tabela de métricas com unidade e referência. */
  function metricsRows(R) {
    const m = R.metrics;
    return [
      { group: 'Espectro', key: 'peakFreq', label: 'Frequência de pico', value: fmt(m.peakFreq, 2), unit: 'Hz', ref: 'DP 4–6; TE 4–12; fisiológico 8–12; ortostático 13–18 (Bhatia 2018)' },
      { group: 'Espectro', key: 'fwhm', label: 'Largura à meia altura (FWHM)', value: fmt(m.fwhm, 2), unit: 'Hz', ref: 'Pico estreito = oscilador estável (Rajan 2023; Purrer 2025)' },
      { group: 'Espectro', key: 'relPeakPower', label: 'Potência relativa do pico (±0,5 Hz / banda 2–25 Hz)', value: fmt(m.relPeakPower, 3), unit: '', ref: 'Detecção de tremor ≥ 0,30 (adaptado de Luft 2019)' },
      { group: 'Espectro', key: 'snrDb', label: 'Razão pico/fundo', value: fmt(m.snrDb, 1), unit: 'dB', ref: '≥ 6 dB para considerar pico definido' },
      { group: 'Espectro', key: 'halfWidthPower', label: 'Potência à meia altura (HWP)', value: fmtExp(m.halfWidthPower), unit: '(m/s²)²', ref: 'log(HWP) correlaciona com escalas clínicas (Purrer 2025)' },
      { group: 'Espectro', key: 'bandPower', label: 'Potência total 2–25 Hz', value: fmtExp(m.bandPower), unit: '(m/s²)²', ref: 'log₁₀ = ' + fmt(m.logBandPower) },
      { group: 'Espectro', key: 'spectralEntropy', label: 'Entropia espectral normalizada', value: fmt(m.spectralEntropy, 3), unit: '0–1', ref: '≈0 tom puro; ≈1 ruído/tremor fisiológico (Hossen 2020)' },
      { group: 'Espectro', key: 'harmonicRatio', label: 'Razão harmônica (2f–4f / f)', value: fmt(m.harmonicRatio, 3), unit: '', ref: 'Elevada na DP (forma de onda assimétrica) (Wile 2014; Jang 2013)' },
      { group: 'Estabilidade', key: 'tsi', label: 'Índice de estabilidade do tremor (TSI)', value: fmt(m.tsi, 2), unit: 'Hz', ref: '≤ 1,05 DP; > 1,05 TE (di Biase 2017) — ' + m.tsiCycles + ' ciclos' },
      { group: 'Estabilidade', key: 'instFreqMean', label: 'Frequência instantânea média ± DP', value: fmt(m.instFreqMean, 2) + ' ± ' + fmt(m.instFreqSd, 2), unit: 'Hz', ref: 'Ciclo a ciclo (cruzamentos de zero)' },
      { group: 'Estabilidade', key: 'instFreqCv', label: 'Coeficiente de variação da frequência', value: fmt(m.instFreqCv * 100, 1), unit: '%', ref: '~50% maior na distonia que no TE (Shaikh 2008)' },
      { group: 'Estabilidade', key: 'windowPeakSd', label: 'DP do pico entre janelas de 3 s', value: fmt(m.windowPeakSd, 2), unit: 'Hz', ref: 'Variabilidade temporal (Panyakaew 2020)' },
      { group: 'Estabilidade', key: 'persistence', label: 'Persistência do tremor', value: fmt(m.persistence * 100, 0), unit: '% janelas', ref: 'Ocorrência de tremor (Elble & McNames 2016; Luft 2019)' },
      { group: 'Amplitude', key: 'rms', label: 'Amplitude RMS (1–30 Hz)', value: fmt(m.rms, 3), unit: 'm/s²', ref: 'log₁₀ = ' + fmt(m.logRms) + '; escalas ~ log(amplitude) (Elble 2006)' },
      { group: 'Amplitude', key: 'peakAccelAmplitude', label: 'Amplitude da componente do pico', value: fmt(m.peakAccelAmplitude, 3), unit: 'm/s²', ref: 'A = √(2·potência do pico)' },
      { group: 'Amplitude', key: 'displacementMm', label: 'Deslocamento estimado no pico', value: fmt(m.displacementMm, 2), unit: 'mm', ref: 'D = A/(2πf)²; depende da posição do sensor' },
      { group: 'Amplitude', key: 'amplitudeCv', label: 'CV do envelope de amplitude', value: fmt(m.amplitudeCv * 100, 0), unit: '%', ref: 'Flutuação de amplitude (Hilbert)' },
      { group: 'Forma de onda', key: 'normalizedJerk', label: 'Jerk normalizado', value: fmt(m.normalizedJerk, 2), unit: '', ref: '= 1 senoide; ≫ 1 espiculado (Hogan & Sternad 2009)' },
    ];
  }

  function qualityRows(session) {
    const R = session.results, s = R.sampling, ax = session.axisInfo || {};
    const axisText = ax.mode === 'auto' ? `eixo principal (PCA; ${fmt((ax.explained || 0) * 100, 0)}% da variância; vetor [${(ax.vector || []).map(v => fmt(v, 2)).join(', ')}])` : ax.mode === 'norm' ? 'magnitude vetorial' : `eixo ${String(ax.mode || '').toUpperCase()}`;
    return [
      ['Fonte do sinal', session.source === 'demo' ? `SIMULAÇÃO (${session.demoProfile || 'sintética'}) — não é um registro real` : (session.sensor && session.sensor.linear ? 'acelerômetro (aceleração linear, gravidade removida pelo sistema)' : 'acelerômetro (com gravidade; removida por filtro)')],
      ['Eixo analisado', axisText],
      ['Taxa de amostragem', `${fmt(s.fs, 1)} Hz (jitter ${fmt(s.jitter * 100, 0)}%; lacuna máx. ${fmt(s.maxGap * 1000, 0)} ms)`],
      ['Amostras / duração', `${s.nRaw} amostras brutas; ${fmt(s.durationRaw, 1)} s registrados; ${fmt(s.duration, 1)} s analisados (descartado ${fmt(s.discardedSeconds, 1)} s inicial)`],
      ['Pré-processamento', `detrend linear; passa-alta ${R.config.hpCutoff} Hz; passa-baixa ${fmt(Math.min(R.config.lpCutoff, 0.45 * s.fs), 0)} Hz (Butterworth, fase zero)`],
      ['Estimativa espectral', `Welch: ${R.spectrum.nSegments} segmentos de ${fmt(R.spectrum.nperseg / s.fs, 1)} s (Hann, 50%), nfft ${R.spectrum.nfft}, resolução ${fmt(R.spectrum.resolution, 2)} Hz (bin ${fmt(R.spectrum.df, 3)} Hz)`],
      ['TSI', R.metrics.tsiBand ? `passa-banda ${fmt(R.metrics.tsiBand[0], 1)}–${fmt(R.metrics.tsiBand[1], 1)} Hz; ${R.metrics.tsiCycles} ciclos em janelas com tremor` : '—'],
      ['Dispositivo', `${session.device && session.device.platform || ''} — ${session.device && session.device.ua || ''}`],
      ['Versão do app', session.appVersion || ''],
    ];
  }

  // ---------------------------------------------------------------------
  // Download / compartilhamento
  // ---------------------------------------------------------------------
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function share(files, title, text) {
    if (navigator.share && (!files || !navigator.canShare || navigator.canShare({ files }))) {
      await navigator.share(Object.assign({ title, text }, files && files.length ? { files } : {}));
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // CSV / JSON
  // ---------------------------------------------------------------------
  function csvMetrics(session) {
    const rows = metricsRows(session.results);
    const p = session.protocol || {};
    const lines = ['grupo;metrica;valor;unidade;referencia'];
    rows.forEach(r => lines.push([r.group, r.label, r.value, r.unit, r.ref].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')));
    lines.push('', 'campo;valor');
    [['data', dateStr(session.createdAt)], ['identificacao', p.patientId || ''], ['condicao', I.CONDITIONS[p.condition] || p.condition], ['segmento', I.SEGMENTS[p.segment] || p.segment], ['lado', I.sideText(p.segment, p.side)], ['fonte', session.source], ['fs_Hz', fmt(session.results.sampling.fs, 2)], ['duracao_s', fmt(session.results.sampling.duration, 1)]]
      .forEach(([k, v]) => lines.push(`"${k}";"${String(v).replace(/"/g, '""')}"`));
    return '﻿' + lines.join('\n');
  }
  function csvRaw(session) {
    const lines = ['t_s;ax_ms2;ay_ms2;az_ms2;sinal_ms2'];
    session.samples.forEach(s => lines.push([s.t.toFixed(4), s.x.toFixed(5), s.y.toFixed(5), s.z.toFixed(5), (s.v !== undefined ? s.v : 0).toFixed(5)].join(';').replace(/\./g, ',')));
    return '﻿' + lines.join('\n');
  }
  function csvSpectrum(session) {
    const sp = session.results.spectrum;
    const lines = ['freq_Hz;psd_ms2_2_per_Hz'];
    for (let i = 0; i < sp.freqs.length && sp.freqs[i] <= 30; i++) lines.push(`${sp.freqs[i].toFixed(4)};${sp.psd[i].toExponential(5)}`.replace(/\./g, ','));
    return '﻿' + lines.join('\n');
  }
  function jsonSession(session, includeRaw) {
    const R = session.results;
    const out = {
      app: 'TremorPSD', version: session.appVersion, id: session.id, createdAt: session.createdAt, source: session.source, demoProfile: session.demoProfile || null,
      patient: session.patient, protocol: session.protocol, device: session.device, axisInfo: session.axisInfo,
      sampling: R.sampling, config: R.config, metrics: R.metrics, warnings: R.warnings,
      interpretation: session.interpretation,
      spectrum: { freqs: Array.from(R.spectrum.freqs), psd: Array.from(R.spectrum.psd), df: R.spectrum.df, resolution: R.spectrum.resolution },
      windows: R.spectrogram.windows.map(w => ({ tStart: w.tStart, tEnd: w.tEnd, peakFreq: w.peakFreq, relPower: w.relPower, snrDb: w.snrDb, detected: w.detected })),
      instantaneousFrequency: R.stability ? { times: R.stability.times, freqs: R.stability.freqs } : null,
    };
    if (includeRaw) out.samples = session.samples;
    return JSON.stringify(out, (k, v) => (typeof v === 'number' && !Number.isFinite(v)) ? null : v, 1);
  }

  // ---------------------------------------------------------------------
  // HTML (relatório imprimível e autônomo)
  // ---------------------------------------------------------------------
  const REFERENCES = [
    'Bhatia KP, et al. Consensus Statement on the classification of tremors. Mov Disord. 2018;33(1):75-87. doi:10.1002/mds.27121',
    'di Biase L, et al. Tremor stability index: a new tool for differential diagnosis in tremor syndromes. Brain. 2017;140(7):1977-1986. doi:10.1093/brain/awx104',
    'Vial F, et al. How to do an electrophysiological study of tremor. Clin Neurophysiol Pract. 2019;4:134-142. doi:10.1016/j.cnp.2019.06.002',
    'Deuschl G, et al. The clinical and electrophysiological investigation of tremor. Clin Neurophysiol. 2022;136:93-129. doi:10.1016/j.clinph.2022.01.004',
    'Elble RJ, et al. Tremor amplitude is logarithmically related to 4- and 5-point tremor rating scales. Brain. 2006;129:2660-2666. doi:10.1093/brain/awl190',
    'Elble RJ, McNames J. Using portable transducers to measure tremor severity. Tremor Other Hyperkinet Mov. 2016;6:375. doi:10.7916/D8DR2VCC',
    'Wile DJ, Ranawaya R, Kiss ZH. Smart watch accelerometry for analysis and diagnosis of tremor. J Neurosci Methods. 2014;230:1-4. doi:10.1016/j.jneumeth.2014.04.021',
    'Shaikh AG, et al. Irregularity distinguishes limb tremor in cervical dystonia from essential tremor. J Neurol Neurosurg Psychiatry. 2008;79(2):187-189. doi:10.1136/jnnp.2007.131110',
    'Panyakaew P, et al. The pathophysiology of dystonic tremors and comparison with essential tremor. J Neurosci. 2020;40(48):9317-9326. doi:10.1523/JNEUROSCI.1181-20.2020',
    'Luft F, et al. A power spectral density-based method to detect tremor and tremor intermittency in movement disorders. Sensors. 2019;19(19):4301. doi:10.3390/s19194301',
    'Hassan A, et al. Orthostatic tremor: clinical, electrophysiologic, and treatment findings in 184 patients. Neurology. 2016;86(5):458-464. doi:10.1212/WNL.0000000000002328',
    'Bhatti D, et al. Smartphone apps provide a simple, accurate bedside screening tool for orthostatic tremor. Mov Disord Clin Pract. 2017;4(6):852-857. doi:10.1002/mdc3.12547',
    'van Brummelen EMJ, et al. Quantification of tremor using consumer product accelerometry is feasible in patients with essential tremor and Parkinson\'s disease. J Clin Mov Disord. 2020;7:4. doi:10.1186/s40734-020-00086-7',
    'Hogan N, Sternad D. Sensitivity of smoothness measures to movement duration, amplitude, and arrests. J Mot Behav. 2009;41(6):529-534. doi:10.3200/35-09-004-RC',
    'Purrer V, et al. Quantitative and qualitative tremor evaluation after MR-guided focused ultrasound thalamotomy. Front Neurol. 2025;16:1594382. doi:10.3389/fneur.2025.1594382',
    'Schwingenschuh P, et al. Validation of "laboratory-supported" criteria for functional (psychogenic) tremor. Mov Disord. 2016;31(4):555-562. doi:10.1002/mds.26525',
  ];

  const GLOSSARY = [
    ['Frequência de pico', 'Frequência de maior densidade espectral (Welch, Hann, segmentos de 4 s com 50% de sobreposição, interpolação parabólica) na banda 2–25 Hz. Principal variável para o Eixo 1 do consenso IPMDS 2018.'],
    ['TSI', 'Índice de estabilidade do tremor: amplitude interquartil da variação ciclo a ciclo da frequência instantânea (cruzamentos de zero do sinal filtrado em f±2 Hz). TSI ≤ 1,05 favorece tremor parkinsoniano; > 1,05 favorece tremor essencial (di Biase 2017), independentemente da postura.'],
    ['CV da frequência', 'Desvio-padrão/média da frequência instantânea. A irregularidade ciclo a ciclo é ~50% maior no tremor da distonia cervical do que no TE (Shaikh 2008) e maior no tremor distônico (Panyakaew 2020).'],
    ['Razão harmônica', 'Potência nos harmônicos 2f–4f dividida pela potência no fundamental. Reflete forma de onda não senoidal; elevada no tremor parkinsoniano (Wile 2014; Jang 2013).'],
    ['Potência relativa do pico', 'Potência em ±0,5 Hz em torno do pico dividida pela potência na banda 2–25 Hz; usada para decidir se há tremor em cada janela de 3 s (Luft 2019).'],
    ['Entropia espectral', 'Entropia de Shannon do espectro normalizado na banda 2–25 Hz, dividida por log₂(N): 0 = tom puro; 1 = espectro plano (ruído/tremor fisiológico).'],
    ['FWHM / HWP', 'Largura do pico a 50% da potência máxima (interpolada) e potência integrada nessa largura; log(HWP) correlaciona-se com escalas clínicas (Purrer 2025).'],
    ['Amplitude RMS e deslocamento', 'RMS da aceleração filtrada (1–30 Hz). O deslocamento é estimado por D = A/(2πf)² para a componente do pico. Escalas clínicas variam com o logaritmo da amplitude (Elble 2006); a amplitude depende da posição do sensor no membro (van Brummelen 2020).'],
    ['Jerk normalizado', 'RMS do jerk dividido por 2πf·RMS da aceleração: vale 1 para oscilação senoidal; valores muito maiores indicam forma de onda espiculada (Hogan & Sternad 2009). Não substitui EMG para mioclonia.'],
    ['Persistência', 'Fração das janelas de 3 s com tremor detectado; descreve intermitência (Elble & McNames 2016; Luft 2019).'],
  ];

  function htmlReport(session, images) {
    const R = session.results, m = R.metrics, it = session.interpretation, p = session.protocol || {};
    const rows = metricsRows(R);
    const groups = [...new Set(rows.map(r => r.group))];
    const css = `
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111;background:#fff;margin:0;padding:24px;font-size:13px;line-height:1.45}
      .wrap{max-width:860px;margin:0 auto} h1{font-size:22px;margin:0 0 4px;letter-spacing:-0.01em} h2{font-size:15px;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #ddd;letter-spacing:0.02em;text-transform:uppercase;color:#444}
      h3{font-size:13px;margin:12px 0 4px} .muted{color:#666} table{width:100%;border-collapse:collapse;font-size:12px} th,td{padding:5px 8px;border-bottom:1px solid #e5e5e5;text-align:left;vertical-align:top} th{background:#f4f4f6;font-weight:600}
      td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums} .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px} .fig{border:1px solid #e5e5e5;border-radius:8px;padding:6px} .fig img{width:100%;display:block} .fig figcaption{font-size:11px;color:#555;margin-top:4px}
      .box{border:1px solid #ddd;border-radius:8px;padding:10px 12px;margin:8px 0} .box.warn{border-color:#f0b35a;background:#fff8ec} .box.info{border-color:#8fbcf5;background:#eef5ff} .box.danger{border-color:#f28b82;background:#fff0ef}
      .hyp{margin:6px 0 10px} .hyp b{font-size:13px} .hyp ul{margin:4px 0 0 18px;padding:0} .hyp li{margin:2px 0} .plus{color:#1a7f37} .minus{color:#b42318}
      .summary{font-size:14px;background:#f4f6fa;border-left:4px solid #007AFF;padding:10px 12px;border-radius:6px}
      .demo{background:#ffe9e6;color:#8a1c12;border:1px solid #f5a79f;padding:8px 12px;border-radius:6px;font-weight:600;margin:8px 0}
      ol.refs{font-size:11px;color:#333;padding-left:18px} ol.refs li{margin:2px 0} .foot{font-size:11px;color:#666;margin-top:20px;border-top:1px solid #ddd;padding-top:8px}
      @media print{body{padding:0} .grid{grid-template-columns:1fr 1fr} h2{break-after:avoid} .fig,.box,tr{break-inside:avoid} @page{margin:14mm}}
    `;
    const hypHtml = (it.hypotheses || []).map(h => `<div class="hyp"><b>${esc(h.label)}</b> — confiança ${esc(h.confidence)} (escore ${fmt(h.score, 1)})<ul>${h.evidence.map(e => `<li class="${e.dir === '+' ? 'plus' : (e.dir === '−' ? 'minus' : '')}">${e.dir} ${esc(e.text)}${e.ref ? ` <span class="muted">(${esc(e.ref)})</span>` : ''}</li>`).join('')}</ul></div>`).join('') || '<p class="muted">Nenhuma hipótese sindrômica com evidência suficiente.</p>';
    const findHtml = (it.findings || []).map(f => `<tr><td><b>${esc(f.label)}</b></td><td>${esc(f.text)}</td></tr>`).join('');
    const flagHtml = (it.flags || []).map(f => `<div class="box warn"><b>${esc(f.label)}.</b> ${esc(f.text)}</div>`).join('');
    const sugHtml = (it.suggestions || []).map(s => `<li>${esc(s)}</li>`).join('');
    const tableHtml = groups.map(g => `<tr><th colspan="4">${esc(g)}</th></tr>` + rows.filter(r => r.group === g).map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(r.value)}</td><td>${esc(r.unit)}</td><td class="muted">${esc(r.ref)}</td></tr>`).join('')).join('');
    const qual = qualityRows(session).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');
    const figs = images ? `
      <div class="grid">
        <figure class="fig"><img src="${images.time}" alt="Sinal no tempo"><figcaption>Figura 1. Aceleração filtrada (azul), sinal bruto sem tendência (cinza) e envelope de Hilbert (laranja).</figcaption></figure>
        <figure class="fig"><img src="${images.psd}" alt="PSD"><figcaption>Figura 2. Densidade espectral de potência (Welch) com faixas de referência, pico e FWHM.</figcaption></figure>
        <figure class="fig"><img src="${images.spec}" alt="Espectrograma"><figcaption>Figura 3. Espectrograma (janelas de 3 s, dB) com o traçado do pico nas janelas com tremor.</figcaption></figure>
        <figure class="fig"><img src="${images.inst}" alt="Frequência instantânea"><figcaption>Figura 4. Frequência instantânea ciclo a ciclo (base do TSI) e pico por janela.</figcaption></figure>
      </div>` : '';
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório TremorPSD — ${esc(dateStr(session.createdAt))}</title><style>${css}</style></head><body><div class="wrap">
      <h1>Relatório de análise quantitativa de tremor</h1>
      <div class="muted">TremorPSD ${esc(session.appVersion || '')} · ${esc(dateStr(session.createdAt))} · ID da sessão ${esc(session.id)}</div>
      ${session.source === 'demo' ? '<div class="demo">SIMULAÇÃO — sinal sintético gerado pelo aplicativo para demonstração. Não corresponde a um paciente.</div>' : ''}
      <h2>Identificação e protocolo</h2>
      <table><tr><td><b>Identificação</b></td><td>${esc(p.patientId || '—')}</td><td><b>Observações</b></td><td>${esc(p.notes || '—')}</td></tr>
      <tr><td><b>Condição de ativação</b></td><td>${esc(I.CONDITIONS[p.condition] || p.condition || '—')}</td><td><b>Segmento / lado</b></td><td>${esc(I.SEGMENTS[p.segment] || p.segment || '—')} ${esc(I.sideText(p.segment, p.side))}</td></tr>
      <tr><td><b>Duração programada</b></td><td>${esc(p.duration)} s</td><td><b>Eixo</b></td><td>${esc(p.axisMode === 'auto' ? 'automático (PCA)' : p.axisMode)}</td></tr></table>
      <h2>Síntese</h2>
      <p class="summary">${esc(it.summary)}</p>
      <h2>Hipóteses sindrômicas (apoio à interpretação)</h2>
      ${hypHtml}
      ${flagHtml}
      <h2>Métricas</h2>
      <table><tr><th>Métrica</th><th>Valor</th><th>Unidade</th><th>Referência</th></tr>${tableHtml}</table>
      <h2>Gráficos</h2>
      ${figs}
      <h2>Achados e sugestões</h2>
      <table>${findHtml}</table>
      ${sugHtml ? `<h3>Sugestões para completar a avaliação</h3><ul>${sugHtml}</ul>` : ''}
      <h2>Qualidade do registro e método</h2>
      <table>${qual}</table>
      <h2>Como interpretar cada métrica</h2>
      <table>${GLOSSARY.map(([k, v]) => `<tr><td style="width:170px"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table>
      <h2>Referências</h2>
      <ol class="refs">${REFERENCES.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
      <div class="foot">Este relatório é gerado automaticamente a partir de um único acelerômetro e destina-se a apoiar a avaliação por profissional habilitado. Não constitui diagnóstico. As faixas de referência resumem a literatura citada; a classificação final é clínica (IPMDS 2018). Limiares de irregularidade, razão harmônica e amplitude são heurísticos e estão documentados em docs/LITERATURA.md.</div>
    </div></body></html>`;
  }

  // ---------------------------------------------------------------------
  // PDF (jsPDF)
  // ---------------------------------------------------------------------
  function pdfSafe(s) {
    return String(s == null ? '' : s)
      .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≈/g, '~').replace(/≫/g, '>>').replace(/Δ/g, 'Delta ').replace(/—/g, '-').replace(/–/g, '-').replace(/−/g, '-')
      .replace(/₁₀/g, '10').replace(/²/g, '2').replace(/√/g, 'raiz').replace(/π/g, 'pi').replace(/→/g, '->').replace(/·/g, '.').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/•/g, '-').replace(/ρ/g, 'rho').replace(/×/g, 'x');
  }
  function pdfReport(session, images) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const R = session.results, it = session.interpretation, p = session.protocol || {};
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const M = 15; let y = M; let page = 1;
    const footer = () => { doc.setFont('helvetica', 'italic').setFontSize(7.5).setTextColor(120); doc.text(pdfSafe(`TremorPSD ${session.appVersion || ''} — relatório automático de apoio; não substitui avaliação clínica. Página ${page}`), W / 2, H - 8, { align: 'center' }); doc.setTextColor(0); };
    const need = (h) => { if (y + h > H - 16) { footer(); doc.addPage(); page++; y = M; } };
    const heading = (t) => { need(12); doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(0, 90, 200); doc.text(pdfSafe(t), M, y); doc.setTextColor(0); y += 2.5; doc.setDrawColor(200).line(M, y, W - M, y); y += 6; };
    const para = (t, size, style, color) => {
      doc.setFont('helvetica', style || 'normal').setFontSize(size || 10); if (color) doc.setTextColor(...color);
      const lines = doc.splitTextToSize(pdfSafe(t), W - 2 * M);
      lines.forEach(l => { need(size ? size * 0.5 : 5); doc.text(l, M, y); y += (size || 10) * 0.45; });
      doc.setTextColor(0); y += 1.5;
    };
    const kv = (rows, colW) => {
      rows.forEach(([k, v]) => {
        doc.setFontSize(9); const vl = doc.splitTextToSize(pdfSafe(v), W - 2 * M - colW);
        need(vl.length * 4.2 + 2);
        doc.setFont('helvetica', 'bold').text(pdfSafe(k), M, y); doc.setFont('helvetica', 'normal').text(vl, M + colW, y);
        y += vl.length * 4.2 + 1.2;
      });
    };
    // Cabeçalho
    doc.setFont('helvetica', 'bold').setFontSize(18); doc.text('Relatório de análise quantitativa de tremor', M, y); y += 7;
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110); doc.text(pdfSafe(`TremorPSD ${session.appVersion || ''} · ${dateStr(session.createdAt)} · sessão ${session.id}`), M, y); doc.setTextColor(0); y += 8;
    if (session.source === 'demo') { doc.setFillColor(255, 233, 230); doc.roundedRect(M, y - 4, W - 2 * M, 9, 2, 2, 'F'); doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(138, 28, 18); doc.text(pdfSafe('SIMULAÇÃO — sinal sintético para demonstração; não corresponde a um paciente.'), M + 3, y + 1.5); doc.setTextColor(0); y += 10; }
    heading('Identificação e protocolo');
    kv([['Identificação', p.patientId || '—'], ['Observações', p.notes || '—'], ['Condição', I.CONDITIONS[p.condition] || p.condition || '—'], ['Segmento / lado', `${I.SEGMENTS[p.segment] || p.segment || '—'} ${I.sideText(p.segment, p.side)}`], ['Duração / eixo', `${p.duration} s / ${p.axisMode === 'auto' ? 'automático (PCA)' : p.axisMode}`]], 38);
    heading('Síntese');
    para(it.summary, 10.5, 'normal');
    heading('Hipóteses sindrômicas (apoio à interpretação)');
    if (!it.hypotheses || !it.hypotheses.length) para('Nenhuma hipótese sindrômica com evidência suficiente.', 9.5);
    (it.hypotheses || []).forEach(h => {
      need(10); doc.setFont('helvetica', 'bold').setFontSize(10.5); doc.text(pdfSafe(`${h.label} — confiança ${h.confidence} (escore ${fmt(h.score, 1)})`), M, y); y += 5;
      h.evidence.forEach(e => { doc.setFontSize(9); const lines = doc.splitTextToSize(pdfSafe(`${e.dir} ${e.text}${e.ref ? ' (' + e.ref + ')' : ''}`), W - 2 * M - 6); need(lines.length * 4); doc.setFont('helvetica', 'normal'); if (e.dir === '+') doc.setTextColor(26, 127, 55); else if (e.dir === '−') doc.setTextColor(180, 35, 24); doc.text(lines, M + 4, y); doc.setTextColor(0); y += lines.length * 4 + 0.5; });
      y += 2;
    });
    (it.flags || []).forEach(f => para(`${f.label}. ${f.text}`, 9, 'italic', [140, 80, 0]));
    heading('Métricas');
    const rows = metricsRows(R);
    const cols = [M, M + 62, M + 86, M + 104];
    const header = () => { need(7); doc.setFillColor(240, 242, 246); doc.rect(M, y - 4, W - 2 * M, 6.5, 'F'); doc.setFont('helvetica', 'bold').setFontSize(8.5); ['Métrica', 'Valor', 'Unidade', 'Referência'].forEach((t, i) => doc.text(t, cols[i] + 1, y)); y += 5; };
    header();
    let lastGroup = null;
    rows.forEach(r => {
      if (r.group !== lastGroup) { need(6); doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(0, 90, 200); doc.text(pdfSafe(r.group), M + 1, y); doc.setTextColor(0); y += 4.5; lastGroup = r.group; }
      doc.setFont('helvetica', 'normal').setFontSize(8.5);
      const l1 = doc.splitTextToSize(pdfSafe(r.label), 60), l4 = doc.splitTextToSize(pdfSafe(r.ref), W - M - cols[3] - 2);
      const h = Math.max(l1.length, l4.length) * 3.8;
      need(h + 1);
      doc.text(l1, cols[0] + 1, y); doc.setFont('helvetica', 'bold'); doc.text(pdfSafe(r.value), cols[1] + 1, y); doc.setFont('helvetica', 'normal'); doc.text(pdfSafe(r.unit), cols[2] + 1, y); doc.setTextColor(90); doc.text(l4, cols[3] + 1, y); doc.setTextColor(0);
      y += h + 0.8; doc.setDrawColor(235).line(M, y - 2.5, W - M, y - 2.5);
    });
    // Gráficos
    if (images) {
      heading('Gráficos');
      const imgW = W - 2 * M, imgH = imgW * 0.4;
      const caps = [['time', 'Figura 1. Aceleração filtrada (azul), sinal bruto sem tendência (cinza) e envelope (laranja).'], ['psd', 'Figura 2. Densidade espectral de potência (Welch) com faixas de referência, pico e FWHM.'], ['spec', 'Figura 3. Espectrograma (janelas de 3 s) com o traçado do pico nas janelas com tremor.'], ['inst', 'Figura 4. Frequência instantânea ciclo a ciclo (base do TSI) e pico por janela.']];
      caps.forEach(([k, cap]) => { if (!images[k]) return; need(imgH + 10); doc.addImage(images[k], images[k].startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', M, y, imgW, imgH, undefined, 'FAST'); y += imgH + 3; doc.setFont('helvetica', 'italic').setFontSize(8); doc.text(pdfSafe(cap), M, y); y += 6; });
    }
    heading('Achados e sugestões');
    (it.findings || []).forEach(f => para(`${f.label}: ${f.text}`, 9));
    if (it.suggestions && it.suggestions.length) { doc.setFont('helvetica', 'bold').setFontSize(9.5); need(6); doc.text('Sugestões para completar a avaliação', M, y); y += 5; it.suggestions.forEach(s => para(`- ${s}`, 9)); }
    heading('Qualidade do registro e método');
    kv(qualityRows(session), 40);
    heading('Como interpretar cada métrica');
    GLOSSARY.forEach(([k, v]) => { doc.setFont('helvetica', 'bold').setFontSize(9); need(8); doc.text(pdfSafe(k), M, y); y += 4; para(v, 8.5); });
    heading('Referências');
    REFERENCES.forEach((r, i) => para(`${i + 1}. ${r}`, 8));
    para('Este relatório é gerado automaticamente a partir de um único acelerômetro e destina-se a apoiar a avaliação por profissional habilitado. Não constitui diagnóstico. Limiares heurísticos estão documentados em docs/LITERATURA.md.', 8, 'italic', [100, 100, 100]);
    footer();
    return doc;
  }

  function dataUrlToBlob(url) {
    const [meta, b64] = url.split(',');
    const mime = meta.match(/data:([^;]+)/)[1];
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  root.TremorReport = { metricsRows, qualityRows, csvMetrics, csvRaw, csvSpectrum, jsonSession, htmlReport, pdfReport, download, share, baseName, dataUrlToBlob, GLOSSARY, REFERENCES, fmt };
})(typeof window !== 'undefined' ? window : this);
