"""
CloudPayments интеграциясы.
TEST_MODE: CP_PUBLIC_ID env айнымалысы болмаса автоматты қосылады.
Production: .env файлына CP_PUBLIC_ID және CP_API_SECRET жазыңыз.
"""
import httpx
import base64
import hashlib
import os

CP_PUBLIC_ID  = os.getenv("CP_PUBLIC_ID", "")
CP_API_SECRET = os.getenv("CP_API_SECRET", "")
TEST_MODE     = not CP_PUBLIC_ID or not CP_API_SECRET

COMMISSION_PCT = 0.10  # 10%


def _auth_header() -> dict:
    cred = base64.b64encode(f"{CP_PUBLIC_ID}:{CP_API_SECRET}".encode()).decode()
    return {"Authorization": f"Basic {cred}", "Content-Type": "application/json"}


def detect_card_type(card_number: str) -> str:
    n = card_number.replace(" ", "").replace("-", "")
    if n.startswith("4"):
        return "Visa"
    if n[:2] in ("51", "52", "53", "54", "55"):
        return "Mastercard"
    if len(n) >= 4 and 2221 <= int(n[:4]) <= 2720:
        return "Mastercard"
    if n[:4] in ("4000", "4149"):  # Kaspi Visa
        return "Kaspi"
    return "Card"


def luhn_check(card_number: str) -> bool:
    """Luhn алгоритмімен карта нөмірін тексеру"""
    digits = [int(d) for d in card_number.replace(" ", "").replace("-", "") if d.isdigit()]
    if len(digits) < 13:
        return False
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


async def save_card(
    card_number: str,
    expire: str,       # "MM/YY"
    holder: str,
    account_id: str,
) -> dict:
    """Картаны тіркеу және токен алу"""
    clean = card_number.replace(" ", "").replace("-", "")
    last4 = clean[-4:]
    card_type = detect_card_type(clean)

    if not luhn_check(clean):
        return {"ok": False, "message": "Карта нөмірі дұрыс емес"}

    if TEST_MODE:
        token = "tok_" + hashlib.sha256(f"{account_id}:{clean}".encode()).hexdigest()[:20]
        return {
            "ok":        True,
            "token":     token,
            "last4":     last4,
            "card_type": card_type,
            "expiry":    expire,
            "test":      True,
        }

    # CloudPayments: картаны тіркеу үшін клиент тарапта cryptogram керек.
    # Мобилде WebView немесе CloudPayments SDK пайдаланыңыз.
    # Бұл endpoint production-та CP SDK арқылы алынған cryptogram қабылдайды.
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.cloudpayments.ru/payments/cards/charge",
            headers=_auth_header(),
            json={
                "Amount":               1,
                "Currency":             "KZT",
                "AccountId":            str(account_id),
                "CardCryptogramPacket": card_number,  # CP SDK cryptogram
                "Description":          "Карта тіркеу (верификация)",
                "SaveCard":             True,
            },
        )
    data = resp.json()
    if data.get("Success") and data.get("Model"):
        m = data["Model"]
        return {
            "ok":        True,
            "token":     m.get("Token", ""),
            "last4":     m.get("CardLastFour", last4),
            "card_type": m.get("CardType", card_type),
            "expiry":    expire,
        }
    return {"ok": False, "message": data.get("Message", "Картаны тіркеу қатесі")}


async def charge_commission(token: str, order_price: int, driver_id: int, order_id: int) -> dict:
    """Тапсырыс аяқталғанда 10% комиссия шешу"""
    amount = round(order_price * COMMISSION_PCT, 2)
    description = f"Такси комиссиясы — тапсырыс #{order_id} ({COMMISSION_PCT*100:.0f}%)"

    if TEST_MODE or token.startswith("tok_"):
        return {
            "ok":     True,
            "amount": amount,
            "test":   True,
        }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.cloudpayments.ru/payments/tokens/charge",
            headers=_auth_header(),
            json={
                "Amount":      amount,
                "Currency":    "KZT",
                "AccountId":   str(driver_id),
                "Token":       token,
                "Description": description,
                "IpAddress":   "127.0.0.1",
            },
        )
    data = resp.json()
    if data.get("Success"):
        return {"ok": True, "amount": amount}
    return {"ok": False, "message": data.get("Message", "Шешу қатесі"), "amount": amount}
