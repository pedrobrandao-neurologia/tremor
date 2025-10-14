```markdown
# TremorPSD – Análise Aprimorada

Uma aplicação web moderna e responsiva para análise quantitativa de **tremores fisiológicos e patológicos**, baseada na **Densidade Espectral de Potência (Power Spectral Density – PSD)**.  
Utiliza os sensores inerciais (acelerômetro) do dispositivo móvel para capturar dados de movimento e aplicar análise espectral em tempo real.

---

## 🧠 Sobre o Projeto

O **TremorPSD** foi desenvolvido para fins de **pesquisa e avaliação clínica digital**, permitindo identificar padrões de tremor associados a diferentes condições neurológicas, como:

- Tremor essencial (ET)  
- Tremor ortostático (OT)  
- Tremor distônico (DT)  
- Mioclonias (MY)

O aplicativo realiza aquisição direta de dados de aceleração, aplica **análise espectral via método de Welch** e exibe as métricas principais relacionadas ao padrão de tremor — frequência de pico, largura espectral (FWHM), entropia, e razão pico/total.

---

## ⚙️ Tecnologias Utilizadas

- **HTML5** – Estrutura base e compatibilidade móvel  
- **Tailwind CSS (via CDN)** – Estilo responsivo e moderno  
- **Chart.js (via CDN)** – Visualização dos sinais e espectros  
- **JavaScript puro (ES6)** – Processamento de sinais e controle da interface  
- **DeviceMotion API** – Coleta de dados dos sensores de movimento

---

## 📊 Funcionalidades Principais

### 🔹 Coleta de Dados
- Captura contínua do acelerômetro do dispositivo (x, y, z ou magnitude)
- Ajuste da duração da coleta (5–60 segundos)
- Cálculo automático da taxa de amostragem

### 🔹 Análise Espectral
- Transformada Rápida de Fourier (FFT) com janelamento de Welch  
- Extração de métricas quantitativas:
  - **Frequência de Pico (Hz)** – frequência dominante do tremor  
  - **FWHM (Hz)** – largura do pico, indicativo de regularidade  
  - **PTR (Pico/Total Ratio)** – pureza espectral  
  - **TSI (Tremor Stability Index)** – estabilidade relativa do tremor  
  - **Centroide Espectral (Hz)** – “centro de massa” da energia espectral  
  - **Entropia Espectral** – grau de desordem ou complexidade

### 🔹 Visualização Interativa
- Gráficos em tempo real:
  - **Sinal temporal**
  - **Densidade Espectral de Potência (PSD)**
- Interface escura otimizada para dispositivos móveis

### 🔹 Classificação Automática (Heurística)
Sugestão automática de categoria de tremor baseada em:
- Faixa de frequência
- Estabilidade (TSI)
- Pureza espectral (PTR)

Categorias sugeridas:
- Ortostático  
- Essencial  
- Distônico  
- Mioclônico  

> ⚠️ **Nota:** A classificação é apenas indicativa e não substitui avaliação médica especializada.

### 🔹 Exportação de Dados
- Exportação em **CSV** para posterior análise estatística
- Compatível com softwares como MATLAB, Python (NumPy/Pandas) ou R

---

## 🚀 Como Utilizar

1. Hospede o arquivo `index.html` em um ambiente **HTTPS** (ou `localhost`).  
   > A API de sensores não funciona em conexões HTTP por motivos de segurança.

2. Abra a página em um **smartphone ou tablet** com acelerômetro.

3. Na tela inicial:
   - Clique em **“Começar Análise”**
   - Conceda permissão para uso dos sensores

4. Ajuste os parâmetros de coleta (duração e eixo) e pressione **“Iniciar Coleta”**

5. Aguarde o término da aquisição e visualize:
   - Gráficos de sinal e espectro
   - Métricas quantitativas
   - Classificação sugerida

6. Exporte os resultados para CSV, se desejar.

---

## 🧩 Estrutura do Projeto

```

tremorpsd/
├── index.html        # Aplicativo completo (HTML, CSS, JS)
├── README.md         # Documentação do projeto
└── assets/           # (opcional) Ícones, logos, etc.

```

---

## 🧪 Princípios de Análise

A aplicação emprega o **método de Welch** para estimar a PSD, garantindo maior robustez na presença de ruído fisiológico.  
A FFT implementada segue o algoritmo **Cooley–Tukey**, com janelamento de Hann e sobreposição de 50%.

---

## 📱 Compatibilidade

- Android (Chrome, Edge, Samsung Internet)  
- iOS (Safari com permissão manual de sensores)  
- Desktop (modo de simulação apenas)

> Para dispositivos iOS, é necessário ativar:  
> `Configurações → Safari → Movimento e orientação → Permitir acesso`.

---

## 🧑‍🔬 Aplicações Potenciais

- Estudos de caracterização de tremor em **Doença de Parkinson**, **Tremor Essencial** e **Distonias**  
- Ferramenta complementar em avaliações de **telemedicina**  
- Aquisição rápida de dados inerciais para **pesquisa clínica e biomédica**

---

## 📘 Licença

Este projeto é distribuído sob a licença **MIT**.  
Sinta-se à vontade para utilizar, modificar e distribuir, desde que mantidos os créditos ao autor original.

---

## ✍️ Autor

**Pedro Renato de Paula Brandão, MD, PhD**  
Neurologista – Doenças do Movimento  
Hospital Sírio-Libanês | Universidade de Brasília | NA Neurologistas Associados  
📧 [Contato profissional](mailto:pedrobrandao.neurologia@gmail.com)

---

## 🌐 Demonstração (em breve)

> O aplicativo poderá ser hospedado diretamente via **GitHub Pages**.  
> Basta enviar o arquivo `index.html` e ativar o Pages no repositório.
```
