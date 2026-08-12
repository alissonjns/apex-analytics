
def find_parquet(s3_bucket, tenant_id, keyword):
    import awswrangler as wr
    try:
        files = wr.s3.list_objects(path=f"s3://{s3_bucket}/clientes/{tenant_id}/bronze/")
        for f in files:
            if keyword.lower() in f.lower():
                return f
    except Exception:
        pass
    return None

import pandas as pd
import math

def clean_val(x):
    if pd.isna(x) or x == '' or str(x).lower().strip() == 'nan':
        return None
    if isinstance(x, (int, float)):
        return x
    if isinstance(x, str):
        try:
            return float(x)
        except ValueError:
            pass
        s = x.replace('R$', '').replace('.', '').replace(',', '.').strip()
        try:
            return float(s)
        except ValueError:
            return None
    return None

def extract_row(matrix, keyword, start_row=0, end_row=None):
    import unicodedata
    def normalize_str(s):
        if not isinstance(s, str):
            return ""
        s = unicodedata.normalize('NFD', str(s).lower())
        s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
        return ''.join(c for c in s if c.isalnum())
    
    clean_key = normalize_str(keyword)
    limit = end_row if end_row else len(matrix)
    
    for r in range(start_row, limit):
        row = matrix[r]
        for c, cell in enumerate(row):
            if isinstance(cell, str):
                clean_cell = normalize_str(cell)
                if (clean_cell == clean_key or 
                    ('antecipa' in clean_key and 'antecipa' in clean_cell) or 
                    ('cart' in clean_key and 'cart' in clean_cell)):
                    
                    data = []
                    for i in range(c + 1, len(row)):
                        v = clean_val(row[i])
                        if v is not None or (len(data) > 0 and len(data) < 12):
                            data.append(v)
                        if len(data) == 12:
                            break
                    while len(data) < 12:
                        data.append(None)
                    return data
    return [None] * 12

def get_dashboard_data(tenant_id="visitante"):
    import awswrangler as wr
    import os
    
    ATHENA_DB = "araujo_bi"
    
    print(f"Consultando dados locais (Parquet)... | Tenant: {tenant_id}")
    try:
        # Modo Nuvem: Lê o parquet gerado pelo ETL direto do S3
        s3_bucket = os.environ.get("S3_BUCKET_NAME", "araujo-bi-datalake")
        s3_path = find_parquet(s3_bucket, tenant_id, "receitas")
        if not s3_path: raise Exception("receitas not found")
        df = wr.s3.read_parquet(path=s3_path)
    except Exception as e:
        print(f"O arquivo ainda não existe no Data Lake ou não pôde ser lido: {e}")
        df = pd.DataFrame()
        
    if df.empty:
        return {'data': {}, 'insights': {}}
    
    # Convert dataframe to matrix (list of lists)
    matrix = df.values.tolist()
    
    results_data = {}
    
    # Find year anchors
    year_anchors = []
    for r, row in enumerate(matrix):
        for c, cell in enumerate(row):
            # Limpa '.0' caso pandas tenha convertido int para float->string
            if str(cell).replace('.0', '') in ['2023', '2024', '2025', '2026']:
                if c <= 2:
                    year_anchors.append({'year': str(cell).replace('.0', ''), 'row': r})
    
    for i in range(len(year_anchors)):
        year = year_anchors[i]['year']
        start_row = year_anchors[i]['row']
        end_row = year_anchors[i+1]['row'] if i < len(year_anchors) - 1 else len(matrix)
        
        delivery_row = -1
        for r in range(start_row, end_row):
            if any(isinstance(cell, str) and 'delivery' in str(cell).lower() for cell in matrix[r]):
                delivery_row = r
                break
        
        limit_vendas = delivery_row if delivery_row > -1 else end_row
        
        vendas = extract_row(matrix, 'vendas', start_row, limit_vendas)
        fluxo = extract_row(matrix, 'fluxo', start_row, limit_vendas)
        tm = extract_row(matrix, 'tm', start_row, limit_vendas)
        
        despesas = extract_row(matrix, 'despesas', start_row, end_row)
        ro = extract_row(matrix, 'ro', start_row, end_row)
        if sum(x is None for x in ro) == 12:
            ro = extract_row(matrix, 'rlo', start_row, end_row)
            
        taxa_cartao = extract_row(matrix, 'taxa cartão', start_row, end_row)
        if sum(x is None for x in taxa_cartao) == 12:
            taxa_cartao = extract_row(matrix, 'taxa cartao', start_row, end_row)
            
        taxa_antecip = extract_row(matrix, 'taxa antecipação', start_row, end_row)
        if sum(x is None for x in taxa_antecip) == 12:
            taxa_antecip = extract_row(matrix, 'taxa antecipacao', start_row, end_row)
            
        deliv_vendas = extract_row(matrix, 'vendas', delivery_row, end_row) if delivery_row > -1 else [None]*12
        
        results_data[year] = {
            'vendas': vendas,
            'fluxo': fluxo,
            'tm': tm,
            'despesas': despesas,
            'ro': ro,
            'taxa_cartao': taxa_cartao,
            'taxa_antecipacao': taxa_antecip,
            'delivery_vendas': deliv_vendas
        }
    
    # Calculate Insights
    total_antecip = 0
    total_ro = 0
    sales_history = []
    
    for y in sorted(results_data.keys()):
        d = results_data[y]
        total_antecip += sum(x for x in d['taxa_antecipacao'] if x is not None)
        total_ro += sum(x for x in d['ro'] if x is not None)
        sales_history.extend([x for x in d['vendas'] if x is not None])
        
    next_month_pred = None
    if len(sales_history) >= 6:
        y = sales_history[-6:]
        n = len(y)
        sumX = sum(range(n))
        sumY = sum(y)
        sumXY = sum(i * y[i] for i in range(n))
        sumXX = sum(i * i for i in range(n))
        
        if (n * sumXX - sumX * sumX) != 0:
            slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
            intercept = (sumY - slope * sumX) / n
            next_month_pred = slope * n + intercept
            
    impacto_antecipacao_pct = (total_antecip / total_ro * 100) if total_ro > 0 else 0
    
    return {
        'data': results_data,
        'insights': {
            'total_antecipacao': total_antecip,
            'total_ro': total_ro,
            'impacto_antecipacao_pct': impacto_antecipacao_pct,
            'previsao_proximo_mes_vendas': next_month_pred
        }
    }

def get_receitas_data(tenant_id="visitante"):
    import awswrangler as wr
    import os
    
    s3_bucket = os.environ.get("S3_BUCKET_NAME", "araujo-bi-datalake")
    
    try:
        p_rec = find_parquet(s3_bucket, tenant_id, "receitas")
        p_pag = find_parquet(s3_bucket, tenant_id, "pagamento")
        if not p_rec or not p_pag: raise Exception("Finance files not found")
        df_rec = wr.s3.read_parquet(path=p_rec)
        df_pag = wr.s3.read_parquet(path=p_pag)
    except Exception as e:
        print(f"Erro lendo parquets de receitas: {e}")
        return {'error': 'Dados não encontrados'}

    rec_matrix = df_rec.values.tolist()
    pag_matrix = df_pag.values.tolist()
    
    results = {}
    
    # Encontrar anos no arquivo de pagamentos
    year_anchors = []
    for r, row in enumerate(pag_matrix):
        for c, cell in enumerate(row):
            if str(cell).replace('.0', '') in ['2023', '2024', '2025', '2026']:
                if c <= 2:
                    year_anchors.append({'year': str(cell).replace('.0', ''), 'row': r})
                    
    for i in range(len(year_anchors)):
        year = year_anchors[i]['year']
        start_row = year_anchors[i]['row']
        end_row = year_anchors[i+1]['row'] if i < len(year_anchors) - 1 else len(pag_matrix)
        
        dinheiro = extract_row(pag_matrix, 'dinheiro', start_row, end_row)
        credito = extract_row(pag_matrix, 'crédito', start_row, end_row)
        if sum(x is None for x in credito) == 12: credito = extract_row(pag_matrix, 'credito', start_row, end_row)
        debito = extract_row(pag_matrix, 'débito', start_row, end_row)
        if sum(x is None for x in debito) == 12: debito = extract_row(pag_matrix, 'debito', start_row, end_row)
        pix = extract_row(pag_matrix, 'pix', start_row, end_row)
        caderneta = extract_row(pag_matrix, 'caderneta', start_row, end_row)
        
        results[year] = {
            'dinheiro': dinheiro,
            'credito': credito,
            'debito': debito,
            'pix': pix,
            'caderneta': caderneta
        }
        
    return {'data': results}

def get_rh_data(tenant_id="visitante"):
    import awswrangler as wr
    import os
    s3_bucket = os.environ.get("S3_BUCKET_NAME", "araujo-bi-datalake")
    try:
        p_folha = find_parquet(s3_bucket, tenant_id, "folha")
        p_resc = find_parquet(s3_bucket, tenant_id, "rescis")
        if not p_folha or not p_resc: raise Exception("RH files not found")
        df_folha = wr.s3.read_parquet(path=p_folha)
        df_resc = wr.s3.read_parquet(path=p_resc)
    except Exception as e:
        return {'error': 'Dados não encontrados'}

    folha_matrix = df_folha.values.tolist()
    resc_matrix = df_resc.values.tolist()
    
    # Extrair os anos do cabeçalho da folha
    # A linha 0 tem os anos nas colunas 2 em diante
    anos_linha = folha_matrix[0] if len(folha_matrix) > 0 else []
    anos = []
    col_map = {}
    for i, cell in enumerate(anos_linha):
        if str(cell).replace('.0', '') in ['2023', '2024', '2025', '2026']:
            ano = str(cell).replace('.0', '')
            anos.append(ano)
            col_map[ano] = i
            
    results = {}
    for ano in anos:
        folha_meses = []
        resc_meses = []
        col_idx = col_map[ano]
        
        # Pega linhas 1 a 12 para meses
        for m in range(1, 13):
            if m < len(folha_matrix):
                val = clean_val(folha_matrix[m][col_idx])
                folha_meses.append(val if val is not None else 0)
            if m < len(resc_matrix):
                val_resc = clean_val(resc_matrix[m][col_idx])
                resc_meses.append(val_resc if val_resc is not None else 0)
                
        results[ano] = {
            'folha': folha_meses,
            'rescisao': resc_meses
        }
    return {'data': results}

def get_perdas_data(tenant_id="visitante"):
    import awswrangler as wr
    import os
    s3_bucket = os.environ.get("S3_BUCKET_NAME", "araujo-bi-datalake")
    try:
        p_perdas = find_parquet(s3_bucket, tenant_id, "perdas")
        if not p_perdas: raise Exception("Perdas file not found")
        df_perdas = wr.s3.read_parquet(path=p_perdas)
    except Exception as e:
        return {'error': 'Dados não encontrados'}
        
    matrix = df_perdas.values.tolist()
    results = {}
    
    # Procurar por anos
    for r, row in enumerate(matrix):
        if len(row) > 1 and str(row[1]).replace('.0', '') in ['2023', '2024', '2025', '2026']:
            ano = str(row[1]).replace('.0', '')
            
            # As próximas linhas têm setores
            confeitaria = extract_row(matrix, 'confeitaria', r, r+10)
            producao = extract_row(matrix, 'produção', r, r+10)
            if sum(x is None for x in producao) == 12: producao = extract_row(matrix, 'producao', r, r+10)
            pizza = extract_row(matrix, 'pizza', r, r+10)
            cozinha = extract_row(matrix, 'cozinha', r, r+10)
            sushi = extract_row(matrix, 'sushi', r, r+10)
            atend = extract_row(matrix, 'atendimento', r, r+10)
            total = extract_row(matrix, 'total', r, r+10)
            vendas = extract_row(matrix, 'vendas', r, r+12)
            
            # Subtrai 1 porque o extract row pega a partir da coluna seguinte da keyword
            # E na planilha Perdas, a coluna da keyword é B (idx 1), entao os dados estao a partir do idx 2 (Jan a Dez = 12 cols)
            # Mas o total ta no final.
            results[ano] = {
                'confeitaria': confeitaria[:12],
                'producao': producao[:12],
                'pizza': pizza[:12],
                'cozinha': cozinha[:12],
                'sushi': sushi[:12],
                'atendimento': atend[:12],
                'total_perdas': total[:12],
                'total_vendas': vendas[:12]
            }
            
    return {'data': results}

if __name__ == "__main__":
    import json
    print(json.dumps(get_dashboard_data(), indent=2))
