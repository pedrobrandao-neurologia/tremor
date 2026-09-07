# TremorPSD 2.0 — análise quantitativa de tremor no navegador

Aplicativo web progressivo (PWA) para **análise quantitativa de tremor** com o acelerômetro de smartphones e tablets. Estima o espectro de potência (método de Welch), o **índice de estabilidade do tremor (TSI)**, a irregularidade ciclo a ciclo, o conteúdo harmônico, a amplitude e a persistência do tremor, e gera um **relatório detalhado** com faixas de referência e citações da literatura. Funciona **offline**, sem enviar dados a servidores.

> Instrumento de apoio à avaliação clínica e à pesquisa. **Não é um dispositivo diagnóstico.** A classificação de tremor é clínica (IPMDS 2018); o app lista evidências eletrofisiológicas a favor e contra cada hipótese, com as fontes.

## Novidades da versão 2.0

- **Revisão completa da literatura** de cada cálculo, com 37 referências verificadas no PubMed, e **auditoria de 15 bugs** da versão anterior — ver [`docs/LITERATURA.md`](docs/LITERATURA.md).
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

## Métricas (resumo)

| Métrica | O que mede | Referência principal |
|---|---|---|
| Frequência de pico | Frequência dominante (Welch, 2–25 Hz) | Bhatia 2018; Vial 2019 |
| TSI | IQR da variação ciclo a ciclo da frequência; ≤ 1,05 DP, > 1,05 TE | di Biase 2017 |
| CV da frequência / DP entre janelas | Irregularidade (maior no tremor distônico) | Shaikh 2008; Panyakaew 2020 |
| Razão harmônica | Forma de onda assimétrica (alta na DP) | Wile 2014; Jang 2013 |
| Potência relativa, SNR, persistência | Detecção de tremor por janela e intermitência | Luft 2019; Elble & McNames 2016 |
| RMS, log₁₀ RMS, deslocamento | Amplitude (escalas clínicas ~ log da amplitude) | Elble 2006; van Brummelen 2020 |
| FWHM / HWP | Largura e potência do pico | Rajan 2023; Purrer 2025 |
| Entropia espectral | Dispersão do espectro (tom puro vs ruído) | Hossen 2020 |
| Jerk normalizado | Forma de onda espiculada (adimensional) | Hogan & Sternad 2009 |

Faixas de frequência usadas na interpretação: parkinsoniano 4–6 Hz (repouso), essencial 4–12 Hz (postural/cinético), fisiológico exacerbado 8–12 Hz, ortostático 13–18 Hz (pernas em pé), cerebelar < 5 Hz.

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
