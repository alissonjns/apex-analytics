"""
Simulacao end-to-end: ETL (header=None) -> Salva parquet local -> api_logic le de volta
Mostra exatamente o que o Lambda vai retornar para o frontend.
"""
import pandas as pd
import unicodedata
import os
import tempfile

file_path = 'base de hoje.xlsx'
xl = pd.ExcelFile(file_path)

# ===== ETAPA 1: ETL (simula o que o Lambda faz ao receber o upload) =====
print("=" * 60)
print("ETAPA 1: ETL - Salvando abas como parquet local")
print("=" * 60)

tmp_dir = tempfile.mkdtemp()
parquet_files = {}

sheets_of_interest = ['banco de dados', 'folha de pagamento', 'rescisoes', 'meios de pagamentos', 'perdas', 'cmv', 'receitas']

for sheet in xl.sheet_names:
    sheet_clean = sheet.lower().strip()
    matched = any(s in sheet_clean for s in sheets_of_interest)
    if matched:
        df = pd.read_excel(file_path, sheet_name=sheet, header=None)  # NOVO: header=None
        df = df.astype(str)
        df.columns = [str(c) for c in df.columns]  # Colunas viram "0", "1", "2"...
        table_name = "bronze_" + sheet.replace(" - ", "_").replace(" ", "_").lower()
        table_name = ''.join(e for e in table_name if e.isalnum() or e == '_')
        path = os.path.join(tmp_dir, f"{table_name}.parquet")
        df.to_parquet(path, index=False)
        parquet_files[table_name] = path
        print(f"  Salvo: {table_name} | Shape: {df.shape}")

# ===== ETAPA 2: api_logic - Le os parquets e processa =====
def clean_val(x):
    try:
        if pd.isna(x): return None
    except: pass
    if x == '' or str(x).lower().strip() in ('nan', 'none'): return None
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
                    data = [clean_val(row[i]) for i in range(c + 1, min(c + 13, len(row)))]
                    while len(data) < 12: data.append(None)
                    return data
    return [None] * 12

def find_parquet_local(keyword):
    """Simula find_parquet mas usa os arquivos locais"""
    matches = [k for k in parquet_files if keyword.lower() in k.lower()]
    if not matches: return None
    matches.sort(key=lambda f: len(f))
    return parquet_files[matches[0]]

def get_year_anchors(matrix, max_col=2):
    anchors = []
    for r, row in enumerate(matrix):
        for c, cell in enumerate(row):
            if str(cell).replace('.0','') in ['2022','2023','2024','2025','2026']:
                if c <= max_col:
                    anchors.append({'year': str(cell).replace('.0',''), 'row': r, 'col': c})
    return anchors

print()
print("=" * 60)
print("ETAPA 2: SIMULANDO get_dashboard_data (Visão Geral)")
print("=" * 60)

p = find_parquet_local("receitas")
df = pd.read_parquet(p)
matrix = df.values.tolist()
anchors = get_year_anchors(matrix)
print(f"Anos encontrados: {[a['year'] for a in anchors]}")

years_result = {}
for i, anchor in enumerate(anchors):
    year = anchor['year']
    r0 = anchor['row']
    r1 = anchors[i+1]['row'] if i < len(anchors)-1 else len(matrix)

    vendas = extract_row(matrix, 'vendas', r0, r1)
    ro = extract_row(matrix, 'ro', r0, r1)
    if all(v is None for v in ro):
        ro = extract_row(matrix, 'rlo', r0, r1)
    fluxo = extract_row(matrix, 'fluxo', r0, r1)

    s = lambda arr: sum(v for v in arr if v is not None)
    print(f"  [{year}] Vendas={s(vendas):,.0f} | RO={s(ro):,.0f} | Fluxo={s(fluxo):,.0f} | {'OK' if s(vendas)>0 else 'ZERADO ❌'}")
    years_result[year] = {'vendas': vendas, 'ro': ro}

print()
print("=" * 60)
print("ETAPA 2: SIMULANDO get_receitas_data (Aba Receitas)")
print("=" * 60)

# Usa 'meios' agora (CORRIGIDO)
p_pag = find_parquet_local("meios")
print(f"Arquivo de meios de pagamento encontrado: {os.path.basename(p_pag) if p_pag else 'NENHUM ❌'}")
if p_pag:
    df_pag = pd.read_parquet(p_pag)
    pag_matrix = df_pag.values.tolist()
    anchors = get_year_anchors(pag_matrix)
    print(f"Anos encontrados: {[a['year'] for a in anchors]}")
    for i, anchor in enumerate(anchors):
        year = anchor['year']
        r0, r1 = anchor['row'], anchors[i+1]['row'] if i < len(anchors)-1 else len(pag_matrix)
        dinheiro = extract_row(pag_matrix, 'dinheiro', r0, r1)
        pix = extract_row(pag_matrix, 'pix', r0, r1)
        s = lambda arr: sum(v for v in arr if v is not None)
        print(f"  [{year}] Dinheiro={s(dinheiro):,.0f} | PIX={s(pix):,.0f} | {'OK' if s(dinheiro)>0 else 'ZERADO ❌'}")

print()
print("=" * 60)
print("ETAPA 2: SIMULANDO get_rh_data")
print("=" * 60)

p_folha = find_parquet_local("folha")
p_resc = find_parquet_local("rescis")
print(f"Folha encontrado: {os.path.basename(p_folha) if p_folha else 'NENHUM ❌'}")
print(f"Rescisoes encontrado: {os.path.basename(p_resc) if p_resc else 'NENHUM ❌'}")

if p_folha:
    df_folha = pd.read_parquet(p_folha)
    folha_matrix = df_folha.values.tolist()
    print(f"  Linha 0 (cabeçalho esperado com anos): {[str(x)[:12] for x in folha_matrix[0][:8]]}")
    # Procura anos em linha 0
    anos_linha = folha_matrix[0]
    anos = []
    col_map = {}
    for i, cell in enumerate(anos_linha):
        if str(cell).replace('.0','') in ['2022','2023','2024','2025','2026']:
            ano = str(cell).replace('.0','')
            anos.append(ano)
            col_map[ano] = i
    print(f"  Anos encontrados no cabeçalho: {anos}")
    if anos:
        for ano in anos:
            col_idx = col_map[ano]
            vals = [clean_val(folha_matrix[m][col_idx]) for m in range(1, 13) if m < len(folha_matrix)]
            total = sum(v for v in vals if v is not None)
            print(f"  [{ano}] Total folha: {total:,.0f} | {'OK' if total > 0 else 'ZERADO ❌'}")
    else:
        print("  ❌ PROBLEMA: Nenhum ano encontrado no cabeçalho da folha!")
        print("  Isso significa que o ETL antigo (header=0) perdeu a linha do ano.")
        print("  Com o novo ETL (header=None), linha 0 deve ter os anos.")

print()
print("=" * 60)
print("ETAPA 2: SIMULANDO get_perdas_data")
print("=" * 60)

p_perdas = find_parquet_local("perdas")
print(f"Perdas encontrado: {os.path.basename(p_perdas) if p_perdas else 'NENHUM ❌'}")
if p_perdas:
    df_p = pd.read_parquet(p_perdas)
    p_matrix = df_p.values.tolist()
    anchors = get_year_anchors(p_matrix)
    print(f"Anos encontrados: {[a['year'] for a in anchors]}")
    for i, anchor in enumerate(anchors):
        year = anchor['year']
        r0, r1 = anchor['row'], anchors[i+1]['row'] if i < len(anchors)-1 else len(p_matrix)
        conf = extract_row(p_matrix, 'confeitaria', r0, r1)
        total = extract_row(p_matrix, 'total', r0, r1)
        s = lambda arr: sum(v for v in arr if v is not None)
        print(f"  [{year}] Confeitaria={s(conf):,.0f} | Total perdas={s(total):,.0f} | {'OK' if s(total)>0 else 'ZERADO (pode ser 2026 sem dados)'}")
