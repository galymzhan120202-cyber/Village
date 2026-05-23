import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from api.auth import get_current_user_id
from api.db import (
    get_user_by_id,
    get_passenger_active_orders,
    get_driver_accepted_orders,
    get_order_history_paged,
    get_driver_active_card,
    add_commission_log,
)
from database import (
    add_order,
    accept_order_in_db,
    finish_single_order,
    cancel_order_in_db,
    driver_drop_order_db,
    check_active_order,
    get_matching_orders,
    save_rating,
)
from api.db import get_messages, send_message, get_online_driver_push_tokens, get_user_push_token
from api.services.payment import charge_commission
from api.services.push import send_push_to_many, send_push

router = APIRouter()


class MessageIn(BaseModel):
    text: str


class RateIn(BaseModel):
    rating: int          # 1–5
    comment: Optional[str] = None


class CreateOrderIn(BaseModel):
    o_type: str          # "taxi" | "delivery"
    village: str
    route: str           # "village_city" | "city_village"
    land: str            # ауылдағы мекенжай
    to_loc: str          # қаладағы мекенжай
    price: int
    seats: int = 0
    comment: Optional[str] = None


# ─── ЖОЛАУШЫ ─────────────────────────────────────────────────────────────────

@router.post("/", summary="Тапсырыс беру (жолаушы)")
async def create_order(data: CreateOrderIn, uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "passenger":
        raise HTTPException(403, "Тек жолаушылар тапсырыс бере алады")

    if check_active_order(uid):
        raise HTTPException(400, "Сізде аяқталмаған тапсырыс бар")

    if data.o_type not in ("taxi", "delivery"):
        raise HTTPException(400, "o_type: taxi немесе delivery")

    if data.route not in ("village_city", "city_village", "local", "village_village"):
        raise HTTPException(400, "route: village_city, city_village, local, village_village")

    oid = add_order(
        pid=uid,
        otype=data.o_type,
        vil=data.village,
        rt=data.route,
        land=data.land,
        to=data.to_loc,
        pr=str(data.price),
        st=data.seats,
        cm=data.comment or "",
        sch=None,
    )

    tokens = get_online_driver_push_tokens()
    type_label = "📦 Сәлемдеме" if data.o_type == "delivery" else "🚖 Такси"
    await send_push_to_many(
        tokens,
        f"{type_label} · {data.price} тг",
        f"{data.village}, {data.land} → {data.to_loc}",
        {"order_id": oid},
    )

    return {"order_id": oid, "message": "✅ Тапсырыс жіберілді!"}


@router.get("/my", summary="Менің белсенді тапсырыстарым")
async def my_active_orders(uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(404, "Пайдаланушы табылмады")

    if user["role"] == "passenger":
        return get_passenger_active_orders(uid)
    return get_driver_accepted_orders(uid)


@router.get("/history", summary="Тапсырыс тарихы")
async def order_history(uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(404, "Пайдаланушы табылмады")
    return get_order_history_paged(uid, user["role"])


@router.post("/cancel", summary="Тапсырысты жою (жолаушы)")
async def cancel_my_order(uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "passenger":
        raise HTTPException(403, "Тек жолаушылар үшін")

    did, otype = cancel_order_in_db(uid)
    if did is None and otype is None:
        raise HTTPException(404, "Белсенді тапсырыс жоқ")

    return {"message": "✅ Тапсырыс жойылды"}


# ─── ЖҮРГІЗУШІ ───────────────────────────────────────────────────────────────

@router.get("/available", summary="Қолжетімді тапсырыстар (жүргізуші)")
async def available_orders(uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")

    if not user["is_online"]:
        raise HTTPException(400, "Алдымен жұмысқа шығыңыз")

    orders = get_matching_orders(
        user["working_routes"] or "",
        user["village"] or "",
        user["accepts_delivery"],
        user["current_seats"],
    )

    result = []
    for o in orders:
        route   = o[6]
        village = o[10]
        land    = o[0] or ""
        to_loc  = o[1] or ""

        if route == "local":
            from_addr = f"{village}, {land}"
            to_addr   = f"{village}, {to_loc}"
        elif route == "village_village":
            from_addr = f"{village}, {land}"
            to_addr   = to_loc
        elif route == "village_city":
            from_addr = f"{village}, {land}"
            to_addr   = f"Шымкент, {to_loc}"
        else:
            from_addr = f"Шымкент, {land}"
            to_addr   = f"{village}, {to_loc}"

        result.append({
            "id":         o[3],
            "order_type": o[8],
            "route":      route,
            "from":       from_addr,
            "to":         to_addr,
            "price":      o[2],
            "seats":      o[7],
            "comment":    o[9],
            "village":    village,
        })

    return result


@router.post("/{order_id}/accept", summary="Тапсырыс қабылдау (жүргізуші)")
async def accept_order(order_id: int, uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер қабылдай алады")

    pid, status, price = accept_order_in_db(order_id, uid)

    if status == "debt_limit":
        raise HTTPException(400, "Қарызыңыз 4000 тг-дан асты! Төлем жасаңыз.")
    if status == "no_seats":
        raise HTTPException(400, "Бос орын жоқ")
    if status == "taken":
        raise HTTPException(409, "Тапсырысты басқа жүргізуші алды")
    if status == "ok":
        token = get_user_push_token(pid)
        if token:
            driver_name = get_user_by_id(uid)["name"] if get_user_by_id(uid) else "Жүргізуші"
            await send_push(token, "🚖 Жүргізуші келе жатыр!", f"{driver_name} сіздің тапсырысыңызды қабылдады", {"order_id": order_id})
        return {"message": "✅ Тапсырыс қабылданды!", "price": price}

    raise HTTPException(500, "Белгісіз қате")


@router.post("/{order_id}/finish", summary="Тапсырыс аяқтау (жүргізуші)")
async def finish_order(order_id: int, uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер аяқтай алады")

    result = finish_single_order(order_id, uid, None)
    if not result or not result[0]:
        raise HTTPException(404, "Тапсырыс табылмады")

    price = result[2]

    # Автоматты 10% комиссия шешу
    card = get_driver_active_card(uid)
    commission_status = "no_card"
    commission_amount = round(price * 0.10, 2)
    commission_msg    = ""

    if card:
        charge_result = await charge_commission(card["token"], price, uid, order_id)
        commission_status = "ok" if charge_result["ok"] else "failed"
        commission_msg    = "" if charge_result["ok"] else charge_result.get("message", "")

    add_commission_log(uid, order_id, commission_amount, commission_status, commission_msg)

    return {
        "message":    "✅ Тапсырыс аяқталды!",
        "price":      price,
        "commission": commission_amount,
        "paid":       commission_status == "ok",
        "no_card":    commission_status == "no_card",
    }


@router.post("/{order_id}/rate", summary="Жүргізушіге баға беру")
async def rate_order(order_id: int, data: RateIn, uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "passenger":
        raise HTTPException(403, "Тек жолаушылар баға бере алады")
    if not 1 <= data.rating <= 5:
        raise HTTPException(400, "Баға 1–5 аралығында болуы керек")

    import sqlite3 as _sqlite3
    import os as _os
    _db_path = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))), "taxi_bot.db")
    conn = _sqlite3.connect(_db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT passenger_id, driver_id, status FROM orders WHERE id=?", (order_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(404, "Тапсырыс табылмады")
    if row[0] != uid:
        raise HTTPException(403, "Бұл сіздің тапсырысыңыз емес")
    if row[1] is None:
        raise HTTPException(400, "Жүргізуші жоқ")
    if row[2] != "finished":
        raise HTTPException(400, "Тапсырыс әлі аяқталмаған")

    save_rating(row[1], order_id, data.rating, data.comment or "")
    return {"ok": True}


@router.get("/{order_id}/messages", summary="Чат хабарламалары")
async def get_order_messages(order_id: int, uid: int = Depends(get_current_user_id)):
    return get_messages(order_id)


@router.post("/{order_id}/messages", summary="Хабарлама жіберу")
async def post_message(order_id: int, data: MessageIn, uid: int = Depends(get_current_user_id)):
    if not data.text.strip():
        raise HTTPException(400, "Хабарлама бос болмауы керек")
    msg_id = send_message(order_id, uid, data.text.strip())
    return {"id": msg_id, "ok": True}


@router.post("/{order_id}/drop", summary="Тапсырыстан бас тарту (жүргізуші)")
async def drop_order(order_id: int, uid: int = Depends(get_current_user_id)):
    user = get_user_by_id(uid)
    if not user or user["role"] != "driver":
        raise HTTPException(403, "Тек жүргізушілер үшін")

    pid, status = driver_drop_order_db(order_id, uid)
    if status == "already_arrived":
        raise HTTPException(400, "Сіз 'Келдім' деп белгіледіңіз — бас тарта алмайсыз")
    if pid:
        return {"message": "✅ Тапсырыстан бас тарттыңыз"}

    raise HTTPException(404, "Тапсырыс табылмады")
