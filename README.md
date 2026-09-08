# TremorPSD 2.0 — análise quantitativa de tremor no navegador

Aplicativo web progressivo (PWA) para **análise quantitativa de tremor** com o acelerômetro de smartphones e tablets. Estima o espectro de potência (método de Welch), o **índice de estabilidade do tremor (TSI)**, a irregularidade ciclo a ciclo, o conteúdo harmônico, a amplitude e a persistência do tremor, e gera um **relatório detalhado** com faixas de referência e citações da literatura. Funciona **offline**, sem enviar dados a servidores.

> Instrumento de apoio à avaliação clínica e à pesquisa. **Não é um dispositivo diagnóstico.** A classificação de tremor é clínica (IPMDS 2018); o app lista evidências eletrofisiológicas a favor e contra cada hipótese, com as fontes.

## Novidades da versão 2.0

- **Revisão completa da literatura** de cada cálculo, com 37 referências verificadas no PubMed, e **auditoria de 15 bugs** da versão anterior — ver [`docs/LITERATURA.md`](docs/LITERATURA.md). As fórmulas de cada índice e as regras de classificação estão detalhadas [abaixo](#como-cada-índice-é-calculado).
- **TSI correto** (di Biase et al., Brain 2017): PCA do eixo dominante, passa-banda em torno do pico, cruzamentos de zero e amplitude interquartil de Δf, com o ponto de corte de 1,05.
- **Resolução espectral adequada** (segmentos de 4 s, zero-padding, interpolação parabólica do pico e interpolação da FWHM).
- Novas métricas com base na literatura: irregularidade (CV da frequência instantânea), razão harmônica, potência relativa do pico, persistência, entropia normalizada, envelope de Hilbert, jerk normalizado, deslocamento estimado.
- **Protocolo de coleta** (condição de ativação, segmento, lado, duração, eixo) usado na interpretação por regras explícitas.
- **Gráficos** interativos: sinal no tempo, PSD com faixas de referência, espectrograma e frequência instantânea.
- **Relatório detalhado** e exportação em **PDF, HTML, JSON, CSV (métricas, sinal bruto, espectro), PNG**, impressão e compartilhamento nativo.
- **Design system** inspirado nas Human Interface Guidelines da Apple, com temas **claro, escuro e automático**.
- **PWA completo**: ícones, manifest, service worker com pré-cache e bibliotecas vendorizadas (funciona sem rede).
- **Modo demonstração** com sinais sintéticos rotulados (nunca confundidos com registros reais).

## Como usar

1. Publique a pasta em um servidor **HTTPS** (GitHub Pages funciona) e abra no smartphone.
2. Toque em **Começar** e conceda a permissão de movimento (no iOS o pedido aparece na tela; se negado: Ajustes › Safari › Movimento e orientação).
3. Preencha o **protocolo**: condição de ativação (repouso, postural, cinético, em pé), segmento, lado e duração (≥ 30 s recomendado).
4. Fixe o aparelho firmemente no segmento (dorso da mão com faixa, bolso justo na perna para tremor ortostático) e toque em **Iniciar coleta**. Há contagem regressiva de 3 s e o primeiro segundo é descartado.
5. Revise as métricas, os gráficos e a interpretação; gere o **Relatório** ou **Exporte** nos formatos desejados.
6. Para instalar como app: banner "Instalar" (Android/desktop) ou Compartilhar › Adicionar à Tela de Início (iOS).

Sem acelerômetro (desktop), use o **modo demonstração** para conhecer a interface.

## Como cada índice é calculado

Esta seção descreve, passo a passo e com as fórmulas implementadas em `js/dsp.js`, o cálculo de cada índice mostrado na tela de resultados e no relatório. As citações numeradas remetem à lista de [Referências](#referências) ao final; a revisão completa, com a auditoria dos bugs da versão 1, está em [`docs/LITERATURA.md`](docs/LITERATURA.md).

Notação: $a_x(t), a_y(t), a_z(t)$ são as acelerações triaxiais (m/s²), $f_s$ a taxa de amostragem (Hz), $x[n]$ o sinal unidimensional analisado, $P(f)$ a densidade espectral de potência (PSD, em (m/s²)²/Hz) e $f_0$ a frequência de pico.

### 1. Aquisição e qualidade da amostragem

Os eventos `devicemotion` fornecem $a_x, a_y, a_z$ com carimbo de tempo $t_i$. Usa-se `event.acceleration` (aceleração linear, gravidade removida pelo sistema operacional) e, quando indisponível, `accelerationIncludingGravity`; nesse caso a gravidade é removida pelos filtros da etapa 3. A taxa de amostragem e o *jitter* são estimados dos carimbos de tempo:

$$f_s = \frac{N-1}{t_N - t_1}, \qquad \text{jitter} = \frac{\mathrm{DP}(\Delta t)}{\overline{\Delta t}}, \qquad \Delta t_i = t_{i+1}-t_i$$

O primeiro segundo é descartado (toque no botão e acomodação). Registros com jitter > 25 % ou lacunas > 250 ms geram avisos no relatório. Smartphones entregam tipicamente 60–100 Hz, o que cobre a banda de tremor até 25 Hz (Nyquist ≥ 30 Hz) [4, 16]; a avaliação de tremor com transdutores inerciais é revisada em [5, 6].

### 2. Escolha do eixo (PCA)

No modo automático, cada eixo é filtrado em passa-alta de 1 Hz e calcula-se a matriz de covariância $\mathbf{C}$ (3×3) das três componentes. O sinal analisado é a projeção sobre o primeiro autovetor $\mathbf{v}_1$ (obtido por iteração de potência), isto é, a direção de maior variância do tremor:

$$x[n] = (\mathbf{a}[n]-\bar{\mathbf{a}})\cdot\mathbf{v}_1, \qquad \text{variância explicada} = \frac{\lambda_1}{\operatorname{tr}(\mathbf{C})}$$

A PCA equivale a uma rotação física do sensor para o eixo dominante do tremor e é o procedimento usado por di Biase et al. para o TSI [18]. A magnitude vetorial $|\mathbf{a}|$ da aceleração linear é oferecida apenas como opção legada, porque retifica a oscilação e dobra a frequência aparente.

### 3. Pré-processamento

1. Reamostragem para grade uniforme em $f_s$ por interpolação linear (os carimbos de tempo do sensor não são equiespaçados).
2. Remoção de tendência linear (mínimos quadrados).
3. Filtro Butterworth de 2ª ordem aplicado nos dois sentidos (*forward-backward*, resultando em 4ª ordem e fase zero), passa-alta em 1 Hz e passa-baixa em $\min(30,\ 0{,}45 f_s)$ Hz. A fase zero é essencial para não distorcer a forma de onda usada no jerk e nos cruzamentos de zero [4, 18].

### 4. Densidade espectral de potência (método de Welch)

O sinal é dividido em segmentos de $L = 4$ s ($N_{seg} = \operatorname{round}(4 f_s)$ amostras) com sobreposição de 50 %, cada um multiplicado por uma janela de Hann periódica $w[n]$ e transformado por FFT com *zero-padding* até $N_{fft} = \text{nextpow2}(4 N_{seg})$:

$$P(f_k) = \frac{2}{K}\sum_{j=1}^{K}\frac{\left|\sum_{n=0}^{N_{seg}-1} w[n]\,x_j[n]\,e^{-i2\pi kn/N_{fft}}\right|^2}{f_s\sum_n w[n]^2}, \qquad f_k = \frac{k f_s}{N_{fft}}$$

O fator 2 vale para $0 < k < N_{fft}/2$ (espectro unilateral). A resolução espectral é $f_s/N_{seg} = 0{,}25$ Hz e o espaçamento entre bins $f_s/N_{fft} \approx 0{,}06$ Hz a 60 Hz. O método de Welch reduz a variância do periodograma e é o estimador recomendado para tremor [3, 4, 20, 21]. A escala é a de densidade (a integral $\int P\,df$ reproduz a variância do sinal, verificado no teste de Parseval em `tests/dsp.test.js`).

### 5. Frequência de pico

$$f_0 = \arg\max_{2 \le f \le \min(25,\,0{,}45 f_s)} P(f)$$

seguida de interpolação parabólica entre os três bins vizinhos ($a, b, c$ = potências em $k-1, k, k+1$):

$$p = \frac{1}{2}\,\frac{a-c}{a-2b+c}, \qquad f_0 = f_k + p\,\Delta f, \qquad P_0 = b - \tfrac{1}{4}(a-c)\,p$$

As faixas de referência usadas na interpretação seguem o consenso da IPMDS de 2018 [1], que atualizou o de 1998 [2]: parkinsoniano 4–6 Hz (reemergente 3–5 Hz [7]), essencial 4–12 Hz (mais frequente 5–8 Hz nas mãos [8]), fisiológico exacerbado 8–12 Hz [9, 14], ortostático 13–18 Hz (média 15,7 Hz em 184 pacientes [12]) e cerebelar < 5 Hz.

### 6. Largura à meia altura (FWHM) e potência à meia altura (HWP)

A partir do bin do pico, procura-se à esquerda e à direita o primeiro ponto em que $P(f) \le P_0/2$ e interpola-se linearmente a travessia, obtendo $f_L$ e $f_R$:

$$\mathrm{FWHM} = f_R - f_L, \qquad \mathrm{HWP} = \int_{f_L}^{f_R} P(f)\,df$$

FWHM e HWP são usados como medidas de largura e potência do pico em estudos com acelerometria triaxial [8, 23]; log₁₀(HWP) correlaciona-se com a escala CRST [23].

### 7. Potência da banda, potência relativa do pico e razão pico/fundo

$$P_{banda} = \int_{2}^{f_{max}} P(f)\,df, \qquad \mathrm{RelPico} = \frac{\int_{f_0-0{,}5}^{f_0+0{,}5} P(f)\,df}{P_{banda}}, \qquad \mathrm{SNR_{dB}} = 10\log_{10}\frac{P_0}{\operatorname{mediana}\{P(f):\ 2\le f\le f_{max}\}}$$

com $f_{max} = \min(25,\ 0{,}45 f_s)$. **Há tremor** quando $\mathrm{RelPico} \ge 0{,}30$ e $\mathrm{SNR_{dB}} \ge 6$. O critério de potência relativa em torno do pico em relação à banda de tremor é o proposto por Luft et al. para detectar janelas com tremor [22]; os limiares numéricos foram fixados neste projeto com sinais sintéticos e são heurísticos.

### 8. Amplitude: RMS, amplitude do pico e deslocamento estimado

$$\mathrm{RMS} = \sqrt{\frac{1}{N}\sum_n x[n]^2}, \qquad P_{pico} = \int_{f_0-w}^{f_0+w} P(f)\,df,\quad w = \max(0{,}5\ \text{Hz},\ \mathrm{FWHM})$$

Para uma oscilação senoidal de amplitude $A$ a potência é $A^2/2$, logo a amplitude de aceleração da componente do pico e o deslocamento correspondente são

$$A = \sqrt{2 P_{pico}}, \qquad D = \frac{A}{(2\pi f_0)^2}$$

($D$ é exibido em mm). O relatório mostra também log₁₀(RMS), porque as escalas clínicas de tremor variam com o logaritmo da amplitude (relação de Weber–Fechner) [25, 19]. A amplitude medida depende do ponto de fixação do sensor no membro [16, 26]; o RMS de sensores de consumo correlaciona-se com a escala de Fahn-Tolosa-Marín no tremor essencial [17].

### 9. Entropia espectral normalizada

Na banda 2–$f_{max}$ Hz, com $N_b$ bins:

$$p_k = \frac{P(f_k)}{\sum_j P(f_j)}, \qquad H = -\frac{1}{\log_2 N_b}\sum_k p_k \log_2 p_k \in [0, 1]$$

Um tom puro dá $H \approx 0$; um espectro plano (ruído ou tremor fisiológico de banda larga) dá $H \approx 1$. Medidas de entropia espectral diferenciam tremor fisiológico de tremor patológico [30]; na v1 a entropia era calculada sobre todo o espectro, incluindo a componente contínua, e sem normalização.

### 10. Razão harmônica

$$\mathrm{RH} = \frac{\sum_{h=2}^{4} \int_{h f_0-0{,}3}^{h f_0+0{,}3} P(f)\,df}{\int_{f_0-0{,}3}^{f_0+0{,}3} P(f)\,df}$$

Só entram harmônicos com $h f_0 + 0{,}3 < 0{,}9 \cdot f_s/2$. O tremor parkinsoniano tem forma de onda assimétrica e maior conteúdo harmônico do que o tremor essencial: a potência harmônica média discriminou tremor postural da DP e TE em relógio inteligente [24], e a razão harmônica distinguiu DP de parkinsonismo medicamentoso [28]; o índice harmônico também é maior em tremores patológicos do que em controles [29]. di Biase et al. compararam o TSI com a potência harmônica média (soma da potência nos quatro primeiros harmônicos) [18].

### 11. Espectrograma, persistência e variabilidade entre janelas

O sinal filtrado é dividido em janelas de 3 s com passo de 1 s; em cada janela calcula-se um periodograma de Hann com *zero-padding*, o pico em 2–$f_{max}$ Hz, a potência relativa e a SNR como na seção 7, e a janela é marcada como "com tremor" pelo mesmo critério. Então:

$$\text{Persistência} = \frac{\#\{\text{janelas com tremor}\}}{\#\{\text{janelas}\}}, \qquad \mathrm{DP}_{pico} = \mathrm{DP}\{f_{0,j} : \text{janela } j \text{ com tremor}\}$$

A persistência descreve a intermitência do tremor [19, 22]; a variabilidade da frequência de pico ao longo do tempo é maior no tremor distônico [11].

### 12. Frequência instantânea, coeficiente de variação e TSI

Seguindo di Biase et al. [18]: o sinal (já projetado no eixo principal) é filtrado em passa-banda $[f_0 - 2,\ f_0 + 2]$ Hz (limitado a $[1,\ 0{,}45 f_s]$) com Butterworth de fase zero; localizam-se os cruzamentos de zero ascendentes $t_n$ (interpolação linear entre amostras); e

$$f(n) = \frac{1}{t_{n+1}-t_n}, \qquad \Delta f(n) = f(n+1)-f(n), \qquad \mathrm{TSI} = Q_3(\Delta f) - Q_1(\Delta f)$$

$$\mathrm{CV}_f = \frac{\mathrm{DP}\{f(n)\}}{\overline{f(n)}}$$

Só entram ciclos cujo centro cai em janelas com tremor (recomendação de Luft et al. [22]); o TSI é reportado com o número de ciclos e considerado confiável com ≥ 20 ciclos. Ponto de corte: **TSI ≤ 1,05 favorece tremor parkinsoniano; TSI > 1,05 favorece tremor essencial** (sensibilidade e especificidade máximas de 95 %, acurácia 92 %, AUC 0,92 na coorte-teste e 0,86 na validação; independente da postura e do dispositivo; AUC 0,89 já com 10 s de registro) [18]. A irregularidade ciclo a ciclo é ~50 % maior no tremor de membro da distonia cervical do que no TE [10], e a variabilidade de frequência e o TSI são maiores no tremor distônico [11]. O TSI também foi aplicado ao tremor da PIDC [27] e a coortes cirúrgicas [23], sem diferença entre TE e TE-plus [8]. O aviso "fora da faixa de validação" aparece quando $f_0$ está fora de 2–9 Hz, faixa de busca do pico no estudo original [18].

### 13. Envelope de amplitude (Hilbert)

O sinal analítico $z[n] = x_b[n] + i\,\mathcal{H}\{x_b\}[n]$ é obtido por FFT (zerando as frequências negativas) a partir do sinal passa-banda $x_b$ da seção 12; o envelope é $|z[n]|$ e o coeficiente de variação da amplitude é $\mathrm{CV}_A = \mathrm{DP}(|z|)/\overline{|z|}$ nas janelas com tremor. di Biase et al. usaram o envelope de Hilbert para a amplitude em cada cruzamento de zero [18]; a decomposição por Hilbert é usada para frequência e amplitude instantâneas no tremor distônico [34].

### 14. Jerk normalizado

$$J_{norm} = \frac{\mathrm{RMS}\left(\dfrac{dx}{dt}\right)}{2\pi f_0\,\mathrm{RMS}(x)}, \qquad \frac{dx}{dt}[n] \approx (x[n+1]-x[n])\,f_s$$

Para uma senoide pura em $f_0$, $J_{norm} = 1$; valores muito maiores indicam forma de onda espiculada (conteúdo de alta frequência). A normalização torna o índice adimensional, o que Hogan e Sternad mostram ser necessário para medidas de suavidade baseadas em jerk, já que as versões dimensionadas variam com amplitude, duração e taxa de amostragem [31]. O jerk **não** diagnostica mioclonia: isso exige EMG (duração dos surtos) e retro-média EEG-EMG [32, 33].

## Como o algoritmo classifica o tremor

A classificação é um sistema de regras explícitas (`js/interpret.js`), não um modelo estatístico. Cada regra examina uma métrica e a **condição de ativação** informada no protocolo (repouso, postural, cinético ou em pé) e soma um peso $w$ a uma hipótese sindrômica, guardando o texto da evidência e a referência. O usuário vê cada evidência a favor (+) e contra (−). Os pesos e limiares abaixo são os do código.

### Pré-requisitos

1. **Detecção.** Se não há pico com $\mathrm{RelPico} \ge 0{,}30$ e $\mathrm{SNR} \ge 6$ dB (seção 7), o resultado é "não foi detectado tremor rítmico significativo" e nenhuma hipótese é apresentada; se RMS < 0,3 m/s², acrescenta-se que o achado é compatível com ausência de tremor patológico ou tremor fisiológico de baixa amplitude.
2. **Regularidade.** $\mathrm{CV}_f < 10\,\%$ = regular; 10–20 % = moderadamente irregular; > 20 % = irregular.
3. **TSI válido** quando há ≥ 20 ciclos e $2 \le f_0 \le 9$ Hz [18].

### Regras por hipótese

| Hipótese | Condição da regra | Peso | Base |
|---|---|---|---|
| **Parkinsoniano (DP)** | repouso e $3{,}5 \le f_0 \le 7$ Hz *(primária)* | +2 | [1] |
| | postural e $3{,}5 \le f_0 \le 7$ Hz *(primária; tremor reemergente, a confirmar pela latência)* | +0,5 | [7] |
| | postural e $f_0 > 8$ Hz | −1,5 | [1] |
| | cinético e $f_0 > 7$ Hz | −1 | [1] |
| | TSI válido e $\le 1{,}05$ / $> 1{,}05$ | +1,5 / −1,5 | [18] |
| | RH > 0,15 / RH < 0,05 | +1 / −0,5 | [24, 28] |
| | $\mathrm{CV}_f < 10\,\%$ | +0,5 | [3] |
| **Essencial (TE)** | postural ou cinético e $4 \le f_0 \le 12$ Hz *(primária)* | +2 | [1] |
| | postural ou cinético e $5 \le f_0 \le 8$ Hz | +0,5 | [8] |
| | TSI válido e $> 1{,}05$ / $\le 1{,}05$ | +1,5 / −1,5 | [18] |
| | RH < 0,05 / RH > 0,15 | +0,5 / −1 | [24] |
| | $\mathrm{CV}_f < 10\,\%$ / $\mathrm{CV}_f > 20\,\%$ | +0,5 / −1 | [10] |
| | repouso e $4 \le f_0 \le 12$ Hz | −1 | [8] |
| | perna/pé/tronco em pé | −2 | [1] |
| **Fisiológico exacerbado (TFE)** | postural e $8 \le f_0 \le 12$ Hz *(primária)* | +1 | [9, 14] |
| | … e RMS < 0,3 m/s² | +1 | [9] |
| | … e (RelPico < 0,5 ou FWHM > 1,5 Hz) | +1 | [9] |
| | … e $H > 0{,}7$ | +0,5 | [30] |
| | RMS > 1,0 m/s² | −1 | [4] |
| **Distônico (TD)** | postural ou cinético, $3 \le f_0 \le 10$ Hz, e $\mathrm{CV}_f > 15\,\%$ *(primária)* | +1 | [10, 11] |
| | … e $\mathrm{DP}_{pico} > 0{,}8$ Hz | +1 | [11] |
| | … e $\mathrm{CV}_A > 50\,\%$ | +0,5 | [11] |
| | … e TSI válido ≥ 2 | +0,5 | [11] |
| **Ortostático (TO)** | em pé, perna/pé/tronco e $12{,}5 \le f_0 \le 20$ Hz *(primária)* | +3 | [12] |
| | … e RelPico > 0,5 | +1 | [13] |
| | … e $\mathrm{CV}_f < 10\,\%$ | +1 | [3, 12] |
| **Cerebelar / baixa frequência** | cinético e $2 \le f_0 \le 4{,}5$ Hz *(primária)* | +1,5 | [1] |
| | outra condição e $2 \le f_0 \le 4{,}5$ Hz *(primária)* | +0,5 | [1] |
| | … e RMS > 1,0 m/s² | +0,5 | [1] |

Uma hipótese só é apresentada se recebeu pelo menos uma regra **primária** (frequência × condição) com peso positivo e se o escore total é positivo; isso evita, por exemplo, sugerir "tremor essencial" para um tremor de 15 Hz apenas porque ele é regular. As hipóteses são ordenadas pelo escore $S = \sum w$ e recebem uma confiança:

$$\text{confiança} = \begin{cases} \text{alta} & S \ge 3{,}5 \\ \text{moderada} & 2 \le S < 3{,}5 \\ \text{baixa} & S < 2 \end{cases}$$

A síntese textual cita a hipótese de maior escore e, se a segunda alcançar ≥ 70 % do escore da primeira, apresenta-a como alternativa próxima.

### Sinalizadores e achados (não são hipóteses)

- **Frequência alta fora do contexto ortostático:** $12{,}5 \le f_0 \le 20$ Hz sem a condição "em pé" com o sensor na perna gera a recomendação de repetir a coleta em ortostase com o aparelho na perna [13, 15].
- **Tremor de perna em pé com 4–12 Hz:** não preenche a faixa do tremor ortostático primário; considerar tremor ortostático "lento" ou outra etiologia [1].
- **Variabilidade de frequência muito alta** ($\mathrm{CV}_f > 25\,\%$ ou $\mathrm{DP}_{pico} > 1{,}5$ Hz): achado inespecífico que ocorre em tremor distônico, tremor funcional e artefato; os critérios laboratoriais de tremor funcional exigem testes de entrainment, coerência e tapping, que o app não realiza [35, 36].
- **Forma de onda espiculada** ($J_{norm} > 2{,}5$ com $\mathrm{CV}_f > 10\,\%$): possível mioclonia ou artefato; requer EMG [32, 33].
- **Intermitência:** persistência < 50 % [22].
- **Eixo:** variância explicada pela PCA < 60 % indica tremor multiplanar ou movimento não tremulante.
- **Sugestões automáticas:** prova de carga de 500 g quando a hipótese é tremor fisiológico exacerbado (a frequência cai no tremor mecânico-reflexo e não muda no TE e na DP) [4]; EMG de superfície para confirmar tremor ortostático [12]; registro das demais condições de ativação para caracterizar o Eixo 1 do consenso [1].

### Status de validação dos limiares

| Limiar | Valor | Status |
|---|---|---|
| Ponto de corte do TSI | 1,05 | validado em coorte-teste e de validação independentes [18] |
| Faixas de frequência por síndrome | ver seção 5 | consenso da IPMDS [1] e séries clínicas [7, 8, 12] |
| Detecção de tremor (RelPico, SNR) | 0,30; 6 dB | método de Luft et al. [22]; valores numéricos heurísticos deste projeto |
| Regularidade ($\mathrm{CV}_f$) | 10 %, 20 %, 25 % | direção sustentada por [10, 11]; valores heurísticos |
| Razão harmônica | 0,05, 0,15 | direção sustentada por [24, 28]; valores heurísticos |
| Amplitude (RMS) | 0,3 e 1,0 m/s² | heurísticos (dependem da posição do sensor) [16] |
| Jerk normalizado | 2,5 | heurístico; fórmula adimensional segundo [31] |
| Pesos das regras e cortes de confiança | tabela acima | definidos neste projeto, sem validação clínica |

A saída é, portanto, **apoio à interpretação** e não diagnóstico: a classificação final de tremor é clínica [1, 3].

## Estrutura do projeto

```
index.html              interface
css/app.css             design system (tokens claro/escuro, materiais, componentes)
js/dsp.js               processamento de sinais (puro; testado em Node)
js/interpret.js         interpretação por regras com evidências e referências
js/charts.js            gráficos (Chart.js) e espectrograma
js/report.js            relatório HTML/PDF e exportações CSV/JSON/PNG
js/app.js               fluxo do aplicativo, sensores, tema, PWA
vendor/                 Chart.js 4.4.4 e jsPDF 2.5.2 (MIT), vendorizados para uso offline
icons/                  ícones do PWA
manifest.webmanifest    manifesto do PWA
sw.js                   service worker (pré-cache)
docs/LITERATURA.md      revisão da literatura e auditoria dos cálculos
tests/dsp.test.js       testes unitários com sinais sintéticos (node --test)
tests/e2e.mjs           teste ponta a ponta com Playwright (demo, sensor sintético, exportações, offline)
```

## Testes

```bash
node --test tests/dsp.test.js                          # 11 testes de DSP
NODE_PATH=/caminho/para/node_modules node tests/e2e.mjs  # requer playwright + http-server
```

## Formato dos dados exportados

- **CSV** (ponto e vírgula, vírgula decimal): `*_metricas.csv`, `*_sinal.csv` (t, ax, ay, az, sinal analisado), `*_espectro.csv` (frequência, PSD).
- **JSON**: sessão completa (protocolo, métricas, espectro, janelas, frequência instantânea, amostras brutas, interpretação) — pronto para R/Python.
- **PDF / HTML**: relatório com síntese, hipóteses e evidências, tabela de métricas com referências, gráficos, qualidade do registro, glossário e bibliografia.

Exemplo em R:

```r
m <- read.csv2("TremorPSD_..._metricas.csv")
s <- read.csv2("TremorPSD_..._sinal.csv")
j <- jsonlite::fromJSON("TremorPSD_....json")
j$metrics$tsi
```

## Privacidade

Todo o processamento ocorre no aparelho. A identificação digitada é usada apenas para nomear os arquivos exportados e não é armazenada.

## Licença e autoria

MIT. **Pedro Renato de Paula Brandão, MD, PhD** — Neurologista (Doenças do Movimento), Hospital Sírio-Libanês | Universidade de Brasília | NA Neurologistas Associados. Versão 2.0 desenvolvida com apoio de IA (Claude Code), com revisão bibliográfica documentada em `docs/LITERATURA.md`.

## Referências

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

Referências verificadas no PubMed (NLM) em setembro de 2026; a numeração é a mesma de `docs/LITERATURA.md`.
