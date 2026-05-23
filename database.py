import sqlite3
import os
from datetime import datetime, timedelta

DB_NAME = 'taxi_bot.db'
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, DB_NAME)

def get_connection():
    return sqlite3.connect(DB_PATH, timeout=30)

def init_db():
    conn = get_connection()
    
    conn.execute("PRAGMA journal_mode=WAL;") 
    conn.execute("PRAGMA synchronous=NORMAL;")
    
    cursor = conn.cursor()
    
    # Users кестесі
    cursor.execute('''CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        name TEXT,
        phone TEXT,
        role TEXT,
        car_info TEXT DEFAULT NULL,
        approval_status TEXT DEFAULT 'approved',
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
    )''')
    
    # Orders кестесі
    cursor.execute('''CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        passenger_id INTEGER,
        order_type TEXT, 
        village TEXT, 
        route TEXT, 
        lat REAL, 
        lon REAL, 
        landmark TEXT, 
        to_loc TEXT, 
        price INTEGER, 
        seats INTEGER DEFAULT 0, 
        comment TEXT, 
        scheduled_time TEXT DEFAULT NULL, 
        driver_id INTEGER DEFAULT NULL, 
        status TEXT DEFAULT 'active', 
        rating INTEGER DEFAULT 0,
        review_text TEXT DEFAULT NULL,
        passengers_data TEXT DEFAULT NULL,
        is_arrived INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')

    # Offers (Сауда/Аукцион) кестесі
    cursor.execute('''CREATE TABLE IF NOT EXISTS offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        driver_id INTEGER,
        price INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    # Миграциялар (Ескі базада қате шықпауы үшін)
    try: cursor.execute("ALTER TABLE orders ADD COLUMN is_arrived INTEGER DEFAULT 0")
    except: pass
    try: cursor.execute("ALTER TABLE users ADD COLUMN last_trust_use TIMESTAMP DEFAULT NULL")
    except: pass
    try: cursor.execute("ALTER TABLE users ADD COLUMN trust_attempts INTEGER DEFAULT 0")
    except: pass
    try: cursor.execute("ALTER TABLE users ADD COLUMN pin_code TEXT DEFAULT NULL")
    except: pass
    try: cursor.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")
    except: pass

    conn.commit(); conn.close()
    print(f"✅ База тексерілді: {DB_PATH}")

def get_user_data(user_id):

    conn = get_connection(); cursor = conn.cursor()
    
    # Бан уақытын тексеру
    cursor.execute("SELECT is_banned, ban_until FROM users WHERE user_id = ?", (user_id,))
    res = cursor.fetchone()
    if res and res[0] == 1 and res[1]:
        try:
            if datetime.now() > datetime.strptime(res[1], "%Y-%m-%d %H:%M:%S.%f"):
                cursor.execute("UPDATE users SET is_banned = 0, ban_until = NULL, ban_reason = NULL WHERE user_id = ?", (user_id,))
                conn.commit()
        except: pass
        
    cursor.execute("SELECT name, phone, role, is_online, village, working_routes, admin_debt, is_banned, current_seats, accepts_delivery, ban_until, car_info, approval_status, ban_reason FROM users WHERE user_id = ?", (user_id,))
    final_res = cursor.fetchone(); conn.close()
    return final_res



def register_user(user_id, role, name, phone, car_info=None):
    conn = get_connection()
    cursor = conn.cursor()
    
    # ӨЗГЕРІС ОСЫ ЖЕРДЕ:
    # Бұрын: status = 'approved' if role == 'passenger' else 'pending'
    # Қазір: Барлығын бірден қабылдаймыз ('approved')
    status = 'approved'
    
    cursor.execute('''INSERT OR REPLACE INTO users (user_id, role, name, phone, current_seats, accepts_delivery, car_info, approval_status) VALUES (?, ?, ?, ?, 0, 1, ?, ?)''', (user_id, role, name, phone, car_info, status))
    conn.commit()
    conn.close()

def approve_driver(user_id):
    conn = get_connection(); cursor = conn.cursor()
    cursor.execute("UPDATE users SET approval_status = 'approved' WHERE user_id = ?", (user_id,))
    conn.commit(); conn.close()

def delete_user(user_id):
    conn = get_connection(); cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
    conn.commit(); conn.close()

# --- РЕЙТИНГ ЖӘНЕ СПАМНАН ҚОРҒАНУ ---
def save_rating(driver_id, order_id, rating, comment=""):
    conn = get_connection(); cursor = conn.cursor()
    
    cursor.execute("SELECT passenger_id FROM orders WHERE id=?", (order_id,))
    res = cursor.fetchone()
    if not res: conn.close(); return False, 5.0
    pid = res[0]

    # Апталық шектеу
    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        SELECT id FROM orders 
        WHERE driver_id=? AND passenger_id=? AND rating > 0 AND created_at >= ? AND id != ?
    """, (driver_id, pid, week_ago, order_id))
    
    if cursor.fetchone():
        conn.close(); return False, get_driver_avg_rating(driver_id)

    cursor.execute("UPDATE orders SET rating = ?, review_text = ? WHERE id = ?", (rating, comment, order_id))
    
    cursor.execute("SELECT rating FROM orders WHERE driver_id = ? AND rating > 0 ORDER BY id DESC LIMIT 20", (driver_id,))
    ratings = [r[0] for r in cursor.fetchall()]
    ban_triggered = False; avg = 5.0
    if len(ratings) >= 5:
        avg = sum(ratings) / len(ratings)
        if avg < 3.0:
            unlock = datetime.now() + timedelta(hours=6)
            cursor.execute("UPDATE users SET is_banned = 1, ban_until = ?, ban_reason = 'Рейтинг < 3.0' WHERE user_id = ?", (unlock, driver_id))
            ban_triggered = True
    conn.commit(); conn.close()
    return ban_triggered, avg

def get_driver_reviews(driver_id):
    conn = get_connection(); cursor = conn.cursor()
    cursor.execute("SELECT rating, review_text, created_at FROM orders WHERE driver_id = ? AND rating > 0 AND review_text IS NOT NULL AND review_text != '' ORDER BY id DESC LIMIT 5", (driver_id,))
    res = cursor.fetchall(); conn.close(); return res

def get_driver_avg_rating(driver_id):
    conn = get_connection(); cursor = conn.cursor()
    cursor.execute("SELECT AVG(rating) FROM orders WHERE driver_id = ? AND rating > 0", (driver_id,))
    res = cursor.fetchone()
    conn.close()
    return round(res[0], 1) if res and res[0] else 5.0

def get_weekly_stats(driver_id):
    conn = get_connection(); cursor = conn.cursor()
    today = datetime.now(); start = today - timedelta(days=today.weekday())
    start_str = start.strftime("%Y-%m-%d 00:00:00")
    cursor.execute("SELECT COUNT(*), SUM(price) FROM orders WHERE driver_id = ? AND status = 'finished' AND created_at >= ?", (driver_id, start_str))
    res = cursor.fetchone()
    count = res[0] if res[0] else 0; income = res[1] if res[1] else 0
    cursor.execute("SELECT admin_debt FROM users WHERE user_id = ?", (driver_id,))
    d_res = cursor.fetchone(); debt = d_res[0] if d_res else 0.0
    conn.close(); return count, income, debt

def decrease_driver_debt(user_id, amount):
    conn = get_connection(); cursor = conn.cursor()
    cursor.execute("SELECT admin_debt FROM users WHERE user_id = ?", (user_id,))
    res = cursor.fetchone(); cur = res[0] if res else 0
    new_d = max(0, cur - amount)
    
    # ТӨЛЕМ ЖАСАЛҒАНДА ЛИМИТТІ 0-ГЕ ТҮСІРУ ЖӘНЕ БЛОКТАН ШЫҒАРУ
    cursor.execute("UPDATE users SET admin_debt = ?, trust_attempts = 0 WHERE user_id = ?", (new_d, user_id))
    
    if new_d < 4000: 
        cursor.execute("UPDATE users SET is_banned = 0, ban_until = NULL WHERE user_id = ?", (user_id,))
        
    conn.commit(); conn.close(); return new_d

def activate_trust_mode(user_id):
    """
    Жүргізушіні 1 сағатқа қарызға қарамастан блоктан шығарады.
    Шектеу: Максимум 3 рет (қарыз төленгенше). 24 сағат сайын.
    """
    conn = get_connection(); cursor = conn.cursor()
    
    cursor.execute("SELECT last_trust_use, admin_debt, trust_attempts FROM users WHERE user_id = ?", (user_id,))
    res = cursor.fetchone()
    if not res: conn.close(); return "not_found"
    
    last_use, debt, attempts = res
    if not attempts: attempts = 0
    
    if debt < 4000: conn.close(); return "no_debt"

    # 1. ЛИМИТ ТЕКСЕРУ (3 рет)
    if attempts >= 3:
        conn.close()
        return "limit_reached"

    # 2. Уақытты тексеру (24 сағат)
    if last_use:
        try:
            last_time = datetime.strptime(last_use, "%Y-%m-%d %H:%M:%S.%f")
            if datetime.now() - last_time < timedelta(hours=24):
                conn.close()
                return "cooldown"
        except: pass # Егер формат қате болса, жалғастырамыз
            
    # 3. Блоктан шығару және САНАУЫШТЫ ARTTЫРУ
    unl = datetime.now() + timedelta(hours=1)
    cursor.execute("""
        UPDATE users 
        SET is_banned = 0, ban_until = ?, last_trust_use = ?, trust_attempts = trust_attempts + 1 
        WHERE user_id = ?
    """, (unl, datetime.now(), user_id))
    
    conn.commit(); conn.close()
    return "ok"

def get_debtors():
    conn = get_connection(); cursor = conn.cursor()
    cursor.execute("SELECT user_id, name, phone, admin_debt FROM users WHERE admin_debt > 0 ORDER BY admin_debt DESC")
    res = cursor.fetchall(); conn.close(); return res

def ban_user_temp(user_id, hours=6, reason=""):
    conn = get_connection(); cursor = conn.cursor()
    unl = datetime.now() + timedelta(hours=hours)
    cursor.execute("UPDATE users SET is_banned=1, ban_until=?, ban_reason=? WHERE user_id=?", (unl, reason, user_id))
    conn.commit(); conn.close(); return unl

def update_driver_work(user_id, status, routes="", seats=0, villages="", acc_delivery=1):
    conn = get_connection(); cursor = conn.cursor()
    cursor.execute("UPDATE users SET is_online = ?, working_routes = ?, current_seats = ?, village = ?, accepts_delivery = ? WHERE user_id = ?", (status, routes, seats, villages, acc_delivery, user_id))
    conn.commit(); conn.close()

def check_active_order(pid):
    conn = get_connection(); cursor = conn.cursor()
    cursor.execute("SELECT id, driver_id, status FROM orders WHERE passenger_id = ? AND status IN ('active', 'accepted')", (pid,))
    res = cursor.fetchone(); conn.close(); return res is not None

# database.py ішінен get_matching_orders функциясын тауып, мынаған ауыстырыңыз:

def get_matching_orders(routes_str, villages_str, delivery, seats):
    if not routes_str: return []

    conn = get_connection(); cursor = conn.cursor()
    routes = routes_str.split(',')
    all_villages = not villages_str or villages_str.strip() == 'all'
    villages = [] if all_villages else villages_str.split(',')

    conds = []
    
    # --- ӨЗГЕРГЕН ЖЕР: Сәлемдеме логикасы ---
    # Егер жүргізушіде орын бар болса
    if seats > 0:
        # Егер delivery=1 (жүргізуші сәлемдеме алатын болса), 'delivery' типін де іздейміз
        # Немесе 'taxi' типін (орын саны сиятын болса) іздейміз
        delivery_logic = "order_type = 'delivery'" if delivery == 1 else "0"
        taxi_logic = f"(order_type = 'taxi' AND seats <= {seats})"
        
        conds.append(f"({delivery_logic} OR {taxi_logic})")
    else:
        # Егер орын жоқ болса (0), бірақ сәлемдеме алатын болса -> Тек сәлемдеме көрсетеміз
        if delivery == 1:
            conds.append("order_type = 'delivery'")
        else:
            conn.close(); return []
    # ----------------------------------------
    
    rc = []
    if 'city_village'    in routes: rc.append("route = 'city_village'")
    if 'village_city'    in routes: rc.append("route = 'village_city'")
    if 'local'           in routes: rc.append("route = 'local'")
    if 'village_village' in routes: rc.append("route = 'village_village'")
    if not rc: conn.close(); return []
    conds.append("(" + " OR ".join(rc) + ")")
    
    if villages and not all_villages:
        placeholders = ','.join('?' * len(villages))
        conds.append(f"village IN ({placeholders})")

    conds.append("scheduled_time IS NULL")
    
    # Уақыт шектеуі (Такси 45 мин, Сәлемдеме 3 сағат)
    time_limit_query = """
        (
            (order_type = 'taxi' AND created_at >= datetime('now', '-45 minutes'))
            OR 
            (order_type = 'delivery' AND created_at >= datetime('now', '-3 hours'))
        )
    """
    conds.append(time_limit_query)

    q = f"""SELECT o.landmark, o.to_loc, o.price, o.id, o.lat, o.lon, o.route, o.seats, o.order_type, o.comment, o.village, o.scheduled_time, u.name
            FROM orders o LEFT JOIN users u ON o.passenger_id = u.user_id
            WHERE o.status='active' AND {' AND '.join(conds)}"""

    # Параметрлер: villages тізімі (SQL injection-ға қарсы)
    params = villages if (villages and not all_villages) else []
    try: cursor.execute(q, params); res = cursor.fetchall()
    except Exception as e: print(f"Error filtering orders: {e}"); res = []
        
    conn.close(); return res

# database.py ішінен get_notify_drivers функциясын тауып, мынаған ауыстырыңыз:

def get_notify_drivers(o_type, village, route, seats):
    conn = get_connection(); cursor = conn.cursor()
    # Тек жұмыстағы (online) және блокталмаған жүргізушілерді аламыз
    cursor.execute("SELECT user_id, working_routes, village, current_seats, accepts_delivery FROM users WHERE role='driver' AND is_online=1 AND is_banned=0")
    drivers = cursor.fetchall(); conn.close(); target = []
    
    for d in drivers:
        uid, dr, dv, ds, dd = d
        drl = dr.split(',') if dr else []
        
        # Маршрут сәйкес келмесе -> өткіземіз
        if route not in drl: continue
        
        # --- ӨЗГЕРГЕН ЖЕР ---
        if o_type == 'delivery':
            # Егер заказ сәлемдеме болса, жүргізушінің accepts_delivery (dd) параметрі 1 болуы керек
            if dd != 1: continue
        else:
            # Егер такси болса, орын саны жетуі керек
            if ds < seats: continue
        # --------------------
            
        target.append(uid)
    return target

def add_order(pid, otype, vil, rt, land, to, pr, st, cm, sch=None):
    # lat пен lon аргументтерін алып тастадық, бірақ базаға 0 деп жазамыз

    conn = get_connection()
    cursor = conn.cursor()
    try: cp = int(''.join(filter(str.isdigit, str(pr))))
    except: cp = 0
    if st is None: st = 0
    
    # lat, lon орнына 0.0 береміз (SQL сұранысында 5-ші және 6-шы сұрақ белгісі)
    cursor.execute("INSERT INTO orders (passenger_id, order_type, village, route, lat, lon, landmark, to_loc, price, seats, comment, scheduled_time) VALUES (?,?,?,?,0.0,0.0,?,?,?,?,?,?)", 
                   (pid, otype, vil, rt, land, to, cp, st, cm, sch))
    
    oid = cursor.lastrowid
    conn.commit(); conn.close()
    return oid

# --- САУДА ---
def add_driver_offer(order_id, driver_id, price):
    conn = get_connection(); cursor = conn.cursor()
    
    # 1. ҚАРЫЗ БЕН БЛОКТЫ ТЕКСЕРУ
    cursor.execute("SELECT admin_debt, ban_until, current_seats FROM users WHERE user_id = ?", (driver_id,))
    res = cursor.fetchone()
    debt = res[0] if res else 0.0
    ban_until = res[1]
    current_seats = res[2] if res and res[2] is not None else 0

    is_trust_active = False
    if ban_until:
        try:
            if datetime.strptime(ban_until, "%Y-%m-%d %H:%M:%S.%f") > datetime.now():
                is_trust_active = True
        except: pass

    # --- ТҮЗЕТУ: ОРЫН САНЫН ТЕКСЕРУ ---
    # Тапсырысқа қанша орын керек екенін білу
    cursor.execute("SELECT seats FROM orders WHERE id = ?", (order_id,))
    o_res = cursor.fetchone()
    required_seats = o_res[0] if o_res else 0
    
    # Егер жүргізушіде орын тапсырысқа жетпесе -> Қате қайтарамыз
    if current_seats < required_seats:
        conn.close(); return "no_seats"
    # ----------------------------------

    cursor.execute("SELECT id FROM offers WHERE order_id=? AND driver_id=?", (order_id, driver_id))
    ex = cursor.fetchone()
    if ex: cursor.execute("UPDATE offers SET price=?, created_at=CURRENT_TIMESTAMP WHERE id=?", (price, ex[0]))
    else: cursor.execute("INSERT INTO offers (order_id, driver_id, price) VALUES (?, ?, ?)", (order_id, driver_id, price))
    conn.commit(); conn.close(); return "ok"

def get_order_offers(order_id):
    conn = get_connection(); cursor = conn.cursor()
    query = """
        SELECT o.id, o.driver_id, o.price, u.name, u.car_info, u.phone 
        FROM offers o JOIN users u ON o.driver_id = u.user_id
        WHERE o.order_id = ? ORDER BY o.price ASC
    """
    cursor.execute(query, (order_id,))
    res = cursor.fetchall(); conn.close(); return res

def accept_offer_db(offer_id):
    conn = get_connection(); cursor = conn.cursor()
    
    cursor.execute("SELECT order_id, driver_id, price FROM offers WHERE id=?", (offer_id,))
    offer = cursor.fetchone()
    if not offer: conn.close(); return None, None, 0, []
    oid, did, price = offer
    
    cursor.execute("SELECT passenger_id, seats FROM orders WHERE id=? AND status='active'", (oid,))
    order_data = cursor.fetchone()
    if not order_data: conn.close(); return None, None, 0, []
    pid, seats = order_data
    
    # ОРЫН АЗАЙТУ
    cursor.execute("UPDATE users SET current_seats = current_seats - ? WHERE user_id = ? AND current_seats >= ?", (seats, did, seats))
    if cursor.rowcount == 0: conn.close(); return None, "no_seats", 0, []

    # ҰТЫЛҒАНДАР
    cursor.execute("SELECT driver_id FROM offers WHERE order_id=? AND id != ?", (oid, offer_id))
    rejected_rows = cursor.fetchall()
    rejected_drivers = [row[0] for row in rejected_rows]

    cursor.execute("UPDATE orders SET driver_id=?, status='accepted', price=? WHERE id=?", (did, price, oid))
    cursor.execute("DELETE FROM offers WHERE order_id=?", (oid,))
    
    conn.commit(); conn.close()
    return pid, did, price, rejected_drivers

def accept_order_in_db(oid, did):
    conn = get_connection(); cursor = conn.cursor()
    
    # 1. ҚАРЫЗ БЕН СЕНІМДІ ТӨЛЕМДІ ТЕКСЕРУ
    cursor.execute("SELECT admin_debt, ban_until FROM users WHERE user_id = ?", (did,))
    res = cursor.fetchone()
    debt = res[0] if res else 0.0
    ban_until = res[1]

    is_trust_active = False
    if ban_until:
        try:
            if datetime.strptime(ban_until, "%Y-%m-%d %H:%M:%S.%f") > datetime.now():
                is_trust_active = True
        except: pass

    # Тапсырысты іздеу
    cursor.execute("SELECT passenger_id, seats, status, order_type, price FROM orders WHERE id = ? AND status = 'active'", (oid,))
    order = cursor.fetchone()
    if not order: conn.close(); return None, "taken", 0
    pid, ps, _, otype, pr = order
    
    if otype == 'taxi':
        cursor.execute("SELECT current_seats FROM users WHERE user_id = ?", (did,))
        dr = cursor.fetchone()
        ds = dr[0] if dr else 0
        if ds < ps: conn.close(); return None, "no_seats", 0
        cursor.execute("UPDATE users SET current_seats = ? WHERE user_id = ?", (ds - ps, did))
    
    cursor.execute("UPDATE orders SET driver_id = ?, status = 'accepted' WHERE id = ? AND status = 'active'", (did, oid))
    if cursor.rowcount == 0: conn.close(); return None, "taken", 0

    conn.commit(); conn.close(); return pid, "ok", pr

# database.py -> cancel_order_in_db

def cancel_order_in_db(pid):
    conn = get_connection(); cursor = conn.cursor()
    
    # Тапсырыс статусын да қоса аламыз (status)
    cursor.execute("SELECT id, driver_id, seats, order_type, price, status FROM orders WHERE passenger_id = ? AND status IN ('active', 'accepted')", (pid,))
    order = cursor.fetchone()
    
    if not order: conn.close(); return None, None
    oid, did, seats, otype, price, status = order
    
    # ТҮЗЕТУ: Орынды тек статус 'accepted' болғанда ғана қайтарамыз
    if did and otype == 'taxi' and status == 'accepted':
        cursor.execute("UPDATE users SET current_seats = current_seats + ? WHERE user_id = ?", (seats, did))
        
    # Тапсырысты өшіру
    cursor.execute("DELETE FROM orders WHERE id = ?", (oid,))
    cursor.execute("DELETE FROM offers WHERE order_id = ?", (oid,)) 
    
    conn.commit(); conn.close()
    return did, otype

def set_order_arrived(oid):
    conn = get_connection(); cursor = conn.cursor()
    cursor.execute("UPDATE orders SET is_arrived = 1 WHERE id = ?", (oid,))
    conn.commit(); conn.close()

def driver_drop_order_db(oid, did):
    conn = get_connection(); cursor = conn.cursor()
    cursor.execute("SELECT passenger_id, seats, order_type, status, price, is_arrived FROM orders WHERE id = ?", (oid,))
    order = cursor.fetchone()
    
    if not order or order[3] != 'accepted': conn.close(); return None, "not_found"
    pid, seats, otype, _, price, is_arrived = order
    
    # МЫНА ЖОЛДЫ ӨШІРДІК: if is_arrived == 1: ...
    
    if otype == 'taxi':
        cursor.execute("UPDATE users SET current_seats = current_seats + ? WHERE user_id = ?", (seats, did))

    # is_arrived=0 деп қайтадан тазалап қоямыз
    cursor.execute("UPDATE orders SET driver_id = NULL, status = 'active', is_arrived=0 WHERE id = ?", (oid,))
    conn.commit(); conn.close(); return pid, "ok"

# database.py -> get_my_passengers

def get_my_passengers(did):
    conn = get_connection(); cursor = conn.cursor()
    
    # ТҮЗЕТУ: "JOIN" орнына "LEFT JOIN" қолданамыз.
    # Себебі: Егер жолаушы базадан өшіп қалса да, жүргізушіде заказ көрінуі керек.
    query = """
        SELECT o.landmark, o.to_loc, o.seats, o.price, 
               COALESCE(u.name, 'Белгісіз'), 
               COALESCE(u.phone, '...'), 
               o.passenger_id, o.lat, o.lon, o.order_type, o.comment, o.id, o.scheduled_time 
        FROM orders o 
        LEFT JOIN users u ON o.passenger_id = u.user_id 
        WHERE o.driver_id = ? AND o.status = 'accepted'
    """
    
    cursor.execute(query, (did,))
    res = cursor.fetchall(); conn.close(); return res

def finish_single_order(oid, did, pid=None):
    conn = get_connection(); cursor = conn.cursor()
    cursor.execute("SELECT passenger_id, price, seats, order_type, passengers_data FROM orders WHERE id = ? AND driver_id = ? AND status = 'accepted'", (oid, did))
    order = cursor.fetchone()
    if not order: conn.close(); return None, 0, 0
    main_pid, pr, st, otype, passengers_data = order
    
    if pid is None: pid = main_pid
    cursor.execute("UPDATE orders SET status = 'finished' WHERE id = ?", (oid,))
    if otype == 'taxi':
        cursor.execute("UPDATE users SET current_seats = current_seats + ? WHERE user_id = ?", (st, did))
    conn.commit(); conn.close(); return pid, 0, pr

def get_order_history(uid, role):
    conn = get_connection(); cursor = conn.cursor()
    col = "passenger_id" if role == 'passenger' else "driver_id"
    cursor.execute(f"SELECT village, to_loc, price, status, created_at FROM orders WHERE {col} = ? ORDER BY id DESC LIMIT 5", (uid,))
    res = cursor.fetchall(); conn.close(); return res

    # database.py соңына қосыңыз:
# database.py файлының ең соңына қойыңыз (ескісінің орнына)

def check_car_is_busy(new_car_text, current_uid):
    """
    Жаңа көлік нөмірінің базада бар-жоғын SQL арқылы жылдам тексереді.
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    # Жаңа нөмірді тазалаймыз
    clean_new = new_car_text.replace(" ", "").replace("-", "").lower()
    
    # SQL сұраныс: Тек қана ұқсас нөмірлері бар драйверлерді іздейміз
    # Бұл жүздеген драйверді перебор жасаудан құтқарады
    query = """
        SELECT user_id, name, admin_debt, car_info 
        FROM users 
        WHERE role='driver' 
        AND user_id != ? 
        AND REPLACE(REPLACE(LOWER(car_info), ' ', ''), '-', '') LIKE ?
    """
    
    # % белгісі арқылы іздеу (ішінде бар ма?)
    search_pattern = f"%{clean_new}%"
    
    cursor.execute(query, (current_uid, search_pattern))
    res = cursor.fetchone()
    conn.close()

    if res:
        # Егер табылса -> user_id, name, debt, car_info
        return True, res[1], res[2]
    
    return False, None, 0.0