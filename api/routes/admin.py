import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from api.auth import get_current_user_id
from api.db import (
    get_all_users_admin, get_platform_stats, get_connection,
    get_user_by_id, get_user_by_phone,
)
from database import ban_user_temp, decrease_driver_debt

ADMIN_SETUP_SECRET = os.getenv("ADMIN_SETUP_SECRET", "taxi-admin-2025")

router = APIRouter()


def require_admin(uid: int = Depends(get_current_user_id)) -> int:
    user = get_user_by_id(uid)
    if not user or not user.get("is_admin"):
        raise HTTPException(403, "Тек админдерге рұқсат")
    return uid


class BanIn(BaseModel):
    reason: Optional[str] = "Админ шешімі"
    hours: Optional[int] = 720


class SetAdminIn(BaseModel):
    phone: str
    secret: str


@router.post("/setup", summary="Алғашқы админ орнату", include_in_schema=False)
async def setup_admin(data: SetAdminIn):
    """
    Телефон нөмірі арқылы пайдаланушыны администратор ету.
    ADMIN_SETUP_SECRET env айнымалысымен қорғалған.
    """
    if not ADMIN_SETUP_SECRET or data.secret != ADMIN_SETUP_SECRET:
        raise HTTPException(403, "Құпия кілт қате")
    user = get_user_by_phone(data.phone)
    if not user:
        raise HTTPException(
            404, "Пайдаланушы табылмады. Алдымен мобилді қосымшада тіркеліңіз."
        )
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE users SET is_admin=1 WHERE user_id=?", (user["user_id"],))
    conn.commit()
    conn.close()
    return {"message": f"✅ {user['name']} ({data.phone}) енді администратор"}


@router.get("/stats", summary="Платформа статистикасы")
async def stats(uid: int = Depends(require_admin)):
    return get_platform_stats()


@router.get("/users", summary="Барлық пайдаланушылар")
async def all_users(uid: int = Depends(require_admin)):
    return get_all_users_admin()


@router.post("/ban/{user_id}", summary="Пайдаланушыны блоктау")
async def ban_user(user_id: int, data: BanIn, uid: int = Depends(require_admin)):
    ban_user_temp(user_id, data.hours, data.reason or "Админ шешімі")
    return {"message": f"✅ {user_id} блокталды ({data.hours} сағатқа)"}


@router.post("/unban/{user_id}", summary="Блоктан шығару")
async def unban_user(user_id: int, uid: int = Depends(require_admin)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE users SET is_banned=0, ban_reason=NULL, ban_until=NULL WHERE user_id=?", (user_id,))
    conn.commit()
    conn.close()
    return {"message": f"✅ {user_id} блоктан шығарылды"}


@router.post("/clear-debt/{user_id}", summary="Қарызды жою")
async def clear_debt(user_id: int, uid: int = Depends(require_admin)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT admin_debt FROM users WHERE user_id=?", (user_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Пайдаланушы табылмады")
    amount = row["admin_debt"] or 0
    c.execute("UPDATE users SET admin_debt=0, is_banned=0 WHERE user_id=?", (user_id,))
    conn.commit()
    conn.close()
    return {"message": f"✅ {int(amount)} тг қарыз жойылды"}


@router.get("/orders", summary="Соңғы 20 заказ")
async def recent_orders(uid: int = Depends(require_admin)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT o.id, o.status, o.order_type, o.price, o.created_at,
               COALESCE(u.name,'—') AS passenger_name
        FROM orders o
        LEFT JOIN users u ON o.passenger_id = u.user_id
        ORDER BY o.created_at DESC LIMIT 20
    """)
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/set-admin/{user_id}", summary="Пайдаланушыны админ ету")
async def set_admin(user_id: int, uid: int = Depends(require_admin)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE users SET is_admin=1 WHERE user_id=?", (user_id,))
    if c.rowcount == 0:
        conn.close()
        raise HTTPException(404, "Пайдаланушы табылмады")
    conn.commit()
    conn.close()
    return {"message": f"✅ {user_id} енді администратор"}


@router.post("/remove-admin/{user_id}", summary="Админ құқығын алу")
async def remove_admin(user_id: int, uid: int = Depends(require_admin)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE users SET is_admin=0 WHERE user_id=?", (user_id,))
    conn.commit()
    conn.close()
    return {"message": f"✅ {user_id} админ құқығынан айырылды"}
