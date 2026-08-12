import pandas as pd
import unicodedata

file_path = 'base de hoje.xlsx'
xl = pd.ExcelFile(file_path)

def clean_val(x):
    try:
        if pd.isna(x): return None
    except: pass
    if x == '' or str(x).lower().strip() in ('nan','none'): return None
    if isinstance(x, (int, float)): return x
    s = str(x).replace('R$', '').replace('.', '').replace(',', '.').strip()
    try: return float(s)
    except: return None

def normalize_str(s):
    if not isinstance(s, str): return ''
    s = unicodedata.normalize('NFD', str(s).lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return ''.join(c for c in s if c.isalnum())

def extract_row(matrix, keyword, start_row=0, end_row=None):
    clean_key = normalize_str(keyword)
    limit = end_row if end_row else len(matrix)
    for r in range(start_row, limit):
        row = matrix[r]
        for c, cell in enumerate(row):
            if isinstance(cell, str):
                clean_cell = normalize_str(cell)
                if ((clean_key in clean_cell and len(clean_key) > 3) or
                    (clean_cell == clean_key) or
                    ('antecipa' in clean_key and 'antecipa' in clean_cell) or
                    ('cart' in clean_key and 'cart' in clean_cell)):
                    data = []
                    for i in range(c + 1, min(c + 13, len(row))):
                        data.append(clean_val(row[i]))
                    while len(data) < 12:
                        data.append(None)
                    return data
    return [None] * 12

def get_year_anchors(matrix):
    anchors = []
    for r, row in enumerate(matrix):
        for c, cell in enumerate(row):
            if str(cell).replace('.0','') in ['2022','2023','2024','2025','2026']:
                if c <= 2:
                    anchors.append({'year': str(cell).replace('.0',''), 'row': r, 'col': c})
    return anchors

print("=" * 60)
print("SIMULACAO COMPLETA: API_LOGIC vs PLANILHA")
print("=" * 60)

# Simula nomes de arquivo que o ETL vai gerar
print("\nNOMES DE ARQUIVO GERADOS PELO ETL:")
for sheet in xl.sheet_names:
    table_name = "bronze_" + sheet.replace(" - ", "_").replace(" ", "_").lower()
    table_name = ''.join(e for e in table_name if e.isalnum() or e == '_')
    print(f"  '{sheet}' -> '{table_name}.parquet'")

print()
print("TESTE: find_parquet com keyword 'pagamento':")
table_names = []
for sheet in xl.sheet_names:
    table_name = "bronze_" + sheet.replace(" - ", "_").replace(" ", "_").lower()
    table_name = ''.join(e for e in table_name if e.isalnum() or e == '_') + ".parquet"
    table_names.append(table_name)

matches_pagamento = [f for f in table_names if 'pagamento' in f.lower()]
print(f"  Matches para 'pagamento': {matches_pagamento}")
matches_pagamento.sort(key=lambda f: len(f))
print(f"  ARQUIVO RETORNADO (mais curto): {matches_pagamento[0] if matches_pagamento else 'NONE'}")
print(f"  *** PROBLEMA? Deveria ser 'meios_de_pagamentos' mas retorna '{matches_pagamento[0] if matches_pagamento else '?'}' ***")

matches_meios = [f for f in table_names if 'meios' in f.lower()]
print(f"\n  Matches para 'meios': {matches_meios}")
print(f"  Arquivo correto seria: {matches_meios[0] if matches_meios else 'NONE'}")

print()
print("=" * 60)
print("SIMULANDO TODOS OS ANOS - RECEITAS (get_dashboard_data)")
print("=" * 60)

for sheet in xl.sheet_names:
    if 'receita' in sheet.lower().strip():
        df = pd.read_excel(file_path, sheet_name=sheet, header=None)
        matrix = df.values.tolist()
        anchors = get_year_anchors(matrix)
        print(f"Anos encontrados: {[a['year'] for a in anchors]}")
        
        for i, anchor in enumerate(anchors):
            year = anchor['year']
            r0 = anchor['row']
            r1 = anchors[i+1]['row'] if i < len(anchors)-1 else len(matrix)
            
            vendas = extract_row(matrix, 'vendas', r0, r1)
            ro = extract_row(matrix, 'ro', r0, r1)
            if all(v is None for v in ro):
                ro = extract_row(matrix, 'rlo', r0, r1)
            fluxo = extract_row(matrix, 'fluxo', r0, r1)
            
            vendas_sum = sum(v for v in vendas if v is not None)
            ro_sum = sum(v for v in ro if v is not None)
            fluxo_sum = sum(v for v in fluxo if v is not None)
            
            status_v = "OK" if vendas_sum > 0 else "ZERADO ❌"
            status_ro = "OK" if ro_sum != 0 else "ZERADO ❌"
            status_f = "OK" if fluxo_sum > 0 else "ZERADO ❌"
            
            print(f"\n  [{year}] linhas {r0}-{r1}")
            print(f"    vendas total: R${vendas_sum:,.2f} -> {status_v}")
            print(f"    ro total:     R${ro_sum:,.2f}    -> {status_ro}")
            print(f"    fluxo total:  {int(fluxo_sum)}      -> {status_f}")
            
            if vendas_sum == 0:
                print(f"    Primeiras linhas desse bloco:")
                for row in matrix[r0:r0+8]:
                    print(f"      {[str(x)[:10] for x in row[:5]]}")

print()
print("=" * 60)
print("SIMULANDO TODOS OS ANOS - MEIOS DE PAGAMENTO (get_receitas_data)")
print("=" * 60)

for sheet in xl.sheet_names:
    if 'meios de pagamentos' in sheet.lower().strip():
        df = pd.read_excel(file_path, sheet_name=sheet, header=None)
        matrix = df.values.tolist()
        anchors = get_year_anchors(matrix)
        print(f"Anos: {[a['year'] for a in anchors]}")
        
        for i, anchor in enumerate(anchors):
            year = anchor['year']
            r0 = anchor['row']
            r1 = anchors[i+1]['row'] if i < len(anchors)-1 else len(matrix)
            
            dinheiro = extract_row(matrix, 'dinheiro', r0, r1)
            pix = extract_row(matrix, 'pix', r0, r1)
            caderneta = extract_row(matrix, 'caderneta', r0, r1)
            
            din_sum = sum(v for v in dinheiro if v is not None)
            pix_sum = sum(v for v in pix if v is not None)
            cad_sum = sum(v for v in caderneta if v is not None)
            
            print(f"  [{year}] dinheiro={din_sum:,.0f}, pix={pix_sum:,.0f}, caderneta={cad_sum:,.0f}")

print()
print("=" * 60)
print("SIMULANDO RH (get_rh_data) - keywords: 'folha' e 'rescis'")
print("=" * 60)
matches_folha = [f for f in table_names if 'folha' in f.lower()]
matches_rescis = [f for f in table_names if 'rescis' in f.lower()]
print(f"  Matches 'folha': {matches_folha}")
print(f"  Matches 'rescis': {matches_rescis}")
