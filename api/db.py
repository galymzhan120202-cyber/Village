import sqlite3
import os
from typing import Optional, List, Dict, Any

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "taxi_bot.db")

# Барлық ауылдар + орыс атаулары
VILLAGES_DEFAULT = [
    ("Жаңабазар",    "Жанабазар",    0.0, 0.0),
    ("Бейнеткеш",    "Бейнеткеш",    0.0, 0.0),
    ("Көкібел",      "Кокибел",      0.0, 0.0),
    ("Шарапхана",    "Шарапхана",    0.0, 0.0),
    ("Үшбұлақ",      "Ушбулак",      0.0, 0.0),
    ("Жұмысшы",      "Жумысшы",      0.0, 0.0),
    ("Жеңіс",        "Женис",        0.0, 0.0),
    ("Бағыс",        "Багыс",        0.0, 0.0),
    ("Тілектес",     "Тілектес",     0.0, 0.0),
    ("Қарабастау",   "Карабастау",   0.0, 0.0),
    ("Сынтас",       "Сынтас",       0.0, 0.0),
    ("Жаңаталап",    "Жаңаталап",    0.0, 0.0),
    ("Қарабау",      "Карабау",      0.0, 0.0),
    ("Жылыбұлақ",    "Жылыбулак",    0.0, 0.0),
    ("Қожамберды",   "Кожамберды",   0.0, 0.0),
    ("Айнатас",      "Айнатас",      0.0, 0.0),
    ("Майбқұлақ",    "Майбкулак",    0.0, 0.0),
    ("Тесіктөбе",    "Тесиктобе",    0.0, 0.0),
    ("Қызылбұлақ",   "Кызылбулак",   0.0, 0.0),
]


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init_api_tables():
    """Мобилді API үшін қажет жаңа кестелер мен бағандарды қосу"""
    conn = get_connection()
    cursor = conn.cursor()

    # users кестесін жасау
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            name TEXT,
            phone TEXT,
            role TEXT,
            car_info TEXT DEFAULT NULL,
            approval_status TEXT DEFAULT "approved",
            is_online INTEGER DEFAULT 0,
            village TEXT,
            working_routes TEXT,
            current_seats INTEGER DEFAULT 0,
            accepts_delivery INTEGER DEFAULT 1,
            admin_debt REAL DEFAULT 0.0,
            is_banned INTEGER DEFAULT 0,
            ban_until TIMESTAMP DEFAULT NULL,
            ban_reason TEXT DEFAULT NULL,
            last_trust_use TIMESTAMP DEFAULT NULL,
            trust_attempts INTEGER DEFAULT 0,
            pin_code TEXT DEFAULT NULL,
            is_admin INTEGER DEFAULT 0
        )
    ''')

    # users кестесіне жаңа бағандар қосу (ескі база болса)
    for col_sql in [
        "ALTER TABLE users ADD COLUMN pin_code TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN driver_lat REAL DEFAULT 0.0",
        "ALTER TABLE users ADD COLUMN driver_lon REAL DEFAULT 0.0",
        "ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN push_token TEXT DEFAULT NULL",
    ]:
        try:
            cursor.execute(col_sql)
        except Exception:
            pass

    # Хабарламалар кестесі (чат)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id   INTEGER NOT NULL,
            sender_id  INTEGER NOT NULL,
            text       TEXT    NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Ауылдар кестесі
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS villages (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name_kz  TEXT NOT NULL UNIQUE,
            name_ru  TEXT NOT NULL,
            lat      REAL DEFAULT 0.0,
            lon      REAL DEFAULT 0.0
        )
    ''')

    # Бос болса — әдепкі ауылдарды енгізу
    cursor.execute("SELECT COUNT(*) FROM villages")
    if cursor.fetchone()[0] == 0:
        cursor.executemany(
            "INSERT OR IGNORE INTO villages (name_kz, name_ru, lat, lon) VALUES (?,?,?,?)",
            VILLAGES_DEFAULT,
        )

    # Жүргізуші карталары кестесі
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS driver_cards (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id    INTEGER NOT NULL,
            token        TEXT    NOT NULL,
            card_last4   TEXT    NOT NULL,
            card_type    TEXT    DEFAULT "Card",
            expiry       TEXT    DEFAULT "",
            holder_name  TEXT    DEFAULT "",
            is_active    INTEGER DEFAULT 1,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Комиссия журналы кестесі
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS commission_logs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id  INTEGER NOT NULL,
            order_id   INTEGER NOT NULL,
            amount     REAL    NOT NULL,
            status     TEXT    DEFAULT "pending",
            message    TEXT    DEFAULT "",
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()
    print(f"[OK] API tables ready: {DB_PATH}")


# ─── ПАЙДАЛАНУШЫ ────────────────────────────────────────────────────────────

def get_user_by_phone(phone: str) -> Optional[Dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE phone = ?", (phone,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id: int) -> Optional[Dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_mobile_user(
    name: str, phone: str, role: str, pin_hash: str, car_info: str = None
) -> int:
    """Телефон нөмірін user_id ретінде пайдаланып жаңа пайдаланушы жасау"""
    digits = "".join(filter(str.isdigit, phone))
    if not digits:
        raise ValueError("Телефон нөмірі дұрыс емес")
    user_id = int(digits)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT OR REPLACE INTO users
           (user_id, role, name, phone, current_seats, accepts_delivery,
            car_info, approval_status, pin_code)
           VALUES (?,?,?,?,0,1,?,'approved',?)""",
        (user_id, role, name, phone, car_info, pin_hash),
    )
    conn.commit()
    conn.close()
    return user_id


def update_driver_location(uid: int, lat: float, lon: float):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET driver_lat=?, driver_lon=? WHERE user_id=?",
        (lat, lon, uid),
    )
    conn.commit()
    conn.close()


def get_online_drivers() -> List[Dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT user_id, name, car_info, village,
               COALESCE(driver_lat, 0.0) AS lat,
               COALESCE(driver_lon, 0.0) AS lon,
               current_seats
        FROM users
        WHERE role='driver' AND is_online=1 AND is_banned=0
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_user_pin(user_id: int, pin_hash: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET pin_code=? WHERE user_id=?", (pin_hash, user_id))
    conn.commit()
    conn.close()


def get_messages(order_id: int) -> List[Dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT m.id, m.order_id, m.sender_id, m.text, m.created_at,
                  COALESCE(u.name,'') AS sender_name, COALESCE(u.role,'') AS sender_role
           FROM messages m
           LEFT JOIN users u ON m.sender_id = u.user_id
           WHERE m.order_id = ?
           ORDER BY m.created_at ASC""",
        (order_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def send_message(order_id: int, sender_id: int, text: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO messages (order_id, sender_id, text) VALUES (?,?,?)",
        (order_id, sender_id, text),
    )
    msg_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return msg_id


def update_user_profile(user_id: int, name: str = None, car_info: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    if name:
        cursor.execute("UPDATE users SET name=? WHERE user_id=?", (name, user_id))
    if car_info is not None:
        cursor.execute("UPDATE users SET car_info=? WHERE user_id=?", (car_info, user_id))
    conn.commit()
    conn.close()


# ─── АУЫЛДАР ─────────────────────────────────────────────────────────────────

def get_all_villages() -> List[Dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name_kz, name_ru, lat, lon FROM villages ORDER BY id")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_village_coords(village_id: int, lat: float, lon: float):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE villages SET lat=?, lon=? WHERE id=?", (lat, lon, village_id)
    )
    conn.commit()
    conn.close()


# ─── PUSH TOKENS ─────────────────────────────────────────────────────────────

def save_push_token(user_id: int, token: str):
    conn = get_connection()
    conn.execute("UPDATE users SET push_token=? WHERE user_id=?", (token, user_id))
    conn.commit(); conn.close()


def get_online_driver_push_tokens() -> List[str]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT push_token FROM users WHERE role='driver' AND is_online=1 AND is_banned=0 AND push_token IS NOT NULL"
    )
    rows = cursor.fetchall(); conn.close()
    return [r[0] for r in rows if r[0]]


def get_user_push_token(user_id: int) -> str:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT push_token FROM users WHERE user_id=?", (user_id,))
    row = cursor.fetchone(); conn.close()
    return row[0] if row and row[0] else ""


# ─── ТАПСЫРЫСТАР ─────────────────────────────────────────────────────────────

def get_passenger_active_orders(passenger_id: int) -> List[Dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT o.id, o.order_type, o.village, o.route, o.landmark, o.to_loc,
                  o.price, o.seats, o.comment, o.status, o.created_at,
                  COALESCE(d.name,'')     AS driver_name,
                  COALESCE(d.phone,'')    AS driver_phone,
                  COALESCE(d.car_info,'') AS driver_car,
                  (SELECT COUNT(*) FROM messages WHERE order_id = o.id) AS msg_count,
                  COALESCE(o.rating, 0)   AS rating
           FROM orders o
           LEFT JOIN users d ON o.driver_id = d.user_id
           WHERE o.passenger_id=? AND (
               o.status IN ('active','accepted')
               OR (o.status='finished' AND COALESCE(o.rating,0)=0
                   AND o.created_at >= datetime('now','-30 minutes'))
           )
           ORDER BY o.created_at DESC""",
        (passenger_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_driver_accepted_orders(driver_id: int) -> List[Dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT o.id, o.order_type, o.village, o.route, o.landmark, o.to_loc,
                  o.price, o.seats, o.comment, o.status, o.created_at, o.is_arrived,
                  COALESCE(u.name,'Белгісіз')  AS passenger_name,
                  COALESCE(u.phone,'—')        AS passenger_phone,
                  o.passenger_id,
                  (SELECT COUNT(*) FROM messages WHERE order_id = o.id) AS msg_count
           FROM orders o
           LEFT JOIN users u ON o.passenger_id = u.user_id
           WHERE o.driver_id=? AND o.status='accepted'""",
        (driver_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_order_history_paged(user_id: int, role: str, limit: int = 20) -> List[Dict]:
    conn = get_connection()
    cursor = conn.cursor()
    col = "passenger_id" if role == "passenger" else "driver_id"
    cursor.execute(
        f"""SELECT id, village, to_loc, route, price, status, order_type, created_at
            FROM orders WHERE {col}=? ORDER BY id DESC LIMIT ?""",
        (user_id, limit),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── АДМИН ───────────────────────────────────────────────────────────────────

def get_all_users_admin() -> List[Dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT user_id, name, phone, role, is_banned, admin_debt,
                  approval_status, is_online, car_info
           FROM users ORDER BY user_id DESC"""
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_platform_stats() -> Dict:
    conn = get_connection()
    c = conn.cursor()

    def one(sql):
        c.execute(sql)
        return c.fetchone()[0]

    stats = {
        "drivers":         one("SELECT COUNT(*) FROM users WHERE role='driver'"),
        "passengers":      one("SELECT COUNT(*) FROM users WHERE role='passenger'"),
        "online_drivers":  one("SELECT COUNT(*) FROM users WHERE role='driver' AND is_online=1"),
        "active_orders":   one("SELECT COUNT(*) FROM orders WHERE status='active'"),
        "accepted_orders": one("SELECT COUNT(*) FROM orders WHERE status='accepted'"),
        "finished_orders": one("SELECT COUNT(*) FROM orders WHERE status='finished'"),
        "total_commission":one("SELECT COALESCE(SUM(amount),0) FROM commission_logs WHERE status='ok'"),
    }
    conn.close()
    return stats


# ─── КАРТАЛАР ────────────────────────────────────────────────────────────────

def save_driver_card(driver_id: int, token: str, last4: str,
                     card_type: str, expiry: str, holder_name: str = "") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE driver_cards SET is_active=0 WHERE driver_id=?", (driver_id,))
    cursor.execute(
        """INSERT INTO driver_cards (driver_id, token, card_last4, card_type, expiry, holder_name, is_active)
           VALUES (?,?,?,?,?,?,1)""",
        (driver_id, token, last4, card_type, expiry, holder_name),
    )
    card_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return card_id


def get_driver_active_card(driver_id: int) -> Optional[Dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, token, card_last4, card_type, expiry, holder_name FROM driver_cards WHERE driver_id=? AND is_active=1",
        (driver_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_driver_cards(driver_id: int) -> List[Dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, card_last4, card_type, expiry, holder_name, is_active, created_at FROM driver_cards WHERE driver_id=? ORDER BY created_at DESC",
        (driver_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_driver_card(card_id: int, driver_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM driver_cards WHERE id=? AND driver_id=?", (card_id, driver_id))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0


def add_commission_log(driver_id: int, order_id: int, amount: float,
                       status: str, message: str = "") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO commission_logs (driver_id, order_id, amount, status, message) VALUES (?,?,?,?,?)",
        (driver_id, order_id, amount, status, message),
    )
    log_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return log_id


def get_commission_logs(driver_id: int, limit: int = 15) -> List[Dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT cl.id, cl.order_id, cl.amount, cl.status, cl.message, cl.created_at
           FROM commission_logs cl
           WHERE cl.driver_id=?
           ORDER BY cl.created_at DESC LIMIT ?""",
        (driver_id, limit),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_weekly_commission_total(driver_id: int) -> float:
    from datetime import datetime, timedelta
    conn = get_connection()
    cursor = conn.cursor()
    today = datetime.now()
    start = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d 00:00:00")
    cursor.execute(
        "SELECT COALESCE(SUM(amount),0) FROM commission_logs WHERE driver_id=? AND status='ok' AND created_at>=?",
        (driver_id, start),
    )
    total = cursor.fetchone()[0]
    conn.close()
    return float(total)
