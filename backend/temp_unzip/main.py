from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
from etl import run_etl

app = FastAPI(title="Apex Analytics - Backend API")

# Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/tmp/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

from mangum import Mangum
handler = Mangum(app)

@app.get("/")
def read_root():
    return {"message": "Apex Analytics Backend is running!"}

import base64
import json
from fastapi import Request, Depends

def get_tenant_id(request: Request):
    """Extrai o Tenant ID (cliente) baseado no grupo do JWT."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header:
        return "visitante"
    
    try:
        # Pega a parte do payload do JWT (Header.Payload.Signature)
        token = auth_header.split(" ")[1] if " " in auth_header else auth_header
        payload_b64 = token.split(".")[1]
        
        # Corrige o padding do Base64
        padded = payload_b64 + "=" * ((4 - len(payload_b64) % 4) % 4)
        payload = json.loads(base64.b64decode(padded).decode("utf-8"))
        
        # Verifica se pertence ao grupo de administradores da Padaria Araujo
        groups = payload.get("cognito:groups", [])
        if "Araujo-Admins" in groups:
            return "araujo"
            
        # Para usuários comuns/visitantes, cria um cofre isolado baseado no ID deles
        return payload.get("sub", "visitante")
    except Exception as e:
        print(f"Erro ao extrair token: {e}")
        return "visitante"

@app.get("/api/dashboard_data")
def get_dashboard(request: Request):
    try:
        tenant_id = get_tenant_id(request)
        from api_logic import get_dashboard_data
        data = get_dashboard_data(tenant_id)
        return data
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@app.get("/api/receitas_data")
def get_receitas(request: Request):
    try:
        tenant_id = get_tenant_id(request)
        from api_logic import get_receitas_data
        data = get_receitas_data(tenant_id)
        return data
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@app.get("/api/rh_data")
def get_rh(request: Request):
    try:
        tenant_id = get_tenant_id(request)
        from api_logic import get_rh_data
        data = get_rh_data(tenant_id)
        return data
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@app.get("/api/perdas_data")
def get_perdas(request: Request):
    try:
        tenant_id = get_tenant_id(request)
        from api_logic import get_perdas_data
        data = get_perdas_data(tenant_id)
        return data
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@app.post("/upload")
async def upload_file(request: Request, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    tenant_id = get_tenant_id(request)
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        return {"error": "Por favor, envie um arquivo Excel (.xlsx)"}
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Executa o ETL passando o tenant_id para salvar na pasta correta
    try:
        run_etl(file_path, tenant_id)
    except Exception as e:
        return {"error": f"Erro durante a extração: {str(e)}"}
    
    return {
        "message": "Arquivo processado e banco de dados atualizado com sucesso.",
        "filename": file.filename,
        "tenant_id": tenant_id
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
