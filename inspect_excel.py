import pandas as pd
import os

folder = r"c:\Users\aliss\OneDrive\Área de Trabalho\Projetos para ganhar dinheiro\Padaria Araujo"
files = [
    "base de hoje.xlsx",
    "2025 - Receita.xlsx",
    "Base para IA 2.xlsx",
    "Base para IA.xlsx",
    "receita_2025_sample.csv"
]

for file in files:
    path = os.path.join(folder, file)
    print(f"\n--- {file} ---")
    if file.endswith('.csv'):
        try:
            df = pd.read_csv(path)
            print("Columns:", df.columns.tolist())
            print("Shape:", df.shape)
        except Exception as e:
            print("Error:", e)
    else:
        try:
            xl = pd.ExcelFile(path)
            print("Sheets:", xl.sheet_names)
            for sheet in xl.sheet_names:
                df = pd.read_excel(path, sheet_name=sheet)
                print(f"Sheet '{sheet}' - Shape: {df.shape}")
                print(f"Cols: {df.columns.tolist()[:10]}")
        except Exception as e:
            print("Error:", e)
