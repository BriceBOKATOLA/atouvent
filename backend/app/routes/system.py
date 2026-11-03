"""Santé du service et suivi de la collecte (un trou de collecte = donnée inconnue, jamais zéro)."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from ..core.config import settings
from ..deps import db_dep

router = APIRouter(tags=["système"])

EXPECTED = {"velib_status": settings.velib_every_min, "elevators": settings.elevators_every_min}


@router.get("/health")
def health():
    return {"ok": True, "time": datetime.now(timezone.utc)}


def collect_report(db, days: int, with_errors: bool = False) -> dict:
    days = max(1, min(days, 90))
    since = datetime.now(timezone.utc) - timedelta(days=days)
    out = {}
    for source, every in EXPECTED.items():
        runs = list(db.collection_runs.find({"source": source, "started_at": {"$gte": since}},
                                            {"started_at": 1, "ok": 1, "error": 1}).sort("started_at", 1))
        ok = [r["started_at"] for r in runs if r.get("ok")]
        gaps = [{"from": a, "to": b, "minutes": round((b - a).total_seconds() / 60)}
                for a, b in zip(ok, ok[1:]) if (b - a) > timedelta(minutes=3 * every)]
        last_error = next((r.get("error") for r in reversed(runs) if not r.get("ok")), None)
        out[source] = {"runs": len(runs), "ok": len(ok), "failed": len(runs) - len(ok),
                       "last_ok": ok[-1] if ok else None, "gaps": gaps,
                       # Le détail technique de l'erreur est réservé aux admins (/admin/collect)
                       "last_error": last_error if with_errors else bool(last_error)}
    return out


@router.get("/collect/status")
def collect_status(days: int = Query(7, ge=1, le=90), db=Depends(db_dep)):
    return collect_report(db, days)
