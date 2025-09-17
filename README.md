# README — TremorAnalyzer (Sistema Clínico de Análise de Tremor por Acelerometria)

## 1) Visão geral

O **TremorAnalyzer** é um aplicativo web de uso clínico-auxiliar que registra aceleração tri-axial via `DeviceMotion` em smartphones/tablets e executa uma **análise espectral padronizada** para quantificar tremor e oferecer **classificação diferencial heurística** (tremor essencial, parkinsoniano, distônico, ortostático e mioclonia).
Foi concebido para consulta ambulatorial ou beira-leito, com duração de teste breve (20–60 s) e exportação imediata dos resultados.

> **Importante:** trata-se de **ferramenta de apoio**. A decisão diagnóstica permanece clínica, integrando exame neurológico e, se necessário, exames complementares.

---

## 2) Requisitos e suporte

* **Navegador**: Safari iOS 13+, Chrome/Edge/Firefox Android/desktop com suporte a `DeviceMotion`.
* **Conexão**: **HTTPS** (obrigatório no iOS) ou `localhost`.
* **Permissão iOS**: é necessário tocar em “**Ativar Sensores**” para conceder acesso ao acelerômetro.

---

## 3) Fluxo de uso (passo a passo)

1. **Acesso seguro**: abra a página via HTTPS.
2. **Ativar sensores** (iOS) quando solicitado. O sistema valida taxa de amostragem e exibe *status*.
3. **Selecione o protocolo**: repouso, postural, cinético ou ortostático.
4. **Defina o componente do sinal**: magnitude (√x²+y²+z²), eixo dominante, ou eixos X/Y/Z.
5. **Informe a duração** (padrão 30 s; recomendado 20–60 s).
6. **Iniciar coleta** → manter a posição/ tarefa conforme instruções na tela.
7. **Análise automática** → exibição de métricas, espectros (PSD) e **classificação diferencial**.
8. **Exportar**: CSV (séries temporais), JSON (dataset completo) e Relatório TXT (sumário clínico).

---

## 4) Metodologia de processamento de sinais

A pipeline é intencionalmente **transparente e rastreável**:

1. **Aquisição**

   * Aceleração tri-axial bruta (g).
   * Estimativa contínua da **taxa de amostragem** (Hz) a partir do intervalo entre eventos.
   * Seleção do componente: magnitude, eixo dominante ou eixos X/Y/Z.

2. **Pré-processamento**

   * **Remoção do componente DC** (detrend simples por subtração da média).
   * **Filtragem passa-faixa 3–20 Hz** (cadeia passa-alta + passa-baixa de 1ª ordem, implementação causal simplificada).

     * Notação: `lowCut = 3 Hz`, `highCut = 20 Hz`; normalização em relação a Nyquist.

3. **Espectro (Welch PSD)**

   * **Janela de Hanning** e **método de Welch** com:

     * **tamanho de segmento** = `4 s × fs` (arredondado),
     * **sobreposição** = 50%,
     * **PSD** = |FFT|² / (fs × Nsegmento), média entre segmentos.
   * **Frequência de interesse**: 0–30 Hz (plot) e **banda diagnóstica** primária 3–20 Hz.
   * Implementação educacional de FFT/DFT (suficiente para durações curtas). Em produção, recomenda-se FFT otimizada (p.ex., Cooley–Tukey).

---

## 5) Métricas extraídas (definições)

Após o cálculo do PSD médio (Welch), são computadas:

* **Frequência de pico (Hz)**: `f_peak = argmax(PSD(f))` na **banda 3–20 Hz**.
* **Potência no pico**: `PSD(f_peak)`.
* **FWHM (Hz)**: largura à meia altura do pico principal (half-maximum).
* **Entropia espectral**: `H = −∑ pᵢ log₂ pᵢ`, com `pᵢ = PSD(fᵢ) / ∑ PSD`.
* **Razão pico/total (PTR)**: `PTR = PSD(f_peak) / ∑ PSD`.
* **Índice de estabilidade do tremor (TSI)** (aproximação): `TSI ≈ FWHM / f_peak` (quanto menor, **pico mais estável/estreito**).
* **Centroide espectral (Hz)**: `∑ fᵢ·PSD(fᵢ) / ∑ PSD(fᵢ)`.

Essas métricas refletem **frequência, seletividade, concentração de potência** e **irregularidade** do espectro.

---

## 6) Classificação diferencial (heurística explicável)

A classificação é **regra-baseada**, utiliza `f_peak`, **FWHM**, **PTR**, **TSI** e **entropia**, ponderando o **protocolo executado**:

* **Tremor Essencial (TE)**:

  * `4–12 Hz`, geralmente **postural/cinético**; picos mais estreitos; PTR moderado/alto.
* **Tremor Parkinsoniano (DP)**:

  * `3–6 Hz`, **repouso**; TSI **baixo** (pico estável).
* **Tremor Distônico (DT)**:

  * `3–7 Hz`, espectro **mais largo** (FWHM ↑), entropia ↑, TSI ↑.
* **Tremor Ortostático (OT)**:

  * `13–18 Hz`, protocolo **ortostático**; PTR ↑.
* **Mioclonia**:

  * Alta **irregularidade** (entropia ↑) e **largura** (FWHM ↑), TSI ↑; distribuição difusa de potência.

> **Saída**: percentuais normalizados por classe e **rótulo mais provável**. A explicação clínica de cada caso é mostrada abaixo das barras.

---

## 7) Indicadores de qualidade do sinal

Durante a inicialização e coleta são mostrados:

* **Taxa de amostragem (Hz)** estimada.
* **Amostras** recebidas.
* **Qualidade**: *Excelente* (≥100 Hz), *Boa* (≥50 Hz), *Baixa* (<50 Hz).
  Taxas mais altas melhoram a resolução espectral e a robustez do pico.

---

## 8) Protocolos e boas práticas de coleta

* **Repouso**: paciente sentado, antebraços apoiados, mãos relaxadas no colo; fixar o dispositivo no dorso da mão mais afetada.
* **Postural**: braços estendidos horizontalmente, mãos em pronação; evitar compensações proximais.
* **Cinético**: dedo-nariz-dedo contínuo, amplitude confortável; dispositivo na mão em movimento.
* **Ortostático**: em pé, braços relaxados; fixar em coxa/tornozelo (vibratilidade de 13–18 Hz).
* **Duração**: 20–60 s; **evitar fala** e **movimentos voluntários** durante a janela.
* **Fixação** do aparelho: firme e reprodutível; anotar lado/teste.

---

## 9) Visualizações

* **Sinal temporal** (aceleração filtrada): inspeção qualitativa de regularidade.
* **PSD (0–30 Hz)** com **marcação do pico** e rótulo de frequência: facilita leitura imediata.

---

## 10) Exportação de dados

* **CSV**: tempo (s), aceleração bruta (g) e filtrada (g).
* **JSON**: metadados (protocolo, taxa, duração), série temporal, dado filtrado, PSD, métricas e classificação.
* **Relatório TXT**: sumário clínico com métricas, percentuais por classe e interpretação padrão.

---

## 11) Limitações e considerações clínicas

* **Heurístico**: não é modelo treinado supervisionado; privilegia **interpretabilidade** à custa de acurácia de ML de última geração.
* **Taxa de amostragem variável** no navegador: pode limitar resolução e estabilidade espectral em alguns dispositivos.
* **Ambiente**: vibrações externas, postura inadequada e fixação frouxa degradam o resultado.
* **Mioclonia**: aceleração pode sub-representar *jerks* curtíssimos; EMG/superfícies adicionais podem ser necessários.
* **Uso regulatório**: ferramenta de **apoio**; não substitui diagnóstico médico.

---

## 12) Segurança, privacidade e PWA

* Funciona localmente no navegador; **sem envio automático de dados** a servidores.
* O **Service Worker** habilita uso básico offline (página e scripts).
* Ao exportar, os arquivos são gerados **no cliente** (download).
* Se for integrar a um RES/Prontuário, respeitar políticas institucionais, consentimento e criptografia de transporte/armazenamento.

---

## 13) Parâmetros (resumo rápido)

* **Banda de análise**: 3–20 Hz (filtros) | **Plot**: até 30 Hz.
* **Welch**: janela de 4 s, 50% sobreposição, janela de Hanning.
* **Métricas**: f\_peak, PSD\_peak, FWHM, PTR, entropia, TSI, centroide.
* **Classificação**: regras por faixa de frequência + forma espectral + protocolo.

---

## 14) Resolução de problemas (FAQ)

* **“Taxa insuficiente”**: use HTTPS/`localhost`; troque de navegador; feche apps em segundo plano; tente outro aparelho.
* **iOS não inicia**: toque em **Ativar Sensores**; verifique se a página está em HTTPS.
* **Gráfico “chato”/sem pico**: duração curta ou fixação ruim; repita por 30–60 s; confira se o protocolo está adequado ao fenótipo esperado.
* **Pico fora da banda**: revise tarefas (p.ex., ortostático pode ultrapassar 20 Hz — o plot mostra até 30 Hz).

---

## 15) Roadmap (opcional)

* FFT otimizada (radix-2) e janelamento multitaper.
* Estimadores de frequência instantânea e TSI robusto (ex.: picos harmônicos / estabilidade por janelas).
* Coerência entre segmentos corporais (duplo sensor).
* Módulos de ML explicáveis (e.g., XGBoost/CNN1D) com validação externa.

---

## 16) Referências essenciais (curtas)

* Deuschl G, et al. *Mov Disord*. 1998 (consenso tremor).
* Elble RJ, et al. *Brain*. 2006 (escala × amplitude).
* Barrantes S, et al. *PLoS One*. 2017 (smartphone para TE vs DP).
* Bove M, et al. *Sensors*. 2023 (classificação multi-classe com wearables).

---

### Declaração final

O **TremorAnalyzer** busca **padronizar** a captura e a leitura espectral do tremor, fornecendo métricas objetivas, 
visualizações claras e uma **heurística clínica transparente**. 
A interpretação deve ser integrada ao **exame neurológico** e ao **contexto do paciente**.
