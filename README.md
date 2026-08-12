# Apex Analytics - Sistema SaaS Multi-Tenant para Padarias

![Apex Analytics - Dashboard](https://github.com/alissonjns/araujo-bi/blob/main/dashboard-web/assets/placeholder_dashboard.png?raw=true)

Bem-vindo ao repositório do **Apex Analytics**, uma solução de inteligência de negócios (BI) ponta a ponta projetada inicialmente para o varejo alimentício (Padarias), transformando dados complexos de planilhas locais em painéis web modernos, rápidos e orientados à tomada de decisão executiva.

---

## 💡 O Que é o Projeto?
O Apex Analytics é uma plataforma **SaaS (Software as a Service)** escalável. O modelo de negócios resolve um grande problema de pequenos e médios varejistas: a incapacidade de interpretar dezenas de planilhas financeiras desconexas. 

A aplicação realiza a **ingestão automática** de planilhas (arquivos do ERP do cliente), converte e estrutura os dados usando Engenharia de Dados em nuvem (Data Lake), e entrega visualizações ricas via web com um layout corporativo (Light Theme) projetado para **gerar valor de negócio** através de insights (ex: rastreamento de "Fiado", ofensores de CMV, custos trabalhistas ocultos).

---

## 🚀 Valor de Negócio Gerado (Diferencial)
O projeto não apenas empilha gráficos. Ele possui inteligência focada na "dor do dono":

1. **O "Ralo Invisível" (Controle de Perdas):** O motor de dados analisa as perdas e as agrupa por setor (Confeitaria, Sushi, Cozinha), identificando matematicamente o *Setor Ofensor* e calculando o impacto direto no percentual de vendas gerais.
2. **Previsão Analítica (ML):** Utiliza tendências e regressão estatística no backend Python para gerar previsões de faturamento baseadas nos últimos 6 meses consolidados.
3. **Gestão de Risco de Crédito (Fiado):** Um módulo exclusivo na aba "Receitas" que destaca o volume de vendas via "Caderneta" frente a opções de liquidez imediata (PIX), com alertas visuais de risco.
4. **Isolamento Multi-Cliente (Multi-Tenant):** Preparado para escalar para *n* clientes. Dados são segregados no AWS S3 por `tenant_id` e a segurança no frontend é gerida via JWTs do AWS Cognito.

---

## 🛠 Tecnologias Utilizadas

### Engenharia de Dados & Backend (Python)
- **FastAPI:** Para a criação da API Rest ultrarrápida.
- **AWS Data Wrangler & Pandas:** Limpeza, transformação e salvamento estruturado (ETL) em formato otimizado `.parquet` na AWS.
- **Mangum:** Adapter para rodar a aplicação inteira em uma infraestrutura Serverless (AWS Lambda).

### Infraestrutura em Nuvem (AWS)
- **AWS S3:** Servindo como o Data Lake (camada Bronze, Silver e Gold).
- **AWS Cognito:** Autenticação, gestão de usuários e separação por grupos (Ex: `Araujo-Admins`).
- **AWS API Gateway & Lambda:** Orquestração e computação backend 100% serverless, cobrado apenas por uso.

### Front-End Web (SPA)
- **HTML5, Vanilla CSS3, Vanilla JavaScript:** Arquitetura limpa sem depender de frameworks pesados, garantindo carregamento instantâneo.
- **Chart.js:** Renderização de Gráficos analíticos.
- **Single Page Application (SPA):** Navegação entre abas sem reload de página, com cache inteligente.

---

## 🕹 Como Testar (Ambiente de Demonstração)

Você pode acessar o ambiente de testes de demonstração.

1. **Acesse o Sistema (Hospedado no GitHub Pages):**
   [🔗 Acessar Dashboard Apex Analytics](https://alissonjns.github.io/araujo-bi/dashboard-web/index.html)

2. **Como o Usuário Visitante (Demo):**
   Acesse a URL e veja o layout inicial. Você precisará de uma planilha no formato exato que nosso ETL espera.
   - 📥 **[Baixe a Planilha de Demonstração (Fictícia) Aqui](https://raw.githubusercontent.com/alissonjns/araujo-bi/main/Planilha_Demonstracao_Apex.xlsx)**
   - Faça o upload dessa planilha no sistema e veja o Data Lake processar as 7 abas automaticamente, populando os gráficos em tempo real na sua sessão!

### Como rodar o Backend Localmente

Se você clonou este repositório e deseja testar o Motor Python na sua máquina (sem necessariamente jogar para a AWS):

```bash
# 1. Clone o Repositório
git clone https://github.com/alissonjns/araujo-bi.git
cd araujo-bi/backend

# 2. Instale as dependências
pip install -r requirements.txt

# 3. Inicie o Servidor FastAPI
uvicorn main:app --reload
```

O backend subirá em `http://127.0.0.1:8000`. Acesse `http://127.0.0.1:8000/docs` para ver e testar a documentação interativa da API.

---

## 📸 Screenshots (Sneak Peek)

### Visão Geral & KPIs
*(Em breve - Adicione o print aqui)*

### Módulo de Controle de Perdas
*(Em breve - Adicione o print aqui)*
