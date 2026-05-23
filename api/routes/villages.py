from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List
from api.auth import get_current_user_id
from api.db import get_all_villages, update_village_coords

ADMIN_IDS = [1114235682, 8000299659]

router = APIRouter()


class VillageOut(BaseModel):
    id: int
    name_kz: str
    name_ru: str
    lat: float
    lon: float


class UpdateCoordsIn(BaseModel):
    lat: float
    lon: float


@router.get("/", response_model=List[VillageOut], summary="Барлық ауылдар + координаталар")
async def list_villages():
    return get_all_villages()


@router.put("/{village_id}/coords", summary="Координата жаңарту (тек админ)")
async def set_village_coords(
    village_id: int,
    data: UpdateCoordsIn,
    uid: int = Depends(get_current_user_id),
):
    if uid not in ADMIN_IDS:
        raise HTTPException(403, "Тек админдерге рұқсат")
    update_village_coords(village_id, data.lat, data.lon)
    return {"ok": True, "message": "Координаталар жаңартылды"}
