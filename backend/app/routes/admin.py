"""Administration : statistiques, gestion des comptes et des rôles, détail de la collecte.

Les admins voient les statistiques et la collecte ; seul le super admin gère les comptes.
Le profil de déplacement (donnée de santé) n'est jamais exposé ici.
"""
from bson import ObjectId
from bson.errors import InvalidId
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from ..core import security as sec
from ..deps import admin_dep, db_dep, role_of, superadmin_dep
from ..schemas import RoleUpdate
from .system import collect_report

router = APIRouter(prefix="/admin", tags=["administration"])
ANALYSIS = Path(__file__).resolve().parents[2] / "data" / "chaleur.json"


def _oid(user_id: str) -> ObjectId:
    try:
        return ObjectId(user_id)
    except (InvalidId, TypeError):
        raise HTTPException(404, "account_not_found")


def _row(u: dict) -> dict:
    return {"id": str(u["_id"]), "email": u["email"], "role": role_of(u), "language": u.get("language", "fr"),
            "created_at": u.get("created_at"), "has_profile": bool(u.get("profile_enc"))}


@router.get("/analysis", dependencies=[Depends(admin_dep)])
def analysis():
    """Analyse décideurs (écrans 09 à 11), produite par analyse/prepare.py : réservée aux admins et au super admin."""
    if not ANALYSIS.exists():
        raise HTTPException(404, "analysis_missing")
    return FileResponse(ANALYSIS, media_type="application/json", headers={"Cache-Control": "private, max-age=600"})


@router.get("/data-health", dependencies=[Depends(admin_dep)])
def data_health(db=Depends(db_dep)):
    """État de chaque source : à jour, complète, plausible (ok / warn / ko)."""
    from ..services import data_health as dh
    return dh.check(db)


@router.post("/gtfs-refresh", dependencies=[Depends(superadmin_dep)])
def gtfs_refresh():
    """Vérifie et, si besoin, met à jour les horaires IDFM tout de suite (normalement fait chaque nuit par le worker)."""
    from ..router import refresh
    return refresh.refresh()


@router.get("/insights/{topic}", dependencies=[Depends(admin_dep)])
def insights_topic(topic: str, db=Depends(db_dep)):
    """Synthèses décideurs : traffic (perturbations collectées), elevators (fiabilité), reports (signalements),
    pmr (assistance SNCF), bike (comptages vélo Paris)."""
    from ..services import insights
    fn = {"traffic": insights.traffic_history, "elevators": insights.elevator_reliability, "reports": insights.reports_stats,
          "pmr": insights.pmr_assistance, "bike": insights.bike_counts}.get(topic)
    if fn is None:
        raise HTTPException(404, "unknown_topic")
    try:
        return fn(db)
    except httpx.HTTPError:
        raise HTTPException(503, "source_unavailable")


@router.get("/stats")
def stats(_=Depends(admin_dep), db=Depends(db_dep)):
    users = list(db.users.find({}, {"email": 1, "role": 1, "profile_enc": 1}))
    roles: dict[str, int] = {}
    for u in users:
        roles[role_of(u)] = roles.get(role_of(u), 0) + 1
    return {"users": len(users), "with_profile": sum(bool(u.get("profile_enc")) for u in users), "roles": roles}


@router.get("/collect")
def collect_detail(days: int = 7, _=Depends(admin_dep), db=Depends(db_dep)):
    """Suivi de la collecte avec le détail des erreurs (réservé aux admins)."""
    return collect_report(db, days, with_errors=True)


@router.get("/users")
def list_users(q: str = "", skip: int = 0, limit: int = 50, _=Depends(superadmin_dep), db=Depends(db_dep)):
    import re
    flt = {"email": {"$regex": re.escape(q.lower()[:100])}} if q else {}
    limit = max(1, min(limit, 200))
    cur = db.users.find(flt).sort("created_at", -1).skip(max(0, skip)).limit(limit)
    return {"total": db.users.count_documents(flt), "items": [_row(u) for u in cur]}


@router.put("/users/{user_id}/role")
def set_role(user_id: str, body: RoleUpdate, me=Depends(superadmin_dep), db=Depends(db_dep)):
    if body.role not in sec.ROLES - {"superadmin"}:
        raise HTTPException(422, "unknown_role")  # le super admin se définit dans SUPERADMIN_EMAILS
    target = db.users.find_one({"_id": _oid(user_id)})
    if not target:
        raise HTTPException(404, "account_not_found")
    if role_of(target) == "superadmin":
        raise HTTPException(409, "superadmin_locked")
    db.users.update_one({"_id": target["_id"]}, {"$set": {"role": body.role}})
    return _row(db.users.find_one({"_id": target["_id"]}))


@router.delete("/users/{user_id}")
def delete_user(user_id: str, me=Depends(superadmin_dep), db=Depends(db_dep)):
    target = db.users.find_one({"_id": _oid(user_id)})
    if not target:
        raise HTTPException(404, "account_not_found")
    if role_of(target) == "superadmin":
        raise HTTPException(409, "superadmin_locked")
    db.users.delete_one({"_id": target["_id"]})
    return {"deleted": True}
