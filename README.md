# Araujo BI - Dashboard de Inteligência Executiva 📊

Aplicação *Zero-Backend* desenvolvida para transformar dados isolados em planilhas financeiras em um motor de decisão visual, preditivo e focado em estancar drenagens de caixa.

## 🚀 Funcionalidades (Features)
- **Privacidade Total (Zero-Backend):** Os dados são processados nativamente no navegador do cliente usando a RAM local através da biblioteca `SheetJS`. Nenhuma informação financeira é enviada para servidores na nuvem.
- **Detecção de "Ralos Invisíveis":** Algoritmo que varre os históricos de despesas e isola o prejuízo exato causado por Taxas de Antecipação de Cartão de Crédito.
- **Machine Learning Integrado:** Regressão linear aplicada ao histórico de vendas brutas para projetar faturamentos futuros.
- **Geração de Apresentação Executiva:** Integração com `PptxGenJS` que permite a exportação automática de todo o relatório de inteligência para um arquivo editável do PowerPoint (`.pptx`) com apenas 1 clique.

## 🛠️ Tecnologias Utilizadas
- **HTML5, CSS3 (Vanilla)** com design baseado em *Glassmorphism* e alto contraste (*Dark Mode*).
- **JavaScript (ES6+)** como motor de manipulação de dados e regras de negócio.
- **Chart.js** para visualização de dados dinâmica.
- **SheetJS (xlsx)** para parsing de arquivos Excel direto no cliente.
- **PptxGenJS** para geração de arquivos de apresentação de forma autônoma.

## 🔒 Segurança (Data Privacy)
O repositório foi configurado para **rejeitar o versionamento** de qualquer arquivo de banco de dados e planilhas sensíveis (`*.xlsx`, `*.xls`, `*.csv`).
O processamento é feito localmente e temporariamente na máquina de quem acessa o painel.

## 🌐 Como Rodar Localmente
1. Clone este repositório.
2. Acesse a pasta `dashboard-web`.
3. Abra o arquivo `index.html` com o *Live Server* ou qualquer servidor estático local.
4. Arraste uma planilha padrão de faturamento para dentro do sistema.
