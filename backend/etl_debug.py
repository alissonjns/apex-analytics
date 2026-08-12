import pandas as pd

def inspect_data(file_path):
    print(f"Lendo: {file_path}")
    xl = pd.ExcelFile(file_path)
    sheets_of_interest = ['2 - FOLHA DE PAGAMENTO', '4 - Meios de Pagamentos', '6 - CMV', '7 - Receitas ']
    
    for sheet in sheets_of_interest:
        if sheet in xl.sheet_names:
            df = pd.read_excel(file_path, sheet_name=sheet)
            print(f"\n--- {sheet} ---")
            print(df.head(10))

if __name__ == "__main__":
    import sys
    inspect_data(sys.argv[1])
