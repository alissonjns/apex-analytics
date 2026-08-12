# Apex Analytics - Plataforma de Inteligência e Engenharia de Dados (SaaS)

Bem-vindo ao repositório do **Apex Analytics**, uma solução de Data Analytics e Business Intelligence (BI) ponta a ponta construída com foco em Engenharia de Dados e Infraestrutura Cloud. O projeto transforma dados desestruturados e isolados em painéis gerenciais robustos, rápidos e inteligentes.

Inicialmente modelado para o nicho de Varejo Alimentício (Padarias e Restaurantes), o motor da aplicação é escalável e adaptável a qualquer setor que possua fluxo de caixa e gestão de estoque.

---

## 💡 O Problema e a Solução

Pequenos e médios varejistas sofrem com a **fragmentação de dados**: dezenas de planilhas financeiras isoladas geradas por sistemas de ERP legados, tornando impossível a tomada de decisão em tempo real.

O **Apex Analytics** atua como uma plataforma **SaaS Multi-Tenant**. Ele automatiza a ingestão dessas planilhas caóticas, executa um pipeline de ETL (Extract, Transform, Load) na nuvem e entrega métricas cruciais de negócio em uma interface web corporativa e de carregamento instantâneo.

### 🚀 Valor de Negócio (Features Principais)
1. **Engenharia de Dados Resiliente:** Motor de extração (Python/Pandas) tolerante a falhas, capaz de ingerir planilhas desestruturadas, com nomes incorretos, caracteres inválidos e formatação de moeda inconsistente, simulando cenários reais e sujos de clientes.
2. **Motor de Inteligência Artificial (IA):** Integração para geração de relatórios dinâmicos em PDF. A aplicação analisa matematicamente os resultados do dashboard em tela e redige diagnósticos empresariais explicativos utilizando APIs avançadas de IA.
3. **Identificação de Ofensores (Perdas e CMV):** Algoritmos que cruzam receitas e perdas operacionais para identificar matematicamente qual setor (ex: Confeitaria vs Produção) está "sangrando" o caixa.
4. **Isolamento de Dados (Multi-Tenant):** Arquitetura segura onde múltiplos clientes podem utilizar o SaaS sem vazamento de dados, com partições físicas no Data Lake (AWS S3) por `tenant_id`.

---

## 🏗 Arquitetura e Infraestrutura Cloud

A infraestrutura foi desenhada para ser **100% Serverless** na AWS (Amazon Web Services), garantindo que o custo operacional seja zero quando a plataforma não estiver em uso, mas com capacidade de escalar instantaneamente para milhares de requisições.

### Por que Serverless e AWS?
A decisão pela arquitetura Serverless (Lambda + API Gateway + S3) foi pautada na **escalabilidade e eficiência de custos**. Não há servidores ociosos para gerenciar. O armazenamento no S3 como Data Lake oferece durabilidade de 99.9999999% e armazenamento virtualmente infinito a custos centavos.

### 🛠 Stack Tecnológico
* **Backend & ETL:** Python 3, FastAPI, Pandas, AWS Data Wrangler (awswrangler)
* **Cloud Computing:** AWS Lambda (com adapter Mangum), Amazon API Gateway
* **Segurança e Autenticação:** Amazon Cognito (JWTs, Gestão de Usuários)
* **Data Lake (Armazenamento):** Amazon S3 (formato colunar `.parquet` estruturado por partições)
* **Frontend:** HTML5, CSS3, JavaScript (Vanilla SPA) e Chart.js

### 🔄 O Pipeline de Dados (Arquitetura Medallion "On-the-Fly")
1. **Camada Ingestão:** O frontend envia a planilha do cliente em memória para a API.
2. **Camada Bronze (Raw):** O script `etl.py` ingere e converte as abas da planilha para arquivos `.parquet` (compressão colunar), preservando o dado bruto como texto no S3 (Partição: `/clientes/{tenant_id}/bronze/`).
3. **Camadas Silver/Gold (Processamento On-the-Fly):** Visando otimizar custos para bases de dados enxutas, a transformação de dados (limpeza de caracteres, conversão para numéricos - Silver) e as agregações de negócio (cálculos de KPIs, médias, cruzamento de dados - Gold) são executadas **em tempo real** na memória da AWS Lambda (`api_logic.py`) no momento em que o usuário acessa o dashboard.

> **Escalabilidade Futura:** Caso o volume de dados do cliente cresça para Terabytes, o projeto está preparado para desacoplar as camadas Silver e Gold, transferindo o processamento pesado "On-the-Fly" para **AWS Glue Jobs** agendados, que salvariam os agregados físicos de volta no S3 para leitura ultrarrápida (Amazon Athena).

---

## 🕹 Como Testar (Ambiente de Demonstração)

Você pode interagir com o ambiente de produção (Frontend via GitHub Pages conectando na AWS).

1. **Acesse o Sistema:** [🔗 Acessar Dashboard Apex Analytics](https://alissonjns.github.io/apex-analytics/dashboard-web/index.html)
2. **Como o Usuário Visitante (Demo):**
   Ao acessar, você verá a tela de upload inicial. Para ver o Data Lake trabalhar, você precisará enviar dados.
   
   - 📥 **[Baixe a Planilha de Demonstração (ZIP) Aqui](https://raw.githubusercontent.com/alissonjns/apex-analytics/main/Apex_Demo_Data.zip)**
   - Extraia a pasta e faça o upload do arquivo Excel na tela do sistema. A AWS Lambda processará os dados em segundos e montará todo o dashboard.

> [!WARNING]  
> **Engenharia de Dados na Prática:** A base de demonstração para download acima não é uma planilha perfeita. Ela foi **gerada por Inteligência Artificial** com o intuito de ser **propositalmente caótica**: abas mal nomeadas (` 5_P e r d a s `), colunas em branco, formatações de moeda corrompidas (`" R$   2.500,45 "`) e lixo visual. 
> 
> O objetivo dessa base de testes é provar a incrível resiliência, expressões regulares e a robustez do motor de extração (ETL Python) do sistema, que consegue limpar e entender dados sujos automaticamente!

---

## 💻 Como Rodar o Backend Localmente

Se você deseja inspecionar o motor Python ou contribuir com o projeto, pode rodá-lo localmente (bypassando o deploy na AWS Lambda).

```bash
# 1. Clone o Repositório
git clone https://github.com/alissonjns/apex-analytics.git
cd apex-analytics/backend

# 2. Instale as dependências
pip install -r requirements.txt

# 3. Defina as Variáveis de Ambiente (Simulação AWS)
# No Windows PowerShell:
$env:S3_BUCKET_NAME="seu-bucket-s3"
$env:COGNITO_USER_POOL_ID="seu-pool-id"

# 4. Inicie o Servidor FastAPI
uvicorn main:app --reload
```
A API ficará disponível em `http://127.0.0.1:8000`. 
Acesse a documentação interativa nativa do FastAPI Swagger em `http://127.0.0.1:8000/docs` para testar os endpoints de extração.

---
*Projeto desenvolvido como Prova de Conceito de arquitetura Cloud SaaS e Engenharia de Dados corporativa.*
