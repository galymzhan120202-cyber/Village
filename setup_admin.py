"""
Администратор орнату скрипті
Іске қосу: python setup_admin.py

Мобилді қосымшада тіркелген пайдаланушыны
администратор ретінде белгілейді.
"""
import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "taxi_bot.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def set_admin_by_phone(phone: str):
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT user_id, name, phone FROM users WHERE phone=?", (phone,))
    user = c.fetchone()

    if not user:
        digits = "".join(filter(str.isdigit, phone))
        c.execute("SELECT user_id, name, phone FROM users WHERE user_id=?", (int(digits) if digits else -1,))
        user = c.fetchone()

    if not user:
        print(f"❌ Пайдаланушы табылмады: {phone}")
        print("   Алдымен мобилді қосымшада тіркеліңіз!")
        conn.close()
        return

    c.execute("UPDATE users SET is_admin=1 WHERE user_id=?", (user["user_id"],))
    conn.commit()
    conn.close()
    print(f"✅ {user['name']} ({user['phone']}) енді администратор!")


def list_admins():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT user_id, name, phone FROM users WHERE is_admin=1")
    admins = c.fetchall()
    conn.close()
    if not admins:
        print("Әзірге администраторлар жоқ.")
    else:
        print("=== АДМИНИСТРАТОРЛАР ===")
        for a in admins:
            print(f"  👤 {a['name']} | 📞 {a['phone']} | ID: {a['user_id']}")


if __name__ == "__main__":
    print("=== ТАКСИ ЖАҢАБАЗАР — ADMIN ОРНАТУ ===\n")
    print("1 — Жаңа администратор орнату")
    print("2 — Қазіргі администраторларды көру")
    choice = input("\nТаңдаңыз (1/2): ").strip()

    if choice == "1":
        phone = input("Телефон нөмірі (мысалы +77001234567): ").strip()
        set_admin_by_phone(phone)
    elif choice == "2":
        list_admins()
    else:
        print("Қате таңдау.")
