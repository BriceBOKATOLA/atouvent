"""Outils partagés par les collecteurs : journal des passages et détection des changements."""
from __future__ import annotations

import hashlib
import json
import logging
import time
import traceback
from datetime import datetime, timedelta, timezone
from typing import Callable, Iterable

log = logging.getLogger("atouvent.collect")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def state_hash(values: Iterable) -> str:
    return hashlib.sha1(json.dumps(list(values), default=str, sort_keys=True).encode()).hexdigest()[:16]


def select_changes(rows: list[dict], latest: dict[str, dict], key_field: str, state_fields: list[str],
                   now: datetime, heartbeat: timedelta) -> list[dict]:
    """Garde uniquement les lignes dont l'état a changé, plus un « battement » régulier.

    Le battement prouve que l'objet était bien suivi même s'il n'a pas changé :
    sans lui, on ne saurait pas distinguer « rien n'a changé » de « la collecte était en panne ».
    """
    out = []
    for r in rows:
        h = state_hash(r.get(f) for f in state_fields)
        prev = latest.get(r[key_field])
        if prev is None or prev["hash"] != h:
            out.append({**r, "_hash": h, "_reason": "changement" if prev else "premier relevé"})
        elif now - _aware(prev["written_at"]) >= heartbeat:
            out.append({**r, "_hash": h, "_reason": "battement"})
    return out


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


RETRY_WAITS_S = (3, 10)  # délais avant la 2e et la 3e tentative


def run_logged(db, source: str, fn: Callable[[], dict], waits: tuple[float, ...] = RETRY_WAITS_S) -> dict:
    """Exécute un collecteur et note le résultat dans collection_runs, même en cas d'erreur.

    Erreur réseau passagère (délai dépassé, connexion refusée) : jusqu'à 3 tentatives ; on n'enregistre une erreur
    que si toutes échouent (« attempts » garde le nombre d'essais, utile pour repérer une source qui fatigue)."""
    import httpx
    run = {"source": source, "started_at": utcnow(), "ok": False}
    for attempt in range(len(waits) + 1):
        try:
            stats = fn() or {}
            run.update(stats, ok=True, attempts=attempt + 1)
            run.pop("error", None)
            run.pop("trace", None)
            break
        except httpx.TransportError as exc:  # délai dépassé, connexion impossible : on réessaie
            run.update(error=f"{type(exc).__name__}: {exc}", trace=traceback.format_exc(limit=3), attempts=attempt + 1)
            if attempt < len(waits):
                time.sleep(waits[attempt])
        except Exception as exc:  # on n'arrête jamais le planificateur pour une erreur
            run.update(error=f"{type(exc).__name__}: {exc}", trace=traceback.format_exc(limit=3), attempts=attempt + 1)
            break
    if not run["ok"]:
        log.warning("Collecte %s en échec après %s essai(s) : %s", source, run["attempts"], run["error"])
    run["finished_at"] = utcnow()
    db.collection_runs.insert_one(dict(run))
    return run
