"""
Backend API серверін іске қосу:
    python run_api.py
"""
import uvicorn
from api.db import init_api_tables

if __name__ == "__main__":
    init_api_tables()
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,     # Код өзгерсе авто-рестарт
    )
