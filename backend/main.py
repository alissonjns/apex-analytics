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

@app.get("/api/dashboard_data")
def get_dashboard():
    try:
        from api_logic import get_dashboard_data
        data = get_dashboard_data()
        return data
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@app.post("/upload")
async def upload_file(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        return {"error": "Por favor, envie um arquivo Excel (.xlsx)"}
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Executa o ETL de forma síncrona
    try:
        run_etl(file_path)
    except Exception as e:
        return {"error": f"Erro durante a extração: {str(e)}"}
    
    return {
        "message": "Arquivo processado e banco de dados atualizado com sucesso.",
        "filename": file.filename
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
