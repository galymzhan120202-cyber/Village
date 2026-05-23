"""Expo Push Notifications — жүргізушілерге хабарлама жіберу"""
import httpx

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push(token: str, title: str, body: str, data: dict = None) -> bool:
    if not token or not token.startswith("ExponentPushToken"):
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                EXPO_PUSH_URL,
                json={
                    "to":    token,
                    "title": title,
                    "body":  body,
                    "data":  data or {},
                    "sound": "default",
                    "priority": "high",
                },
                headers={"Content-Type": "application/json"},
            )
        return resp.status_code == 200
    except Exception as e:
        print(f"Push error: {e}")
        return False


async def send_push_to_many(tokens: list, title: str, body: str, data: dict = None):
    valid = [t for t in tokens if t and t.startswith("ExponentPushToken")]
    if not valid:
        return
    messages = [{"to": t, "title": title, "body": body, "data": data or {}, "sound": "default", "priority": "high"} for t in valid]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(EXPO_PUSH_URL, json=messages, headers={"Content-Type": "application/json"})
    except Exception as e:
        print(f"Push batch error: {e}")
