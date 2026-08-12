import pandas as pd
import unicodedata
import json

file_path = 'base de hoje.xlsx'
xl = pd.ExcelFile(file_path)
print('ABAS ENCONTRADAS:', xl.sheet_names)

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

# ========================================================
# PROBLEMA CRITICO: O ETL usa pd.read_excel sem header=None
# Isso faz a PRIMEIRA LINHA de dados virar NOME DE COLUNA
# e ser perdida quando lemos de volta com .values.tolist()
# ========================================================
print("\n=== DIAGNOSTICO: RECEITAS ===")
for sheet in xl.sheet_names:
    if 'receita' in sheet.lower().strip():
        print(f"Aba: '{sheet}'")
        
        # Como ETL salva (BUGADO: header=0)
        df_etl = pd.read_excel(file_path, sheet_name=sheet)
        df_etl = df_etl.astype(str)
        print("  - Shape ETL (header=0, primeira linha vira cabecalho):", df_etl.shape)
        print("  - Cabecalhos gerados (primeiros 4):", list(df_etl.columns)[:4])
        print("  - Primeira linha de DADOS restante:", list(df_etl.iloc[0])[:4])
        
        # Como DEVERIA ser (header=None)
        df_correto = pd.read_excel(file_path, sheet_name=sheet, header=None)
        matrix = df_correto.values.tolist()
        print("  - Shape CORRETO (header=None):", df_correto.shape)
        
        # Verifica anos
        year_anchors = []
        for r, row in enumerate(matrix):
            for c, cell in enumerate(row):
                if str(cell).replace('.0','') in ['2022','2023','2024','2025','2026']:
                    if c <= 2:
                        year_anchors.append({'year': str(cell).replace('.0',''), 'row': r, 'col': c})
        print("  - Anos encontrados:", year_anchors)

        if year_anchors:
            print("\n  Linhas do primeiro bloco de ano:")
            r0 = year_anchors[0]['row']
            r1 = year_anchors[1]['row'] if len(year_anchors) > 1 else r0 + 20
            for row in matrix[r0:r0+15]:
                print("   ", [str(x)[:12] for x in row[:6]])
            
            print("\n  Testando extract_row('vendas'):", extract_row(matrix, 'vendas', r0, r1))
            print("  Testando extract_row('fluxo'):", extract_row(matrix, 'fluxo', r0, r1))

print("\n=== DIAGNOSTICO: MEIOS DE PAGAMENTO ===")
for sheet in xl.sheet_names:
    if 'pagamento' in sheet.lower().strip():
        print(f"Aba: '{sheet}'")
        df_etl = pd.read_excel(file_path, sheet_name=sheet)
        df_etl = df_etl.astype(str)
        print("  - Cabecalhos gerados:", list(df_etl.columns)[:4])
        
        df_correto = pd.read_excel(file_path, sheet_name=sheet, header=None)
        matrix = df_correto.values.tolist()
        year_anchors = []
        for r, row in enumerate(matrix):
            for c, cell in enumerate(row):
                if str(cell).replace('.0','') in ['2022','2023','2024','2025','2026']:
                    if c <= 2:
                        year_anchors.append({'year': str(cell).replace('.0',''), 'row': r, 'col': c})
        print("  - Anos encontrados:", year_anchors)
        
        if year_anchors:
            r0 = year_anchors[0]['row']
            r1 = year_anchors[1]['row'] if len(year_anchors) > 1 else r0 + 10
            print("  Linhas do primeiro bloco:")
            for row in matrix[r0:r0+10]:
                print("   ", [str(x)[:12] for x in row[:5]])
            print("  Testando extract_row('dinheiro'):", extract_row(matrix, 'dinheiro', r0, r1))
            print("  Testando extract_row('pix'):", extract_row(matrix, 'pix', r0, r1))

print("\n=== DIAGNOSTICO: PERDAS ===")
for sheet in xl.sheet_names:
    if 'perda' in sheet.lower().strip():
        print(f"Aba: '{sheet}'")
        df_correto = pd.read_excel(file_path, sheet_name=sheet, header=None)
        matrix = df_correto.values.tolist()
        year_anchors = []
        for r, row in enumerate(matrix):
            for c, cell in enumerate(row):
                if str(cell).replace('.0','') in ['2022','2023','2024','2025','2026']:
                    if c <= 2:
                        year_anchors.append({'year': str(cell).replace('.0',''), 'row': r, 'col': c})
        print("  - Anos encontrados:", year_anchors)
        if year_anchors:
            r0 = year_anchors[0]['row']
            r1 = year_anchors[1]['row'] if len(year_anchors) > 1 else r0 + 12
            for row in matrix[r0:r0+12]:
                print("   ", [str(x)[:12] for x in row[:5]])
            print("  Testando extract_row('confeitaria'):", extract_row(matrix, 'confeitaria', r0, r1))
            print("  Testando extract_row('vendas'):", extract_row(matrix, 'vendas', r0, r1))
