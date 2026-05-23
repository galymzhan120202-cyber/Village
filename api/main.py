from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import auth, orders, drivers, villages, admin, payments

app = FastAPI(
    title="Taxi Жаңабазар API",
    version="1.0.0",
    description="Такси Жаңабазар — мобилді қосымша үшін REST API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,     prefix="/api/auth",     tags=["🔑 Авторизация"])
app.include_router(villages.router, prefix="/api/villages", tags=["📍 Ауылдар"])
app.include_router(orders.router,   prefix="/api/orders",   tags=["📦 Тапсырыстар"])
app.include_router(drivers.router,  prefix="/api/drivers",  tags=["🚗 Жүргізушілер"])
app.include_router(admin.router,    prefix="/api/admin",    tags=["⚙️ Админ"])
app.include_router(payments.router, prefix="/api/payments", tags=["💳 Төлемдер"])


@app.get("/", tags=["System"])
async def root():
    return {"status": "ok", "message": "Taxi Жаңабазар API жұмыс істеп тұр ✅"}
