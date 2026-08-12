import os
import pandas as pd
import awswrangler as wr

# Lê o bucket do ambiente, ou usa um padrão (você deve mudar isso depois)
S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "araujo-bi-datalake")
ATHENA_DB = "araujo_bi"

def run_etl(file_path, tenant_id="visitante"):
    print(f"Iniciando ingestão da planilha para o AWS S3: {file_path} | Tenant: {tenant_id}")
    
    # Modo Local: Ignorando a criação do banco no Athena para rodar sem AWS
    print("Modo de Portfólio Local: Processando dados localmente.")

    # Lista de abas que nos interessam
    sheets_of_interest = [
        '1- BANCO DE DADOS',
        '2 - FOLHA DE PAGAMENTO', 
        '3 - RESCISÕES',
        '4 - Meios de Pagamentos', 
        '5 - Perdas',
        '6 - CMV', 
        '7 - Receitas '
    ]
    
    xl = pd.ExcelFile(file_path)
    
    processed_count = 0
    
    for sheet in sheets_of_interest:
        if sheet in xl.sheet_names:
            processed_count += 1
            print(f"Processando aba para nuvem: {sheet}")
            
            # Lendo a aba inteira (Camada Bronze)
            df = pd.read_excel(file_path, sheet_name=sheet)
            
            # Converter tudo para string para evitar erros de tipagem ('mixed types') no Parquet
            df = df.astype(str)
            
            # Limpando nome da tabela (Athena aceita apenas letras minúsculas e _ )
            table_name = "bronze_" + sheet.replace(" - ", "_").replace(" ", "_").lower()
            table_name = ''.join(e for e in table_name if e.isalnum() or e == '_')
            
            # Como as colunas vem sujas (Unnamed: 0), precisamos garantir que sejam todas strings pro Parquet
            df.columns = [str(c).replace(" ", "_").replace(".", "_").lower() for c in df.columns]
            
            # Salvando no S3 como Parquet (Camada Bronze) em subpastas por tenant
            s3_path = f"s3://{S3_BUCKET}/clientes/{tenant_id}/bronze/{table_name}.parquet"
            wr.s3.to_parquet(df=df, path=s3_path)
            print(f"  -> Upload concluído: {table_name} salvo no S3 em {s3_path}")
            
    if processed_count == 0:
        raise Exception(f"Nenhuma das abas esperadas foi encontrada no arquivo! Abas encontradas: {xl.sheet_names}")
    
    print("Ingestão para o Data Lake concluída com sucesso!")
    return True
