import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from api.auth import get_current_user_id
from api.db import (
    get_user_by_id,
    save_driver_card,
    get_driver_active_card,
    get_driver_cards,
    delete_driver_card,
    get_commission_logs,
    get_weekly_commission_total,
)
from api.services.payment import save_card, luhn_check, COMMISSION_PCT

router = APIRouter()


class AddCardIn(BaseModel):
    card_number: str
    expire:      str   # "MM/YY"
    holder_name: str = ""


@router.post("/add-card", summary="Карта қосу (жүргізуші)")
async def add_card(data: AddCardIn, uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")

    clean = data.card_number.replace(" ", "").replace("-", "")
    if len(clean) < 13 or not clean.isdigit():
        raise HTTPException(400, "Карта нөмірі дұрыс емес (13–19 цифр)")
    if not luhn_check(clean):
        raise HTTPException(400, "Карта нөмірін тексеріңіз (Luhn қатесі)")

    parts = data.expire.replace("-", "/").split("/")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        raise HTTPException(400, "Мерзімді MM/YY форматында жазыңыз")
    month, year = int(parts[0]), int(parts[1])
    if not (1 <= month <= 12):
        raise HTTPException(400, "Ай 01–12 аралығында болуы керек")

    result = await save_card(clean, data.expire, data.holder_name, str(uid))
    if not result["ok"]:
        raise HTTPException(400, result.get("message", "Картаны тіркеу мүмкін болмады"))

    card_id = save_driver_card(
        driver_id   = uid,
        token       = result["token"],
        last4       = result["last4"],
        card_type   = result["card_type"],
        expiry      = data.expire,
        holder_name = data.holder_name,
    )

    msg = "✅ Карта сәтті тіркелді (тест режим)" if result.get("test") else "✅ Карта тіркелді"
    return {
        "ok":       True,
        "card_id":  card_id,
        "last4":    result["last4"],
        "card_type":result["card_type"],
        "message":  msg,
    }


@router.get("/my-cards", summary="Менің карталарым")
async def my_cards(uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")
    cards = get_driver_cards(uid)
    return cards


@router.delete("/card/{card_id}", summary="Картаны жою")
async def remove_card(card_id: int, uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")
    if not delete_driver_card(card_id, uid):
        raise HTTPException(404, "Карта табылмады")
    return {"ok": True, "message": "Карта жойылды"}


@router.get("/commission-logs", summary="Комиссия тарихы")
async def commission_history(uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")
    logs = get_commission_logs(uid)
    weekly = get_weekly_commission_total(uid)
    card = get_driver_active_card(uid)
    return {
        "commission_pct":    int(COMMISSION_PCT * 100),
        "weekly_commission": round(weekly, 2),
        "has_card":          card is not None,
        "card_last4":        card["card_last4"] if card else None,
        "card_type":         card["card_type"]  if card else None,
        "logs":              logs,
    }
