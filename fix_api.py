import re

with open('backend/api_logic.py', 'r', encoding='utf-8') as f:
    content = f.read()

helper = '''
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

'''

content = helper + content

# Replace dashboard data
content = content.replace(
'''        s3_path = f"s3://{s3_bucket}/clientes/{tenant_id}/bronze/bronze_7_receitas_.parquet"
        df = wr.s3.read_parquet(path=s3_path)''',
'''        s3_path = find_parquet(s3_bucket, tenant_id, "receitas")
        if not s3_path: raise Exception("receitas not found")
        df = wr.s3.read_parquet(path=s3_path)'''
)

# Replace finance data
content = content.replace(
'''    try:
        df_rec = wr.s3.read_parquet(path=f"s3://{s3_bucket}/clientes/{tenant_id}/bronze/bronze_7_receitas_.parquet")
        df_pag = wr.s3.read_parquet(path=f"s3://{s3_bucket}/clientes/{tenant_id}/bronze/bronze_4_meios_de_pagamentos.parquet")
    except Exception as e:''',
'''    try:
        p_rec = find_parquet(s3_bucket, tenant_id, "receitas")
        p_pag = find_parquet(s3_bucket, tenant_id, "pagamento")
        if not p_rec or not p_pag: raise Exception("Finance files not found")
        df_rec = wr.s3.read_parquet(path=p_rec)
        df_pag = wr.s3.read_parquet(path=p_pag)
    except Exception as e:'''
)

# Replace rh data
content = content.replace(
'''    def safe_read(base_name):
        try:
            return wr.s3.read_parquet(path=f"s3://{s3_bucket}/clientes/{tenant_id}/bronze/{base_name}.parquet")
        except Exception:
            return wr.s3.read_parquet(path=f"s3://{s3_bucket}/clientes/{tenant_id}/bronze/{base_name}_.parquet")

    try:
        df_folha = safe_read("bronze_2_folha_de_pagamento")
        df_resc = safe_read("bronze_3_rescisões")
    except Exception as e:''',
'''    try:
        p_folha = find_parquet(s3_bucket, tenant_id, "folha")
        p_resc = find_parquet(s3_bucket, tenant_id, "rescis")
        if not p_folha or not p_resc: raise Exception("RH files not found")
        df_folha = wr.s3.read_parquet(path=p_folha)
        df_resc = wr.s3.read_parquet(path=p_resc)
    except Exception as e:'''
)

# Replace perdas data
content = content.replace(
'''    def safe_read(base_name):
        try:
            return wr.s3.read_parquet(path=f"s3://{s3_bucket}/clientes/{tenant_id}/bronze/{base_name}.parquet")
        except Exception:
            return wr.s3.read_parquet(path=f"s3://{s3_bucket}/clientes/{tenant_id}/bronze/{base_name}_.parquet")

    try:
        df_perdas = safe_read("bronze_5_perdas")
    except Exception as e:''',
'''    try:
        p_perdas = find_parquet(s3_bucket, tenant_id, "perdas")
        if not p_perdas: raise Exception("Perdas file not found")
        df_perdas = wr.s3.read_parquet(path=p_perdas)
    except Exception as e:'''
)

with open('backend/api_logic.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replaced successfully")
