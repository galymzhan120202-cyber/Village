import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from api.auth import get_current_user_id
from api.db import (
    get_user_by_id, get_driver_accepted_orders,
    update_driver_location, get_online_drivers,
    get_driver_active_card, get_weekly_commission_total,
    save_push_token, get_user_push_token,
)
from database import (
    update_driver_work,
    get_weekly_stats,
    get_driver_avg_rating,
    get_driver_reviews,
)
from api.services.payment import COMMISSION_PCT

router = APIRouter()


class StartWorkIn(BaseModel):
    seats: int
    accepts_delivery: bool = True
    routes: list = ["local", "village_city", "city_village", "village_village"]


class PushTokenIn(BaseModel):
    token: str


@router.get("/profile", summary="Жүргізуші профилі")
async def driver_profile(uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")

    rating = get_driver_avg_rating(uid)
    count, income, debt = get_weekly_stats(uid)

    return {
        "user_id":          uid,
        "name":             user["name"],
        "phone":            user["phone"],
        "car_info":         user["car_info"],
        "rating":           rating,
        "is_online":        bool(user["is_online"]),
        "current_seats":    user["current_seats"],
        "working_routes":   user["working_routes"] or "",
        "debt":             user["admin_debt"],
        "is_banned":        bool(user["is_banned"]),
        "weekly_completed": count,
        "weekly_income":    income,
    }


@router.post("/start-work", summary="Жұмысқа шығу")
async def start_work(data: StartWorkIn, uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")

    if data.seats < 1 or data.seats > 6:
        raise HTTPException(400, "Орын саны: 1–6")

    valid_routes = {"local", "village_city", "city_village", "village_village"}
    chosen_routes = [r for r in data.routes if r in valid_routes]
    if not chosen_routes:
        chosen_routes = ["local"]

    update_driver_work(
        uid,
        1,
        ",".join(chosen_routes),
        data.seats,
        "all",
        1 if data.accepts_delivery else 0,
    )
    return {"message": "✅ Жұмысқа шықтыңыз!"}


@router.post("/stop-work", summary="Жұмысты тоқтату")
async def stop_work(uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")

    update_driver_work(uid, 0, "", 0, "", 1)
    return {"message": "🛑 Жұмыс тоқтатылды"}


@router.get("/passengers", summary="Менің жолаушыларым")
async def my_passengers(uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")

    return get_driver_accepted_orders(uid)


@router.get("/earnings", summary="Табыс және қарыз")
async def earnings(uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")

    count, income, _ = get_weekly_stats(uid)
    card = get_driver_active_card(uid)
    weekly_commission = get_weekly_commission_total(uid)
    return {
        "weekly_completed":   count,
        "weekly_income":      income,
        "weekly_commission":  round(weekly_commission, 2),
        "commission_pct":     int(COMMISSION_PCT * 100),
        "has_card":           card is not None,
        "card_last4":         card["card_last4"] if card else None,
        "card_type":          card["card_type"]  if card else None,
    }


@router.post("/location", summary="GPS координатты жаңарту")
async def update_location(
    lat: float, lon: float, uid: int = Depends(get_current_user_id)
):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")
    update_driver_location(uid, lat, lon)
    return {"ok": True}


@router.post("/push-token", summary="Push токенін сақтау")
async def store_push_token(data: PushTokenIn, uid: int = Depends(get_current_user_id)):
    save_push_token(uid, data.token)
    return {"ok": True}


@router.get("/online", summary="Онлайн жүргізушілер (карта үшін)")
async def online_drivers():
    return get_online_drivers()


@router.get("/reviews", summary="Пікірлер")
async def reviews(uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")

    revs = get_driver_reviews(uid)
    return [{"rating": r[0], "text": r[1], "date": r[2][:16]} for r in revs]
