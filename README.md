# TremorPSD: Plataforma Avançada de Análise de Tremor

Uma aplicação web abrangente para análise de tremor em tempo real usando acelerometria de smartphones e técnicas avançadas de processamento de sinais. O TremorPSD implementa métodos de análise espectral clinicamente relevantes para caracterizar distúrbios do movimento através de métricas objetivas e quantitativas.

## Visão Geral

O TremorPSD aproveita os sensores acelerômetros disponíveis em smartphones modernos para realizar análise de tremor de nível profissional. A plataforma emprega metodologias de processamento de sinais estabelecidas, comumente utilizadas em pesquisa clínica e avaliação de distúrbios do movimento, fornecendo pipelines de análise transparentes e reproduzíveis.

## Características Principais

### Pipeline de Processamento de Sinais

**Filtragem Digital**
- Filtros IIR passa-faixa configuráveis (Butterworth de 1ª ordem)
- Banda diagnóstica padrão: 3-20 Hz (ajustável)
- Remoção de componente DC e detrending em tempo real
- Implementação causal adequada para análise em tempo real

**Análise Espectral**
- Método de Welch para estimativa de densidade espectral de potência (PSD)
- Janelamento Hanning com normalização adequada
- Parâmetros configuráveis de comprimento de segmento e sobreposição
- Implementação recursiva de FFT (algoritmo Cooley-Tukey)

### Métricas Clínicas

A plataforma computa métricas estabelecidas de caracterização de tremor:

- **Frequência de Pico**: Frequência dominante na banda diagnóstica (Hz)
- **FWHM**: Largura à meia altura do pico espectral (Hz)
- **Entropia Espectral**: Medida de conteúdo de informação (-∑ pᵢ log₂ pᵢ)
- **Razão Pico/Total (PTR)**: Métrica de concentração de potência
- **Índice de Estabilidade do Tremor (TSI)**: Medida de estabilidade do pico (FWHM/f_pico)
- **Centroide Espectral**: Centro de potência ponderado por frequência (Hz)

### Classificação Diferencial

Sistema de classificação baseado em regras suportando:
- **Tremor Ortostático** (13-18 Hz, alta coerência)
- **Tremor Essencial** (4-12 Hz, seletividade moderada)
- **Tremor Distônico** (4-7 Hz, espectro irregular)
- **Mioclonia** (espectro amplo, alta entropia)

O algoritmo de classificação fornece raciocínio explicável e pontuações de confiança baseadas em múltiplas características espectrais.

## Especificações Técnicas

### Aquisição de Dados
- **Taxa de Amostragem**: Adaptativa (tipicamente 50-100 Hz)
- **Resolução**: Precisão do acelerômetro dependente do dispositivo
- **Eixos**: X, Y, Z, magnitude ou eixo dominante auto-detectado
- **Duração**: Configurável (10-60 segundos)

### Parâmetros de Processamento
- **Comprimento do Segmento**: 2-8 segundos (padrão: 4s)
- **Sobreposição**: 0-75% (padrão: 50%)
- **Cortes do Filtro**: Limites passa-faixa configuráveis
- **Função de Janela**: Hanning (von Hann)

### Formatos de Saída
- **Exportação CSV**: Dados de séries temporais (brutos e filtrados)
- **Relatório Técnico**: Resumo abrangente da análise
- **Visualização em Tempo Real**: Gráficos no domínio do tempo e frequência

## Aplicações Clínicas

O TremorPSD é projetado para:
- Pesquisa em distúrbios do movimento
- Quantificação objetiva de tremor
- Demonstrações educacionais
- Triagem em telemedicina
- Estudos de monitoramento longitudinal

## Transparência Metodológica

A plataforma enfatiza práticas de pesquisa reproduzíveis:
- **Algoritmos Abertos**: Todos os passos de processamento são documentados e acessíveis
- **Rastreabilidade de Parâmetros**: Log completo de parâmetros nos relatórios
- **Métricas Padronizadas**: Implementação segue literatura estabelecida
- **Garantia de Qualidade**: Avaliação integrada de qualidade do sinal

## Requisitos de Uso

### Pré-requisitos Técnicos
- **Contexto HTTPS**: Necessário para acesso aos sensores
- **Navegador Moderno**: Suporte para API DeviceMotionEvent
- **Dispositivo Móvel**: Sensores acelerômetros integrados
- **Permissões**: Aprovação para acesso aos sensores de movimento

### Instalação
```bash
# Clonar repositório
git clone https://github.com/username/tremor-psd.git

# Servir via HTTPS (necessário para acesso aos sensores)
# Opção 1: GitHub Pages
# Opção 2: Deploy Netlify/Vercel
# Opção 3: Servidor HTTPS local
```

### Início Rápido
1. Acessar aplicação via URL HTTPS
2. Conceder permissões dos sensores de movimento
3. Configurar parâmetros de análise
4. Posicionar dispositivo conforme instruído
5. Iniciar coleta de dados
6. Revisar resultados e exportar dados

## Validação e Limitações

### Status de Validação
- **Verificação de Algoritmos**: Comparado com implementações de referência
- **Teste com Dados Sintéticos**: Validado com características conhecidas de sinal
- **Correlação Clínica**: Requer validação contra métodos padrão-ouro

### Limitações Importantes
- **Propósito Educacional**: Não aprovado para diagnóstico clínico
- **Variabilidade de Dispositivos**: Resultados podem variar entre diferentes hardwares
- **Fatores Ambientais**: Sensível à montagem do dispositivo e vibrações externas
- **Irregularidades de Amostragem**: Sensores móveis podem ter temporização variável

## Fundamentação Científica

### Abordagem de Análise Espectral
A plataforma implementa o método de Welch como padrão-ouro para estimativa de PSD de sinais biológicos. Esta abordagem oferece:
- **Redução de Variância**: Média entre segmentos reduz ruído
- **Resolução de Frequência**: Balanceada com confiabilidade estatística
- **Eficiência Computacional**: Adequada para implementação em tempo real

### Seleção de Métricas
As métricas escolhidas refletem literatura estabelecida de pesquisa em tremor:
- **Frequência de Pico**: Critério diagnóstico primário
- **Largura Espectral**: Indica regularidade do ritmo
- **Distribuição de Potência**: Caracteriza organização do sinal
- **Medidas de Entropia**: Quantificam complexidade do sinal

## Contribuições

Acolhemos contribuições em:
- Melhorias de algoritmos
- Estudos de validação clínica
- Aprimoramentos da interface do usuário
- Melhorias na documentação
- Relatórios de bugs e solicitações de recursos

## Citação

Se usar o TremorPSD em pesquisa, por favor cite:
```
TremorPSD: Plataforma Avançada de Análise de Tremor
Disponível em: https://github.com/pedrobrandao-neurologia/tremor-psd
```

## Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo LICENSE para detalhes.

## Aviso Legal

**Importante Aviso Médico**: O TremorPSD é destinado apenas para fins educacionais e de pesquisa. Não é um dispositivo médico e não deve ser usado para diagnóstico clínico ou decisões de tratamento. Sempre consulte profissionais de saúde qualificados para aconselhamento médico e diagnóstico de distúrbios do movimento.

## Suporte

Para suporte técnico, dúvidas ou consultas de colaboração:
- **Issues**: Rastreador de Issues do GitHub
- **Documentação**: Páginas da Wiki
- **Contato**: pedrobrandao.neurologia@gmail.com

---

**Versão**: 2.0  
**Última Atualização**: 2024  
**Plataforma**: Baseada na web (HTML5/JavaScript)  
**Dependências**: Nenhuma (implementação autônoma)


# TremorPSD: Advanced Tremor Analysis Platform

A comprehensive web-based application for real-time tremor analysis using smartphone accelerometry and advanced signal processing techniques. TremorPSD implements clinically-relevant spectral analysis methods to characterize movement disorders through objective, quantitative metrics.

## Overview

TremorPSD leverages the accelerometer sensors available in modern smartphones to perform professional-grade tremor analysis. The platform employs established signal processing methodologies commonly used in clinical research and movement disorder assessment, providing transparent and reproducible analysis pipelines.

## Key Features

### Signal Processing Pipeline

**Digital Filtering**
- Configurable IIR bandpass filters (1st order Butterworth)
- Default diagnostic band: 3-20 Hz (adjustable)
- Real-time detrending and DC component removal
- Causal implementation suitable for real-time analysis

**Spectral Analysis**
- Welch's method for power spectral density (PSD) estimation
- Hanning windowing with proper normalization
- Configurable segment length and overlap parameters
- Recursive FFT implementation (Cooley-Tukey algorithm)

### Clinical Metrics

The platform computes established tremor characterization metrics:

- **Peak Frequency**: Dominant frequency in diagnostic band (Hz)
- **FWHM**: Full Width at Half Maximum of spectral peak (Hz)
- **Spectral Entropy**: Information content measure (-∑ pᵢ log₂ pᵢ)
- **Peak-to-Total Ratio (PTR)**: Power concentration metric
- **Tremor Stability Index (TSI)**: Peak stability measure (FWHM/f_peak)
- **Spectral Centroid**: Frequency-weighted power center (Hz)

### Differential Classification

Rule-based classification system supporting:
- **Orthostatic Tremor** (13-18 Hz, high coherence)
- **Essential Tremor** (4-12 Hz, moderate selectivity)
- **Dystonic Tremor** (4-7 Hz, irregular spectrum)
- **Myoclonus** (broad spectrum, high entropy)

The classification algorithm provides explainable reasoning and confidence scores based on multiple spectral characteristics.

## Technical Specifications

### Data Acquisition
- **Sampling Rate**: Adaptive (typically 50-100 Hz)
- **Resolution**: Device-dependent accelerometer precision
- **Axes**: X, Y, Z, magnitude, or auto-detected dominant axis
- **Duration**: Configurable (10-60 seconds)

### Processing Parameters
- **Segment Length**: 2-8 seconds (default: 4s)
- **Overlap**: 0-75% (default: 50%)
- **Filter Cutoffs**: Configurable bandpass limits
- **Window Function**: Hanning (von Hann)

### Output Formats
- **CSV Export**: Time series data (raw and filtered)
- **Technical Report**: Comprehensive analysis summary
- **Real-time Visualization**: Time domain and frequency domain plots

## Clinical Applications

TremorPSD is designed for:
- Movement disorder research
- Objective tremor quantification
- Educational demonstrations
- Telemedicine screening
- Longitudinal monitoring studies

## Methodological Transparency

The platform emphasizes reproducible research practices:
- **Open Algorithms**: All processing steps are documented and accessible
- **Parameter Traceability**: Complete parameter logging in reports
- **Standardized Metrics**: Implementation follows established literature
- **Quality Assurance**: Built-in signal quality assessment

## Usage Requirements

### Technical Prerequisites
- **HTTPS Context**: Required for sensor access
- **Modern Browser**: Support for DeviceMotionEvent API
- **Mobile Device**: Built-in accelerometer sensors
- **Permissions**: Motion sensor access approval

### Installation
```bash
# Clone repository
git clone https://github.com/username/tremor-psd.git

# Serve via HTTPS (required for sensor access)
# Option 1: GitHub Pages
# Option 2: Netlify/Vercel deployment
# Option 3: Local HTTPS server
```

### Quick Start
1. Access application via HTTPS URL
2. Grant motion sensor permissions
3. Configure analysis parameters
4. Position device as instructed
5. Initiate data collection
6. Review results and export data

## Validation and Limitations

### Validation Status
- **Algorithm Verification**: Compared against reference implementations
- **Synthetic Data Testing**: Validated with known signal characteristics
- **Clinical Correlation**: Requires validation against gold standard methods

### Important Limitations
- **Educational Purpose**: Not approved for clinical diagnosis
- **Device Variability**: Results may vary across different hardware
- **Environmental Factors**: Sensitive to device mounting and external vibrations
- **Sampling Irregularities**: Mobile sensors may have variable timing

## Scientific Rationale

### Spectral Analysis Approach
The platform implements Welch's method as the gold standard for biological signal PSD estimation. This approach provides:
- **Variance Reduction**: Averaging across segments reduces noise
- **Frequency Resolution**: Balanced with statistical reliability
- **Computational Efficiency**: Suitable for real-time implementation

### Metric Selection
Chosen metrics reflect established tremor research literature:
- **Peak Frequency**: Primary diagnostic criterion
- **Spectral Width**: Indicates rhythm regularity
- **Power Distribution**: Characterizes signal organization
- **Entropy Measures**: Quantify signal complexity

## Contributing

We welcome contributions in:
- Algorithm improvements
- Clinical validation studies
- User interface enhancements
- Documentation improvements
- Bug reports and feature requests

## Citation

If you use TremorPSD in research, please cite:
```
TremorPSD: Advanced Tremor Analysis Platform
[Authors], [Year]
Available at: https://github.com/username/tremor-psd
```

## License

This project is licensed under the MIT License - see LICENSE file for details.

## Disclaimer

**Important Medical Disclaimer**: TremorPSD is intended for educational and research purposes only. It is not a medical device and should not be used for clinical diagnosis or treatment decisions. Always consult qualified healthcare professionals for medical advice and diagnosis of movement disorders.

## Support

For technical support, questions, or collaboration inquiries:
- **Issues**: GitHub Issues tracker
- **Documentation**: Wiki pages
- **Contact**: [maintainer-email]

---

**Version**: 2.0  
**Last Updated**: 2024  
**Platform**: Web-based (HTML5/JavaScript)  
**Dependencies**: None (standalone implementation)
