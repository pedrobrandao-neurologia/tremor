/*
 * TremorPSD — interpretação baseada em regras explícitas
 * ------------------------------------------------------
 * Converte as métricas (js/dsp.js) + protocolo de coleta em hipóteses
 * rastreáveis, cada uma com as evidências a favor e contra, com base no
 * consenso IPMDS 2018 e nos estudos listados em docs/LITERATURA.md.
 * NÃO é um diagnóstico: é apoio à interpretação por profissional habilitado.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TremorInterpret = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REFS = {
    consenso: 'Bhatia et al., Mov Disord 2018',
    diBiase: 'di Biase et al., Brain 2017',
    luft: 'Luft et al., Sensors 2019',
    wile: 'Wile et al., J Neurosci Methods 2014',
    jang: 'Jang et al., Physiol Meas 2013',
    shaikh: 'Shaikh et al., JNNP 2008',
    panyakaew: 'Panyakaew et al., J Neurosci 2020',
    hassan: 'Hassan et al., Neurology 2016',
    bhatti: 'Bhatti et al., Mov Disord Clin Pract 2017',
    jankovic: 'Jankovic, Mov Disord Clin Pract 2016',
    vial: 'Vial et al., Clin Neurophysiol Pract 2019',
    elble2006: 'Elble et al., Brain 2006',
    elble1996: 'Elble, J Clin Neurophysiol 1996',
    hogan: 'Hogan & Sternad, J Mot Behav 2009',
    zutt: 'Zutt et al., Neurology 2018',
    schwingenschuh: 'Schwingenschuh et al., Mov Disord 2016',
    deuschl2022: 'Deuschl et al., Clin Neurophysiol 2022',
    rajan: 'Rajan et al., Mov Disord Clin Pract 2023',
    purrer: 'Purrer et al., Front Neurol 2025',
  };

  const LABELS = {
    PD: 'Tremor parkinsoniano',
    ET: 'Tremor essencial',
    EPT: 'Tremor fisiológico exacerbado',
    DT: 'Tremor distônico',
    OT: 'Tremor ortostático',
    CER: 'Tremor cerebelar / de baixa frequência',
  };

  const CONDITIONS = {
    rest: 'repouso', posture: 'postural', kinetic: 'cinético', orthostatic: 'ortostático (em pé)',
  };
  const SEGMENTS = {
    hand: 'mão', forearm: 'antebraço', arm: 'braço', leg: 'perna', foot: 'pé', head: 'cabeça', trunk: 'tronco', jaw: 'mandíbula', other: 'outro segmento',
  };
  const SIDES = { right: 'direito', left: 'esquerdo', bilateral: 'bilateral', na: '' };
  const FEMININE = { hand: true, leg: true, head: true, jaw: true };
  function sideText(segment, side) {
    if (!side || side === 'na') return '';
    if (side === 'bilateral') return 'bilateral';
    const fem = !!FEMININE[segment];
    return side === 'right' ? (fem ? 'direita' : 'direito') : (fem ? 'esquerda' : 'esquerdo');
  }

  // Limiares heurísticos (documentados em docs/LITERATURA.md, seção 5)
  const T = {
    tsiCut: 1.05,          // di Biase 2017
    tsiMinCycles: 20,
    cvRegular: 0.10, cvIrregular: 0.20,
    harmHigh: 0.15, harmLow: 0.05,
    rmsLow: 0.3, rmsHigh: 1.0,   // m/s² (heurístico)
    relPeakStrong: 0.5,
    fwhmBroad: 1.5,
    entropyHigh: 0.7,
    windowSdHigh: 0.8, windowSdVeryHigh: 1.5,
    ampCvHigh: 0.5,
    jerkSpiky: 2.5,
    persistenceLow: 0.5,
  };

  function fmt(v, d) { return (v === null || v === undefined || Number.isNaN(v)) ? '—' : Number(v).toFixed(d === undefined ? 2 : d).replace('.', ','); }
  function inRange(v, a, b) { return v >= a && v <= b; }

  function describeProtocol(p) {
    const cond = CONDITIONS[p.condition] || p.condition || 'condição não informada';
    const seg = SEGMENTS[p.segment] || p.segment || 'segmento não informado';
    const side = sideText(p.segment, p.side);
    return `tremor ${cond} — ${seg}${side ? ' ' + side : ''}`;
  }

  function interpret(R, protocol) {
    const p = Object.assign({ condition: 'posture', segment: 'hand', side: 'na' }, protocol || {});
    const m = R.metrics;
    const findings = [];
    const suggestions = [];
    const flags = [];
    const hyp = {};
    const add = (key, w, text, ref, primary) => {
      if (!hyp[key]) hyp[key] = { key, label: LABELS[key], score: 0, evidence: [], primary: false };
      hyp[key].score += w;
      if (primary && w > 0) hyp[key].primary = true;
      hyp[key].evidence.push({ dir: w > 0 ? '+' : (w < 0 ? '−' : '0'), weight: w, text, ref: ref ? REFS[ref] : null });
    };

    const isLeg = ['leg', 'foot', 'trunk'].includes(p.segment);
    const f = m.peakFreq;
    const tsiValid = Number.isFinite(m.tsi) && m.tsiCycles >= T.tsiMinCycles;

    // ------------------------------------------------------------------
    // 0) Qualidade e detecção
    // ------------------------------------------------------------------
    if (R.sampling.duration < 30) findings.push({ level: 'warn', label: 'Duração', text: `Registro de ${fmt(R.sampling.duration, 0)} s; recomenda-se ≥ 30 s por condição (${REFS.vial}).` });
    if (R.sampling.fs < 50) findings.push({ level: 'warn', label: 'Amostragem', text: `Taxa de ${fmt(R.sampling.fs, 0)} Hz limita a banda analisável a ${fmt(0.45 * R.sampling.fs, 0)} Hz.` });
    (R.warnings || []).forEach(w => findings.push({ level: 'warn', label: 'Aviso', text: w }));

    if (!m.detected) {
      findings.push({ level: 'info', label: 'Detecção', text: `Nenhum pico de tremor com potência relativa suficiente na banda ${R.spectrum.bandLow}–${fmt(R.spectrum.bandHigh, 0)} Hz (potência relativa ${fmt(m.relPeakPower)}, SNR ${fmt(m.snrDb, 1)} dB; critério de ${REFS.luft}).` });
      let summary = `Não foi detectado tremor rítmico significativo no registro (${describeProtocol(p)}).`;
      if (m.rms < T.rmsLow) summary += ` A amplitude é baixa (RMS ${fmt(m.rms)} m/s²), compatível com ausência de tremor patológico ou com tremor fisiológico de baixa amplitude nesta condição.`;
      suggestions.push('Repetir a coleta garantindo fixação firme do aparelho no segmento e a condição de ativação em que o tremor aparece clinicamente.');
      suggestions.push('Se o tremor é intermitente, prolongar a coleta (60–120 s) e observar a persistência.');
      return { status: 'not_detected', summary, protocolText: describeProtocol(p), hypotheses: [], findings, suggestions, flags, thresholds: T };
    }

    // ------------------------------------------------------------------
    // 1) Achados descritivos
    // ------------------------------------------------------------------
    const regular = Number.isFinite(m.instFreqCv) ? (m.instFreqCv < T.cvRegular ? 'regular' : (m.instFreqCv < T.cvIrregular ? 'moderadamente irregular' : 'irregular')) : 'regularidade indeterminada';
    findings.push({ level: 'ok', label: 'Pico', text: `Frequência de pico ${fmt(f, 1)} Hz (FWHM ${fmt(m.fwhm)} Hz; potência relativa ${fmt(m.relPeakPower)}; SNR ${fmt(m.snrDb, 1)} dB; persistência ${fmt(m.persistence * 100, 0)}% das janelas).` });
    findings.push({ level: 'info', label: 'Regularidade', text: `Frequência instantânea ${fmt(m.instFreqMean, 1)} ± ${fmt(m.instFreqSd, 2)} Hz (CV ${fmt(m.instFreqCv * 100, 0)}%): ${regular}. TSI ${tsiValid ? fmt(m.tsi) + ' (' + m.tsiCycles + ' ciclos)' : 'não confiável (' + m.tsiCycles + ' ciclos)'}.` });
    findings.push({ level: 'info', label: 'Amplitude', text: `RMS ${fmt(m.rms, 3)} m/s² (log₁₀ ${fmt(m.logRms)}); deslocamento estimado no pico ≈ ${fmt(m.displacementMm, 2)} mm. Escalas clínicas relacionam-se com o logaritmo da amplitude (${REFS.elble2006}).` });
    findings.push({ level: 'info', label: 'Forma de onda', text: `Razão harmônica ${fmt(m.harmonicRatio, 3)}; jerk normalizado ${fmt(m.normalizedJerk)}; entropia espectral ${fmt(m.spectralEntropy)}.` });
    if (m.persistence < T.persistenceLow) findings.push({ level: 'warn', label: 'Intermitência', text: `Tremor presente em apenas ${fmt(m.persistence * 100, 0)}% das janelas de 3 s: padrão intermitente (${REFS.luft}).` });

    // ------------------------------------------------------------------
    // 2) Regras por hipótese
    // ------------------------------------------------------------------
    // --- Parkinsoniano
    if (p.condition === 'rest' && inRange(f, 3.5, 7)) add('PD', 2, `Tremor de repouso com pico em ${fmt(f, 1)} Hz (faixa 4–6 Hz típica do tremor parkinsoniano).`, 'consenso', true);
    if (p.condition === 'posture' && inRange(f, 3.5, 7)) add('PD', 0.5, `Tremor postural em ${fmt(f, 1)} Hz: compatível com tremor reemergente da DP (mesma frequência do tremor de repouso, 3–5 Hz), a confirmar pela latência de aparecimento na postura.`, 'jankovic', true);
    if (p.condition === 'posture' && f > 8) add('PD', -1.5, `Tremor postural acima de 8 Hz é atípico para tremor parkinsoniano.`, 'consenso');
    if (p.condition === 'kinetic' && f > 7) add('PD', -1, 'Tremor cinético de frequência > 7 Hz é atípico para DP.', 'consenso');
    if (tsiValid && inRange(f, 2, 9)) {
      if (m.tsi <= T.tsiCut) { add('PD', 1.5, `TSI ${fmt(m.tsi)} ≤ 1,05 (ponto de corte que favorece tremor parkinsoniano; sens./espec. ≈ 95%, independente da postura; DP média 0,5–0,7 vs TE 1,3–1,9).`, 'diBiase'); add('ET', -1.5, `TSI ${fmt(m.tsi)} ≤ 1,05 favorece DP em vez de TE.`, 'diBiase'); }
      else { add('ET', 1.5, `TSI ${fmt(m.tsi)} > 1,05 (ponto de corte que favorece tremor essencial; TE média 1,3–1,9 vs DP 0,5–0,7).`, 'diBiase'); add('PD', -1.5, `TSI ${fmt(m.tsi)} > 1,05 desfavorece tremor parkinsoniano.`, 'diBiase'); }
    }
    if (Number.isFinite(m.harmonicRatio)) {
      if (m.harmonicRatio > T.harmHigh) { add('PD', 1, `Razão harmônica elevada (${fmt(m.harmonicRatio, 3)}): forma de onda assimétrica, típica do tremor parkinsoniano.`, 'wile'); add('ET', -1, `Razão harmônica elevada (${fmt(m.harmonicRatio, 3)}) é incomum no tremor essencial.`, 'wile'); }
      else if (m.harmonicRatio < T.harmLow) { add('ET', 0.5, `Razão harmônica baixa (${fmt(m.harmonicRatio, 3)}): oscilação quase senoidal.`, 'wile'); add('PD', -0.5, `Razão harmônica baixa (${fmt(m.harmonicRatio, 3)}) é menos típica na DP.`, 'wile'); }
    }
    if (Number.isFinite(m.instFreqCv) && m.instFreqCv < T.cvRegular) { add('PD', 0.5, `Tremor regular (CV ${fmt(m.instFreqCv * 100, 0)}%).`, 'deuschl2022'); add('ET', 0.5, `Tremor regular (CV ${fmt(m.instFreqCv * 100, 0)}%), como esperado em TE.`, 'shaikh'); }

    // --- Essencial
    if ((p.condition === 'posture' || p.condition === 'kinetic') && inRange(f, 4, 12)) add('ET', 2, `Tremor ${CONDITIONS[p.condition]} com pico em ${fmt(f, 1)} Hz (faixa 4–12 Hz do tremor essencial).`, 'consenso', true);
    if ((p.condition === 'posture' || p.condition === 'kinetic') && inRange(f, 5, 8)) add('ET', 0.5, `Frequência ${fmt(f, 1)} Hz na faixa mais frequente do TE nas mãos (5–8 Hz).`, 'rajan');
    if (p.condition === 'rest' && inRange(f, 4, 12)) add('ET', -1, 'Tremor de repouso é incomum no TE (embora ocorra em ~25% dos casos avançados).', 'rajan');
    if (Number.isFinite(m.instFreqCv) && m.instFreqCv > T.cvIrregular) add('ET', -1, `Irregularidade elevada (CV ${fmt(m.instFreqCv * 100, 0)}%) é atípica no TE.`, 'shaikh');
    if (isLeg && p.condition === 'orthostatic') add('ET', -2, 'Tremor de membros inferiores em ortostase não caracteriza TE.', 'consenso');

    // --- Fisiológico exacerbado
    if (p.condition === 'posture' && inRange(f, 8, 12)) {
      let w = 1;
      const reasons = [`pico em ${fmt(f, 1)} Hz (8–12 Hz)`];
      if (m.rms < T.rmsLow) { w += 1; reasons.push(`amplitude baixa (RMS ${fmt(m.rms, 3)} m/s²)`); }
      if (m.relPeakPower < T.relPeakStrong || m.fwhm > T.fwhmBroad) { w += 1; reasons.push(`pico largo/pouco proeminente (FWHM ${fmt(m.fwhm)} Hz, potência relativa ${fmt(m.relPeakPower)})`); }
      if (m.spectralEntropy > T.entropyHigh) { w += 0.5; reasons.push(`entropia espectral alta (${fmt(m.spectralEntropy)})`); }
      add('EPT', w, `Tremor postural ${reasons.join(', ')}: perfil compatível com tremor fisiológico exacerbado (componente mecânico-reflexo).`, 'elble1996', true);
      if (m.rms > T.rmsHigh) add('EPT', -1, `Amplitude alta (RMS ${fmt(m.rms, 2)} m/s²) é incomum no tremor fisiológico exacerbado.`, 'vial');
      suggestions.push('Prova de carga (peso de 500 g no punho): no tremor fisiológico exacerbado a frequência cai; no TE e na DP não muda (Vial et al., 2019).');
    }

    // --- Distônico
    if ((p.condition === 'posture' || p.condition === 'kinetic') && inRange(f, 3, 10)) {
      let w = 0; const reasons = [];
      if (Number.isFinite(m.instFreqCv) && m.instFreqCv > 0.15) { w += 1; reasons.push(`irregularidade ciclo a ciclo (CV ${fmt(m.instFreqCv * 100, 0)}%)`); }
      if (Number.isFinite(m.windowPeakSd) && m.windowPeakSd > T.windowSdHigh) { w += 1; reasons.push(`variabilidade da frequência de pico entre janelas (DP ${fmt(m.windowPeakSd)} Hz)`); }
      if (Number.isFinite(m.amplitudeCv) && m.amplitudeCv > T.ampCvHigh) { w += 0.5; reasons.push(`amplitude flutuante (CV do envelope ${fmt(m.amplitudeCv * 100, 0)}%)`); }
      if (tsiValid && m.tsi >= 2) { w += 0.5; reasons.push(`TSI alto (${fmt(m.tsi)})`); }
      if (w > 0) add('DT', w, `Padrão irregular — ${reasons.join('; ')} — é descrito no tremor distônico (irregularidade ~50% maior que no TE; TSI maior no tremor distônico). Requer distonia ao exame para o diagnóstico.`, 'panyakaew', true);
    }

    // --- Ortostático
    if (inRange(f, 12.5, 20)) {
      if (p.condition === 'orthostatic' && isLeg) {
        add('OT', 3, `Tremor de ${SEGMENTS[p.segment]} em pé com pico em ${fmt(f, 1)} Hz (13–18 Hz; média 15,7 Hz em 184 pacientes).`, 'hassan', true);
        if (m.relPeakPower > T.relPeakStrong) add('OT', 1, `Pico bem definido (potência relativa ${fmt(m.relPeakPower)}), como observado em smartphone (sens. 88–100%, espec. 92–100%).`, 'bhatti');
        if (Number.isFinite(m.instFreqCv) && m.instFreqCv < T.cvRegular) add('OT', 1, `Alta regularidade (CV ${fmt(m.instFreqCv * 100, 0)}%), característica do tremor ortostático.`, 'deuschl2022');
        suggestions.push('Confirmar com EMG de superfície (coerência entre as pernas) conforme o padrão-ouro para tremor ortostático.');
      } else {
        findings.push({ level: 'warn', label: 'Frequência alta', text: `Pico em ${fmt(f, 1)} Hz fora do contexto ortostático/pernas. Se há instabilidade em pé, repetir a coleta com o aparelho fixado na perna, em ortostase (${REFS.bhatti}). Considerar também artefato ou tremor transmitido.` });
      }
    }
    if (p.condition === 'orthostatic' && isLeg && inRange(f, 4, 12)) findings.push({ level: 'info', label: 'Ortostase', text: `Tremor de perna em pé com ${fmt(f, 1)} Hz: não preenche a faixa do tremor ortostático primário (13–18 Hz); considerar tremor ortostático "lento"/pseudo-ortostático ou outra etiologia (${REFS.consenso}).` });

    // --- Cerebelar / baixa frequência
    if (inRange(f, 2, 4.5)) {
      if (p.condition === 'kinetic') add('CER', 1.5, `Tremor cinético de baixa frequência (${fmt(f, 1)} Hz): compatível com tremor cerebelar/intenção.`, 'consenso', true);
      else add('CER', 0.5, `Pico de baixa frequência (${fmt(f, 1)} Hz): tremores < 4–5 Hz incluem tremor cerebelar, de Holmes e mioritmia; correlacionar com o exame.`, 'consenso', true);
      if (m.rms > T.rmsHigh) add('CER', 0.5, 'Amplitude alta.', 'consenso');
    }

    // ------------------------------------------------------------------
    // 3) Sinalizadores (não hipóteses)
    // ------------------------------------------------------------------
    if ((Number.isFinite(m.instFreqCv) && m.instFreqCv > 0.25) || (Number.isFinite(m.windowPeakSd) && m.windowPeakSd > T.windowSdVeryHigh)) {
      flags.push({ key: 'variability', label: 'Variabilidade de frequência muito alta', text: `CV ${fmt(m.instFreqCv * 100, 0)}% / DP entre janelas ${fmt(m.windowPeakSd)} Hz. Achado inespecífico: ocorre em tremor distônico, tremor funcional e registros com artefato. Os critérios laboratoriais de tremor funcional exigem testes de entrainment, coerência e tapping (${REFS.schwingenschuh}).` });
      suggestions.push('Se houver suspeita de tremor funcional: testar distratibilidade, entrainment com tapping contralateral (1, 3 e 5 Hz) e sinal de coativação (Schwingenschuh et al., 2016).');
    }
    if (Number.isFinite(m.normalizedJerk) && m.normalizedJerk > T.jerkSpiky && Number.isFinite(m.instFreqCv) && m.instFreqCv > T.cvRegular) {
      flags.push({ key: 'spiky', label: 'Forma de onda espiculada', text: `Jerk normalizado ${fmt(m.normalizedJerk)} (≈1 para oscilação senoidal). Movimentos bruscos/irregulares podem corresponder a mioclonia ou artefato; a distinção exige EMG (duração dos surtos) e, se necessário, retro-média EEG-EMG (${REFS.zutt}).` });
    }
    if (R.axisInfo && R.axisInfo.mode === 'auto' && Number.isFinite(R.axisInfo.explained) && R.axisInfo.explained < 0.6) {
      findings.push({ level: 'info', label: 'Eixo', text: `O eixo principal explica apenas ${fmt(R.axisInfo.explained * 100, 0)}% da variância: tremor multiplanar (p.ex., pronação-supinação) ou movimento não tremulante.` });
    }

    // ------------------------------------------------------------------
    // 4) Consolidação
    // ------------------------------------------------------------------
    const hypotheses = Object.values(hyp).filter(h => h.score > 0 && h.primary).sort((a, b) => b.score - a.score)
      .map(h => Object.assign(h, { confidence: h.score >= 3.5 ? 'alta' : (h.score >= 2 ? 'moderada' : 'baixa') }));

    let summary = `${describeProtocol(p)[0].toUpperCase() + describeProtocol(p).slice(1)}: pico em ${fmt(f, 1)} Hz, ${regular}` +
      (tsiValid ? `, TSI ${fmt(m.tsi)}` : '') + `, razão harmônica ${fmt(m.harmonicRatio, 2)}, RMS ${fmt(m.rms, 2)} m/s².`;
    if (hypotheses.length) {
      const top = hypotheses[0];
      summary += ` Perfil eletrofisiológico mais compatível com ${top.label.toLowerCase()} (confiança ${top.confidence})` +
        (hypotheses[1] && hypotheses[1].score >= top.score * 0.7 ? `; ${hypotheses[1].label.toLowerCase()} é alternativa próxima.` : '.');
    } else {
      summary += ' O padrão não se enquadra claramente em uma síndrome de tremor definida; correlacionar com o exame clínico.';
    }
    suggestions.push('Registrar as demais condições de ativação (repouso, postura e movimento) para caracterizar o Eixo 1 do consenso IPMDS 2018.');

    return { status: 'detected', summary, protocolText: describeProtocol(p), hypotheses, findings, suggestions, flags, thresholds: T };
  }

  return { interpret, LABELS, CONDITIONS, SEGMENTS, SIDES, REFS, THRESHOLDS: T, fmt, describeProtocol, sideText };
});
