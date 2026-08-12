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
    
    # Limpa a lixeira antiga do tenant ANTES de extrair as abas novas!
    # Isso resolve o BUG do F5 recarregando planilhas fantasmas velhas.
    try:
        wr.s3.delete_objects(f"s3://{S3_BUCKET}/clientes/{tenant_id}/bronze/")
    except Exception as e:
        print(f"Falha ao limpar bronze antigo: {e}")

    # Lista de abas que nos interessam
    sheets_of_interest = [
        'banco de dados',
        'folha de pagamento', 
        'rescisões',
        'meios de pagamentos', 
        'perdas',
        'cmv', 
        'receitas'
    ]
    
    xl = pd.ExcelFile(file_path)
    
    processed_count = 0
    
    for sheet in xl.sheet_names:
        sheet_clean = sheet.lower().strip()
        matched = False
        for s in sheets_of_interest:
            if s in sheet_clean:
                matched = True
                break
                
        if matched:
            processed_count += 1
            print(f"Processando aba para nuvem: {sheet}")
            
            # Lendo a aba inteira (Camada Bronze) sem interpretar a primeira linha como header
            # Isso preserva TODOS os dados da planilha sem perder a primeira linha
            df = pd.read_excel(file_path, sheet_name=sheet, header=None)
            
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
