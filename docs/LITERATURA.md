# TremorPSD — Revisão da literatura e auditoria dos cálculos

**Versão:** 2.0 (setembro de 2026)
**Autor da revisão:** gerada com apoio de IA (Claude Code) a pedido de Pedro Renato de Paula Brandão, MD, PhD.
**Método:** buscas no PubMed (setembro de 2026) por cada métrica implementada, pelas diretrizes de classificação de tremor da International Parkinson and Movement Disorder Society (IPMDS) e pelos estudos de validação de acelerometria em smartphones. Todas as referências abaixo foram verificadas no PubMed (PMID e DOI conferidos). A lista completa está na seção 8.

> Este documento explica **o que cada número do aplicativo significa**, **de onde vem a fórmula**, **quais faixas de referência têm base na literatura** e **quais bugs foram encontrados na versão anterior e como foram corrigidos**.

---

## 1. Contexto clínico: como a literatura define e classifica tremor

O consenso da IPMDS de 2018 (Bhatia et al., 2018 [1]) define tremor como movimento involuntário, rítmico e oscilatório de uma parte do corpo, classificado em dois eixos: **Eixo 1** (características clínicas: história, distribuição corporal, **condição de ativação** — repouso, postural, cinético, intenção, ortostático —, sinais associados e **testes laboratoriais, incluindo eletrofisiologia**) e **Eixo 2** (etiologia). O consenso anterior (Deuschl, Bain e Brin, 1998 [2]) já organizava as síndromes por condição de ativação e frequência.

Consequência prática para o aplicativo: **a frequência isolada não classifica um tremor**. A mesma frequência de 5 Hz pode ser tremor parkinsoniano (repouso), tremor essencial (postural) ou tremor distônico. Por isso a versão 2.0 **exige registrar a condição de ativação e o segmento corporal** antes da coleta e usa essas informações na interpretação.

A revisão de Deuschl et al. (2022 [3]) e o guia prático de Vial et al. (2019 [4]) sistematizam o que a eletrofisiologia acrescenta: medida precisa da **frequência**, da **regularidade/ritmicidade**, distinção entre oscilação mecânico-reflexa e central (prova de carga), e documentação de supressão/arrastamento (entrainment). Elble e Ondo (2022 [5]) e a força-tarefa da IPMDS (Haubenberger et al., 2016 [6]) concluem que transdutores (acelerômetros, giroscópios) são **mais precisos que escalas clínicas para frequência e amplitude**, mas que a **variabilidade natural da amplitude** limita a detecção de mudanças pequenas.

### Faixas de frequência por síndrome (base para as faixas de referência do app)

| Síndrome | Frequência típica | Condição de ativação | Fonte |
|---|---|---|---|
| Tremor parkinsoniano (repouso) | 4–6 Hz (reemergente 3–5 Hz) | Repouso; reemergente na postura após latência | Bhatia 2018 [1]; Jankovic 2016 [7] |
| Tremor essencial | 4–12 Hz (na prática 5–8 Hz nas mãos) | Postural e cinético | Bhatia 2018 [1]; Rajan 2023 [8] |
| Tremor fisiológico exacerbado | 8–12 Hz (componente mecânico-reflexo muda com carga) | Postural | Elble 1996 [9]; Vial 2019 [4] |
| Tremor distônico | 4–10 Hz, irregular | Postural/cinético, em segmento distônico | Shaikh 2008 [10]; Panyakaew 2020 [11] |
| Tremor ortostático primário | 13–18 Hz (média 15,7 Hz; 12,5–20 Hz) | Ortostase (pernas/tronco em pé) | Hassan 2016 [12]; Bhatti 2017 [13] |
| Tremor cerebelar / Holmes | < 5 Hz | Intenção / repouso + postura + intenção | Bhatia 2018 [1]; Deuschl 1996 [14] |

A banda 13–18 Hz para tremor ortostático foi confirmada por eletromiografia (EMG) em 184 pacientes da Mayo Clinic (Hassan et al., 2016 [12]) e é detectável pelo acelerômetro de smartphone com sensibilidade de 88–100% e especificidade de 92–100% quando o aparelho é fixado na perna em pé (Bhatti et al., 2017 [13]; Balachandar e Fasano, 2017 [15]).

---

## 2. Aquisição com acelerômetro de smartphone

**Validade.** van Brummelen et al. (2020 [16]) compararam sete acelerômetros de consumo (incluindo iPhone 7 e Apple Watch) com um acelerômetro laboratorial em pacientes com Parkinson e tremor essencial: **a frequência de pico não diferiu** do padrão laboratorial; a amplitude no pico foi comparável apenas para alguns aparelhos e depende da **posição do sensor** (distal maior que proximal). López-Blanco et al. (2018 [17]) mostraram correlação moderada a forte (ρ 0,59–0,74) entre RMS do sinal inercial e a escala de Fahn-Tolosa-Marín em tremor essencial, com boa confiabilidade teste-reteste (CCI 0,85–0,95).

**Taxa de amostragem.** A API `DeviceMotion` dos navegadores entrega tipicamente ~60 Hz (iOS Safari) e 60–100 Hz (Android/Chrome), com jitter. A frequência de Nyquist (30–50 Hz) cobre com folga a banda de tremor (até 20 Hz), mas a **resolução espectral** depende do comprimento do segmento analisado, não da taxa.

**Duração.** di Biase et al. (2017 [18]) usaram 100 s de registro para o índice de estabilidade, mas mostraram por bootstrapping que 10 s já dão AUC 0,89; Vial et al. (2019 [4]) e Elble & McNames (2016 [19]) recomendam registros de pelo menos 30–60 s por condição. Na versão 2.0 o padrão passou de 20 s para **30 s**, com máximo de 120 s, e o relatório avisa quando a duração é inferior a 30 s.

**Bugs corrigidos na aquisição (v1 → v2):**

1. **Taxa de amostragem estimada por média móvel exponencial de 1/Δt.** Como E[1/Δt] ≠ 1/E[Δt], o jitter enviesava a estimativa para cima. Agora a taxa é calculada a partir do registro completo: (N−1)/(t_último − t_primeiro), e o sinal é **reamostrado em grade uniforme** por interpolação linear antes da análise espectral (requisito da FFT).
2. **Uso exclusivo de `accelerationIncludingGravity`.** Mudanças lentas de orientação da mão entram como deriva de baixa frequência. Agora o app usa `acceleration` (gravidade removida pelo sistema) quando disponível e, em qualquer caso, aplica **remoção de tendência linear e filtro passa-alta (1 Hz)** antes da análise.
3. **Verificação única do sensor após 1,5 s.** Se o aparelho estivesse parado o app entrava em erro permanente. Agora a verificação é contínua, com orientação clara ao usuário.
4. **Magnitude vetorial como sinal padrão.** Para aceleração linear (sem gravidade), |a| = |A·sen(ωt)| é um sinal retificado cujo pico espectral aparece em 2f; para aceleração com gravidade, |g + a| ≈ g + a·ĝ cancela as componentes perpendiculares à gravidade. A v2 projeta as três componentes (após passa-alta) no **eixo de maior variância (1º componente principal)**, prática usual em acelerometria triaxial, e informa a fração de variância explicada.
5. **Sem contagem regressiva.** O toque no botão contaminava os primeiros segundos. Agora há contagem regressiva de 3 s e descarte automático do primeiro segundo do registro.

---

## 3. Estimativa espectral (método de Welch)

**Literatura.** Timmer, Lauk e Deuschl (1996 [20]) discutem os limites da média de periodogramas de segmentos e propõem critérios para decidir se há picos múltiplos significativos e como estimar amplitude a partir do espectro; Lauk et al. (1999 [21]) implementaram esses métodos em software de análise de tremor. O método de Welch (janela de Hann, sobreposição de 50%) continua sendo o padrão em todos os estudos citados (Vial 2019 [4]; Luft 2019 [22]; Rajan 2023 [8]; Purrer 2025 [23]).

**Bug crítico corrigido.** A v1 usava `nperseg = 2^floor(log2(2·fs))`. A 60 Hz isso dá 64 amostras (≈1,07 s), logo **resolução de 0,94 Hz por bin**. Com essa resolução, FWHM, TSI (na definição antiga) e a própria frequência de pico ficavam quantizados em passos de quase 1 Hz — incompatível com discriminar 4–6 Hz de 5–8 Hz ou medir um pico de tremor essencial (largura típica < 1–2 Hz). Na v2:

- segmento de Welch de **4 s** (nperseg = 4·fs; resolução 0,25 Hz) com 50% de sobreposição;
- **zero-padding** para nfft ≥ 4·nperseg (interpolação espectral, ≈0,06 Hz por bin);
- **interpolação parabólica** do pico sobre os três bins vizinhos (estimativa sub-bin da frequência);
- normalização correta da densidade (potência/Hz) pelo somatório dos quadrados da janela, com fator 2 para o espectro unilateral.

A janela de Hann é agora **periódica** (dividindo por N em vez de N−1), como no SciPy, o que melhora a estimativa da PSD média.

---

## 4. Métrica a métrica

### 4.1 Frequência de pico (Hz)

- **O que é:** frequência de maior densidade espectral na banda de tremor (busca em 2–25 Hz, evitando DC e deriva residual).
- **Base:** é a variável eletrofisiológica mais reprodutível e a mais concordante entre smartphone e laboratório (van Brummelen 2020 [16]; Wile 2014 [24]).
- **Correções:** resolução (seção 3), interpolação parabólica, e **rejeição de picos não significativos**: exige-se que a potência relativa em ±0,5 Hz ao redor do pico exceda uma fração da potência na banda (critério de Luft et al., 2019 [22], usado para detectar janelas com tremor). Se nenhum pico satisfaz o critério, o app informa "tremor não detectado" em vez de inventar um pico de ruído.

### 4.2 Amplitude: RMS da aceleração e deslocamento estimado

- **O que é:** raiz do valor quadrático médio da aceleração filtrada (m/s²). É proporcional à amplitude física do tremor.
- **Base:** Elble et al. (2006 [25]) demonstraram, em 928 pacientes de cinco laboratórios, que escalas de 0–4 pontos se relacionam **logaritmicamente** com a amplitude: T₂/T₁ = 10^(α·ΔTRS), com α ≈ 0,4–0,5 para tremor de repouso e postural — ou seja, 1 ponto na escala corresponde a uma mudança de ~2,5–3× na amplitude. Elble et al. (2016 [26]) confirmaram log(T) = α·TRS + β com acelerometria/giroscopia. Elble & McNames (2016 [19]) e Elble & Ondo (2022 [5]) recomendam reportar a amplitude em escala logarítmica.
- **Correções:** (a) RMS calculado sobre o sinal filtrado 1–30 Hz (antes incluía deriva e gravidade residual); (b) novo cálculo do **deslocamento estimado** no pico, D ≈ A_pico/(2π·f)², onde A_pico é a amplitude de aceleração da componente do pico (a partir da potência integrada no FWHM); (c) reporte adicional de **log₁₀(RMS)** para acompanhamento longitudinal. Ressalva obrigatória: a amplitude em acelerômetro de smartphone depende da posição do aparelho no membro (van Brummelen 2020 [16]) — comparações longitudinais exigem a mesma posição.

### 4.3 Largura à meia altura (FWHM, Hz) e potência à meia altura (HWP)

- **O que é:** largura do pico espectral onde a potência cai a 50% do máximo. Picos estreitos indicam oscilador central estável; picos largos indicam frequência instável ou tremor mecânico-reflexo.
- **Base:** Rajan et al. (2023 [8]) e Purrer et al. (2025 [23]) usam FWHM e a **potência dentro do FWHM (half-width power, HWP)**; Purrer et al. encontraram correlação moderada a forte entre log(HWP) e subescores clínicos (CRST), enquanto FWHM e TSI isolados **não diferiram** entre tremor essencial e parkinsoniano — o que reforça que FWHM é uma medida de regularidade, não um classificador.
- **Correções:** a v1 tomava freqs[direita] − freqs[esquerda] nos primeiros bins **abaixo** da meia altura (erro sistemático de +1 bin em cada lado, ≈ +1,9 Hz a 60 Hz). Agora as travessias da meia altura são **interpoladas linearmente** entre bins. Adicionada a HWP e seu log₁₀.

### 4.4 Índice de estabilidade do tremor (TSI)

- **Definição (di Biase et al., Brain 2017 [18], texto completo verificado):** aceleração triaxial com remoção de tendência (passa-alta Butterworth de 3ª ordem, fase zero, 0,1 Hz); **eixo dominante isolado por análise de componentes principais (PCA)**; identificação do pico entre **2 e 9 Hz**; filtragem passa-banda em torno do pico com filtros Butterworth de fase zero; **cruzamentos de zero com gradiente positivo**; frequência instantânea f(n) = 1/(intervalo entre cruzamentos); Δf(n) = f(n+1) − f(n); **TSI = amplitude interquartil de Δf**. Amplitude obtida do envelope de Hilbert em cada cruzamento.
- **Desempenho:** ponto de corte **1,05** (TSI > 1,05 → tremor essencial; ≤ 1,05 → tremor parkinsoniano). Coorte-teste: TSI médio 0,7 ± 0,18 na DP vs 1,9 ± 0,13 no TE (AUC 0,92); validação independente: 0,5 ± 0,09 vs 1,3 ± 0,19 (AUC 0,86); sensibilidade/especificidade máximas 95%/95%, acurácia 92%. **Bootstrapping mostrou AUC de 0,89 já com 10 s de registro**, e o índice foi **independente do contexto postural** (repouso vs postura) e do dispositivo (acelerômetro no punho, dedo ou dorso da mão; laser). O TSI superou a potência harmônica média (MHP) em 72% das reamostragens.
- **Validações e extensões:** Luft et al. (2019 [22]) mostraram que o TSI deve ser calculado apenas nas **janelas em que há tremor** (detecção por potência relativa em janelas de 3 s) — o app faz isso; Panyakaew et al. (2020 [11]) encontraram **TSI maior no tremor distônico** do que no essencial ou no tremor associado à distonia; Silsby et al. (2023 [27]) usaram o TSI em tremor neuropático (PIDC); Rajan et al. (2023 [8]) não encontraram diferença de TSI entre TE, TE-plus e distônico; Purrer et al. (2025 [23]) não encontraram diferença entre TE e DP em coorte cirúrgica. Ou seja: **o TSI é útil, mas não é infalível**, e o próprio artigo original recomenda testá-lo no tremor distônico.
- **Bug crítico corrigido:** a v1 chamava de "TSI" a razão FWHM/f_pico, que **não é o TSI** e não tem validação. Na v2 o TSI reproduz o procedimento de di Biase: PCA do eixo dominante, passa-banda f_pico ± 2 Hz (Butterworth de fase zero), cruzamentos de zero ascendentes e IQR de Δf, restrito às janelas com tremor. O relatório informa o número de ciclos usados e avisa quando o pico está fora de 2–9 Hz (faixa de validação).

### 4.5 Irregularidade cíclica (coeficiente de variação da frequência instantânea)

- **Base:** Shaikh et al. (2008 [10]) mostraram que a **variabilidade ciclo a ciclo da frequência** é ~50% maior no tremor de membro da distonia cervical do que no tremor essencial, com mesma frequência média — e que isso independe da amplitude. Panyakaew et al. (2020 [11]) confirmaram maior variabilidade de pico e de intervalos de surtos no tremor distônico; um classificador linear com esses parâmetros separou TE, TD e TAWD com 95% de acurácia.
- **Implementação nova:** CV = desvio-padrão/média da frequência instantânea (mesma série usada no TSI) e **desvio-padrão da frequência de pico entre janelas de 3 s** (dispersão temporal).

### 4.6 Índice harmônico (potência nos harmônicos)

- **Base:** Wile et al. (2014 [24]) — com um relógio inteligente, a **potência média nos quatro primeiros harmônicos** separou tremor postural (reemergente) da DP do tremor essencial com sensibilidade 91% e especificidade 100%, e a frequência de pico e a proporção harmônica foram quase idênticas entre relógio e acelerômetro analógico. Jang et al. (2013 [28]) — a razão harmônica distinguiu tremor de repouso da DP do parkinsonismo induzido por drogas. Machowska-Majchrzak et al. (2007 [29]) — índice harmônico mais alto em tremores patológicos que em controles. A explicação fisiológica é a forma de onda não senoidal (assimétrica) do tremor parkinsoniano.
- **Implementação nova:** razão entre a potência nos harmônicos 2f–4f (±0,3 Hz cada) e a potência no fundamental, e a potência harmônica média relativa (Wile). Substitui o "Índice Wavelet" da v1.

### 4.7 Entropia espectral e potência relativa do pico

- **Base:** Hossen et al. (2020 [30]) discriminaram tremor fisiológico de patológico (TE e DP) com acurácia de 94% usando entropia de potência de bandas obtidas por decomposição wavelet; Luft et al. (2019 [22]) usaram a **potência relativa ao redor do pico em relação à banda de tremor** para detectar janelas de tremor (especificidade 96%, sensibilidade 85%); Machowska-Majchrzak et al. (2007 [29]) descreveram que controles têm espectro largo e variável, e tremores patológicos um pico único e persistente.
- **Bugs corrigidos:** a v1 calculava a entropia de Shannon sobre **todo o espectro, incluindo DC e ruído acima de 20 Hz**, em bits não normalizados (dependia do número de bins e, portanto, da taxa de amostragem). Agora: entropia calculada apenas na banda 2–25 Hz e **normalizada por log₂(N)** (0 = tom puro; 1 = ruído branco). Adicionada a **potência relativa do pico** (potência em ±0,5 Hz dividida pela potência de 2–25 Hz) e a **persistência do tremor** (% de janelas de 3 s com tremor detectado — "tremor occurrence" de Elble & McNames [19]).

### 4.8 Jerk

- **Base:** Hogan e Sternad (2009 [31]) demonstraram que medidas de jerk **com dimensão** (m/s³) variam de forma contraintuitiva com amplitude e duração, e que apenas medidas **adimensionais** quantificam suavidade corretamente. Não há na literatura validação de "mediana do jerk" para separar mioclonia de tremor; o diagnóstico eletrofisiológico de mioclonia exige EMG (duração de surtos, retro-média EEG-EMG) — Zutt et al. (2018 [32]; 2017 [33]); Deuschl et al. (1996 [14]).
- **Correções:** o JR50 (mediana de |jerk| em m/s³, dependente da taxa de amostragem e da amplitude) foi substituído pelo **índice de jerk normalizado** J = RMS(jerk)/(2π·f_pico·RMS(aceleração)). Para uma senoide pura na frequência de pico J = 1; valores muito acima de 1 indicam conteúdo de alta frequência/forma de onda espiculada. A categoria "Mioclonia" foi retirada da classificação automática; o relatório apenas sinaliza "padrão irregular/espiculado — considerar EMG".

### 4.9 "Índice Wavelet" (removido)

A v1 comparava a energia máxima de uma única convolução com uma wavelet de Morlet na frequência do pico contra outra em uma frequência arbitrária (5 ou 15 Hz). Não encontramos qualquer respaldo para esse índice. Análises tempo-frequência válidas na literatura usam decomposição wavelet completa para estimar PSD (Hossen 2020 [30]) ou EMD + Hilbert para frequência instantânea (Lee 2014 [34]). Na v2 a informação tempo-frequência é dada por: **espectrograma** (STFT em janelas de 3 s), **frequência de pico por janela**, **persistência do tremor** e **envelope de amplitude** (transformada de Hilbert), todos com base nos trabalhos citados.

### 4.10 Potência total e proeminência do pico

- **Base:** Rajan et al. (2023 [8]) reportam potência total e potência de pico; Luft et al. (2019 [22]) usam a razão pico/banda.
- **Correções:** a "proeminência" da v1 era pico − mínimo global do espectro (basicamente o piso de ruído em alta frequência), sem relação com a definição usual. Foi substituída pela **potência relativa do pico** (4.7) e pela **razão sinal/fundo** (pico dividido pela mediana da PSD na banda 2–25 Hz, em dB). A potência total é agora integrada em 2–25 Hz (m²/s⁴) e reportada também em log₁₀.

### 4.11 Classificação automática

A v1 exibia percentuais de "Ortostático / Essencial / Distônico / Mioclonia" a partir de pesos arbitrários, sem considerar a condição de ativação — o que contraria o consenso [1] e tinha alto risco de induzir erro (por exemplo, atribuir "ortostático" a um tremor de mão de 14 Hz). Na v2 a classificação passou a ser um **apoio à interpretação, baseado em regras explícitas e rastreáveis**, que:

1. usa a condição de ativação e o segmento informados (regouso/postura/cinético/ortostase; mão/perna/cabeça/tronco);
2. aplica as faixas de frequência do consenso [1] e as características eletrofisiológicas descritas por Vial et al. [4] e Deuschl et al. [3];
3. incorpora o TSI com o ponto de corte de di Biase [18] apenas na comparação DP vs TE e apenas quando a condição de ativação é compatível;
4. usa o índice harmônico (Wile [24]) e a irregularidade (Shaikh [10]; Panyakaew [11]) como evidências de apoio;
5. lista **explicitamente** cada evidência a favor e contra, e o grau de confiança;
6. mantém o aviso de que **não substitui diagnóstico clínico**, e sugere os testes que o app não faz (prova de carga, entrainment, EMG).

Tremor funcional: os critérios laboratoriais validados (Schwingenschuh et al., 2016 [35]; Schwingenschuh & Deuschl, 2016 [36]) exigem tarefas de tapping, entrainment, coerência entre membros e prova balística — inviáveis em uma coleta simples com um único sensor. O app apenas sinaliza variabilidade de frequência muito alta como "achado inespecífico; considerar avaliação de tremor funcional em contexto clínico".

---

## 5. Faixas de referência adotadas no relatório

| Métrica | Valor esperado / interpretação | Fonte |
|---|---|---|
| Frequência de pico | Ver tabela da seção 1 | [1, 7, 8, 9, 12] |
| TSI | ≤ 1,05 sugere DP; > 1,05 sugere TE (independente da postura; confiável a partir de 10 s) | [18, 22] |
| CV da frequência instantânea | Maior (~+50%) na distonia; baixo em TE | [10, 11] |
| Índice harmônico | Alto em DP (forma de onda assimétrica); baixo em TE | [24, 28, 29] |
| Potência relativa do pico | Alta = tremor bem definido; baixa = sem tremor/ruído | [22, 29] |
| Entropia espectral normalizada | Próxima de 0 = tom puro; próxima de 1 = ruído (fisiológico/sem tremor) | [30, 29] |
| Persistência do tremor | % do tempo com tremor detectado (janelas de 3 s) | [19, 22] |
| RMS e log₁₀(RMS) | Escala clínica ≈ linear com log(amplitude) | [25, 26, 5] |
| FWHM / HWP | Pico estreito = oscilador estável; log(HWP) correlaciona com escalas | [8, 23] |
| Jerk normalizado | ≈ 1 senoide; ≫ 1 forma de onda espiculada | [31] |

---

## 5.1 Modo demonstração

O app inclui sinais sintéticos (perfis "essencial", "parkinsoniano", "ortostático", "fisiológico", "distônico" e "sem tremor") para conhecer a interface sem sensor. São gerados por um oscilador com deriva de frequência, ruído de fase ciclo a ciclo, harmônico opcional e modulação de amplitude; **não reproduzem a fisiologia** e são sempre rotulados como SIMULAÇÃO no app, no relatório e nos arquivos exportados.

## 6. Limitações que permanecem

1. Um acelerômetro triaxial em um único ponto não substitui EMG: não mede surtos, coerência intermuscular, nem latência de reemergência automaticamente.
2. A amplitude em m/s² depende de onde o aparelho está fixado; comparações longitudinais exigem posição padronizada (van Brummelen 2020 [16]).
3. O TSI foi validado com 100 s de registro (embora o próprio estudo mostre AUC 0,89 com 10 s) e com transdutores fixados com fita; a fixação do smartphone deve ser firme.
4. Não há prova de carga (weight loading) nem tarefas de entrainment; o app sinaliza quando esses testes seriam decisivos.
5. Nenhuma métrica aqui é diagnóstica isoladamente; o relatório é um instrumento de apoio para o profissional.

---

## 7. Resumo dos bugs corrigidos (v1 → v2)

| # | Bug | Impacto | Correção |
|---|---|---|---|
| 1 | Resolução espectral de ~0,94 Hz (nperseg = 2·fs) | Frequência, FWHM e "TSI" quantizados | Segmentos de 4 s, zero-padding 4×, interpolação parabólica |
| 2 | "TSI" = FWHM/f_pico | Métrica sem validação rotulada como TSI | TSI conforme di Biase 2017 (IQR de Δf) |
| 3 | FWHM medida entre bins abaixo da meia altura | Viés de +1 bin por lado (≈ +1,9 Hz) | Interpolação linear das travessias |
| 4 | Entropia sobre todo o espectro, não normalizada | Dependia da taxa de amostragem; incluía DC | Banda 2–25 Hz, normalizada por log₂N |
| 5 | "Proeminência" = pico − mínimo global | Sem significado | Potência relativa do pico e razão sinal/fundo (dB) |
| 6 | Jerk mediano em m/s³ | Dependente de fs e amplitude (Hogan & Sternad) | Jerk normalizado adimensional |
| 7 | Índice wavelet ad hoc | Sem respaldo | Espectrograma, persistência, envelope de Hilbert |
| 8 | Taxa de amostragem por EMA de 1/Δt | Viés por jitter; sinal não uniforme na FFT | fs global + reamostragem uniforme |
| 9 | Apenas remoção da média (gravidade/deriva residual) | Energia espúria em baixa frequência | Detrend linear + passa-alta 1 Hz + passa-baixa 30 Hz |
| 10 | Classificação por pesos arbitrários, sem condição de ativação | Sugestões clinicamente inconsistentes | Regras explícitas baseadas no consenso IPMDS + evidências listadas |
| 11 | Verificação única do sensor; sem contagem regressiva | Falsos erros; contaminação inicial | Verificação contínua; 3 s de contagem; descarte de 1 s inicial |
| 12 | PDF alterava o estado dos gráficos da tela | Gráficos ficavam corrompidos após exportar | Renderização em canvas dedicados fora da tela |
| 13 | PWA sem ícones e sem pré-cache das bibliotecas CDN | Não instalável; não funcionava offline | Ícones, manifest completo, bibliotecas vendorizadas e pré-cacheadas |
| 14 | Tailwind via CDN (compilador em tempo de execução) | Lento e dependente de rede | CSS próprio (design system) |
| 15 | Eixo padrão = magnitude vetorial \|a\| | Com aceleração linear, \|a\| retifica a oscilação e **dobra a frequência aparente**; com gravidade, atenua componentes horizontais | Projeção no eixo principal (PCA) das componentes filtradas; eixos X/Y/Z e magnitude mantidos como opções |

---

## 8. Referências (verificadas no PubMed)

1. Bhatia KP, Bain P, Bajaj N, et al. Consensus Statement on the classification of tremors. From the task force on tremor of the International Parkinson and Movement Disorder Society. *Mov Disord.* 2018;33(1):75-87. PMID 29193359. https://doi.org/10.1002/mds.27121
2. Deuschl G, Bain P, Brin M; Ad Hoc Scientific Committee. Consensus statement of the Movement Disorder Society on Tremor. *Mov Disord.* 1998;13 Suppl 3:2-23. PMID 9827589. https://doi.org/10.1002/mds.870131303
3. Deuschl G, Becktepe JS, Dirkx M, et al. The clinical and electrophysiological investigation of tremor. *Clin Neurophysiol.* 2022;136:93-129. PMID 35149267. https://doi.org/10.1016/j.clinph.2022.01.004
4. Vial F, Kassavetis P, Merchant S, Haubenberger D, Hallett M. How to do an electrophysiological study of tremor. *Clin Neurophysiol Pract.* 2019;4:134-142. PMID 31886436. https://doi.org/10.1016/j.cnp.2019.06.002
5. Elble RJ, Ondo W. Tremor rating scales and laboratory tools for assessing tremor. *J Neurol Sci.* 2022;435:120202. PMID 35220111. https://doi.org/10.1016/j.jns.2022.120202
6. Haubenberger D, Abbruzzese G, Bain PG, et al. Transducer-based evaluation of tremor. *Mov Disord.* 2016;31(9):1327-1336. PMID 27273470. https://doi.org/10.1002/mds.26671
7. Jankovic J. How do I examine for re-emergent tremor? *Mov Disord Clin Pract.* 2016;3(2):216-217. PMID 30363601. https://doi.org/10.1002/mdc3.12329
8. Rajan R, Anandapadmanabhan R, Vishnoi A, et al. Essential tremor and essential tremor plus are essentially similar electrophysiologically. *Mov Disord Clin Pract.* 2023;11(2):136-142. PMID 38386479. https://doi.org/10.1002/mdc3.13941
9. Elble RJ. Central mechanisms of tremor. *J Clin Neurophysiol.* 1996;13(2):133-144. PMID 8849968. https://doi.org/10.1097/00004691-199603000-00004
10. Shaikh AG, Jinnah HA, Tripp RM, et al. Irregularity distinguishes limb tremor in cervical dystonia from essential tremor. *J Neurol Neurosurg Psychiatry.* 2008;79(2):187-189. PMID 17872981. https://doi.org/10.1136/jnnp.2007.131110
11. Panyakaew P, Cho HJ, Lee SW, et al. The pathophysiology of dystonic tremors and comparison with essential tremor. *J Neurosci.* 2020;40(48):9317-9326. PMID 33097635. https://doi.org/10.1523/JNEUROSCI.1181-20.2020
12. Hassan A, Ahlskog JE, Matsumoto JY, et al. Orthostatic tremor: clinical, electrophysiologic, and treatment findings in 184 patients. *Neurology.* 2016;86(5):458-464. PMID 26747880. https://doi.org/10.1212/WNL.0000000000002328
13. Bhatti D, Thompson R, Hellman A, et al. Smartphone apps provide a simple, accurate bedside screening tool for orthostatic tremor. *Mov Disord Clin Pract.* 2017;4(6):852-857. PMID 30363432. https://doi.org/10.1002/mdc3.12547
14. Deuschl G, Krack P, Lauk M, Timmer J. Clinical neurophysiology of tremor. *J Clin Neurophysiol.* 1996;13(2):110-121. PMID 8849966. https://doi.org/10.1097/00004691-199603000-00002
15. Balachandar A, Fasano A. Characterizing orthostatic tremor using a smartphone application. *Tremor Other Hyperkinet Mov (N Y).* 2017;7:488. PMID 28975048. https://doi.org/10.7916/D8V12GRJ
16. van Brummelen EMJ, Ziagkos D, de Boon WMI, et al. Quantification of tremor using consumer product accelerometry is feasible in patients with essential tremor and Parkinson's disease: a comparative study. *J Clin Mov Disord.* 2020;7:4. PMID 32280482. https://doi.org/10.1186/s40734-020-00086-7
17. López-Blanco R, Velasco MA, Méndez-Guerrero A, et al. Essential tremor quantification based on the combined use of a smartphone and a smartwatch: the NetMD study. *J Neurosci Methods.* 2018;303:95-102. PMID 29481820. https://doi.org/10.1016/j.jneumeth.2018.02.015
18. di Biase L, Brittain JS, Shah SA, et al. Tremor stability index: a new tool for differential diagnosis in tremor syndromes. *Brain.* 2017;140(7):1977-1986. PMID 28459950. https://doi.org/10.1093/brain/awx104
19. Elble RJ, McNames J. Using portable transducers to measure tremor severity. *Tremor Other Hyperkinet Mov (N Y).* 2016;6:375. PMID 27257514. https://doi.org/10.7916/D8DR2VCC
20. Timmer J, Lauk M, Deuschl G. Quantitative analysis of tremor time series. *Electroencephalogr Clin Neurophysiol.* 1996;101(5):461-468. PMID 8913201.
21. Lauk M, Timmer J, Lücking CH, Honerkamp J, Deuschl G. A software for recording and analysis of human tremor. *Comput Methods Programs Biomed.* 1999;60(1):65-77. PMID 10430464. https://doi.org/10.1016/s0169-2607(99)00012-7
22. Luft F, Sharifi S, Mugge W, et al. A power spectral density-based method to detect tremor and tremor intermittency in movement disorders. *Sensors (Basel).* 2019;19(19):4301. PMID 31590227. https://doi.org/10.3390/s19194301
23. Purrer V, Chand T, Pohl E, et al. Quantitative and qualitative tremor evaluation after MR-guided focused ultrasound thalamotomy. *Front Neurol.* 2025;16:1594382. PMID 40386019. https://doi.org/10.3389/fneur.2025.1594382
24. Wile DJ, Ranawaya R, Kiss ZH. Smart watch accelerometry for analysis and diagnosis of tremor. *J Neurosci Methods.* 2014;230:1-4. PMID 24769376. https://doi.org/10.1016/j.jneumeth.2014.04.021
25. Elble RJ, Pullman SL, Matsumoto JY, et al. Tremor amplitude is logarithmically related to 4- and 5-point tremor rating scales. *Brain.* 2006;129(Pt 10):2660-2666. PMID 16891320. https://doi.org/10.1093/brain/awl190
26. Elble RJ, Hellriegel H, Raethjen J, Deuschl G. Assessment of head tremor with accelerometers versus gyroscopic transducers. *Mov Disord Clin Pract.* 2016;4(2):205-211. PMID 30363428. https://doi.org/10.1002/mdc3.12379
27. Silsby M, Fois AF, Yiannikas C, et al. Chronic inflammatory demyelinating polyradiculoneuropathy-associated tremor: phenotype and pathogenesis. *Eur J Neurol.* 2023;30(4):1059-1068. PMID 36692234. https://doi.org/10.1111/ene.15693
28. Jang W, Han J, Park J, et al. Waveform analysis of tremor may help to differentiate Parkinson's disease from drug-induced parkinsonism. *Physiol Meas.* 2013;34(3):N15-N24. PMID 23442947. https://doi.org/10.1088/0967-3334/34/3/N15
29. Machowska-Majchrzak A, Pierzchała K, Pietraszek S. Analysis of selected parameters of tremor recorded by a biaxial accelerometer in patients with parkinsonian tremor, essential tremor and cerebellar tremor. *Neurol Neurochir Pol.* 2007;41(3):241-250. PMID 17629818.
30. Hossen A, Deuschl G, Groppa S, Heute U, Muthuraman M. Discrimination of physiological tremor from pathological tremor using accelerometer and surface EMG signals. *Technol Health Care.* 2020;28(5):461-476. PMID 32280070. https://doi.org/10.3233/THC-191947
31. Hogan N, Sternad D. Sensitivity of smoothness measures to movement duration, amplitude, and arrests. *J Mot Behav.* 2009;41(6):529-534. PMID 19892658. https://doi.org/10.3200/35-09-004-RC
32. Zutt R, Elting JW, van Zijl JC, et al. Electrophysiologic testing aids diagnosis and subtyping of myoclonus. *Neurology.* 2018;90(8):e647-e657. PMID 29352095. https://doi.org/10.1212/WNL.0000000000004996
33. Zutt R, Elting JW, van der Hoeven JH, et al. Myoclonus subtypes in tertiary referral center. Cortical myoclonus and functional jerks are common. *Clin Neurophysiol.* 2017;128(1):253-259. PMID 27940047. https://doi.org/10.1016/j.clinph.2016.10.093
34. Lee A, Schoonderwaldt E, Chadde M, Altenmüller E. Analysis of dystonic tremor in musicians using empirical mode decomposition. *Clin Neurophysiol.* 2015;126(1):147-153. PMID 24845599. https://doi.org/10.1016/j.clinph.2014.04.013
35. Schwingenschuh P, Saifee TA, Katschnig-Winter P, et al. Validation of "laboratory-supported" criteria for functional (psychogenic) tremor. *Mov Disord.* 2016;31(4):555-562. PMID 26879346. https://doi.org/10.1002/mds.26525
36. Schwingenschuh P, Deuschl G. Functional tremor. *Handb Clin Neurol.* 2016;139:229-233. PMID 27719841. https://doi.org/10.1016/B978-0-12-801772-2.00019-9
37. Elble RJ. Tremor pathophysiology. *Clin Park Relat Disord.* 2026;14:100455. PMID 42255498. https://doi.org/10.1016/j.prdoa.2026.100455

Fonte das buscas: PubMed (NLM), setembro de 2026.
