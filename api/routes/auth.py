from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from api.auth import hash_pin, verify_pin, create_access_token, get_current_user_id
from api.db import get_user_by_phone, get_user_by_id, create_mobile_user, update_user_pin, update_user_profile

router = APIRouter()


class RegisterRequest(BaseModel):
    name: str
    phone: str
    role: str          # "passenger" | "driver"
    pin: str           # 4 сан
    car_info: Optional[str] = None


class LoginRequest(BaseModel):
    phone: str
    pin: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    role: str
    name: str


@router.post("/register", response_model=TokenResponse, summary="Тіркелу")
async def register(data: RegisterRequest):
    if data.role not in ("passenger", "driver"):
        raise HTTPException(400, "Рөл: passenger немесе driver")

    if data.role == "driver" and not data.car_info:
        raise HTTPException(400, "Жүргізуші үшін көлік ақпараты қажет")

    if len(data.pin) != 4 or not data.pin.isdigit():
        raise HTTPException(400, "PIN-код — 4 сан (мысалы: 1234)")

    pin_hash = hash_pin(data.pin)
    existing = get_user_by_phone(data.phone)

    if existing:
        # Бар пайдаланушы — тек PIN жаңарту
        update_user_pin(existing["user_id"], pin_hash)
        user_id = existing["user_id"]
        role    = existing["role"]
        name    = existing["name"]
    else:
        user_id = create_mobile_user(
            name=data.name,
            phone=data.phone,
            role=data.role,
            pin_hash=pin_hash,
            car_info=data.car_info,
        )
        role = data.role
        name = data.name

    return TokenResponse(
        access_token=create_access_token(user_id),
        user_id=user_id,
        role=role,
        name=name,
    )


class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    car_info: Optional[str] = None
    old_pin: Optional[str] = None
    new_pin: Optional[str] = None


@router.get("/profile", summary="Профильді алу")
async def get_profile(uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(404, "Пайдаланушы табылмады")
    return {
        "user_id": uid,
        "name":     user["name"],
        "phone":    user["phone"],
        "role":     user["role"],
        "car_info": user.get("car_info", ""),
    }


@router.put("/profile", summary="Профильді жаңарту")
async def update_profile(data: UpdateProfileIn, uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(404, "Пайдаланушы табылмады")

    if data.old_pin and data.new_pin:
        if not verify_pin(data.old_pin, user["pin_code"]):
            raise HTTPException(401, "Ескі PIN-код қате")
        if len(data.new_pin) != 4 or not data.new_pin.isdigit():
            raise HTTPException(400, "Жаңа PIN-код — 4 сан")
        update_user_pin(uid, hash_pin(data.new_pin))

    update_user_profile(
        uid,
        name=data.name.strip() if data.name else None,
        car_info=data.car_info.strip() if data.car_info is not None else None,
    )
    return {"message": "✅ Профиль жаңартылды", "name": data.name or user["name"]}


@router.post("/login", response_model=TokenResponse, summary="Кіру")
async def login(data: LoginRequest):
    user = get_user_by_phone(data.phone)

    if not user:
        raise HTTPException(404, "Пайдаланушы табылмады")

    if not user.get("pin_code"):
        raise HTTPException(400, "PIN орнатылмаған. Мобилді қосымша арқылы тіркеліңіз.")

    if not verify_pin(data.pin, user["pin_code"]):
        raise HTTPException(401, "PIN-код қате")

    if user.get("is_banned"):
        raise HTTPException(403, f"Сіз блокталдыңыз: {user.get('ban_reason', 'Ереже бұзу')}")

    return TokenResponse(
        access_token=create_access_token(user["user_id"]),
        user_id=user["user_id"],
        role=user["role"],
        name=user["name"],
    )
