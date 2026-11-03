"""Outils partagés par les collecteurs : journal des passages et détection des changements."""
from __future__ import annotations

import hashlib
import json
import logging
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


def run_logged(db, source: str, fn: Callable[[], dict]) -> dict:
    """Exécute un collecteur et note le résultat dans collection_runs, même en cas d'erreur."""
    run = {"source": source, "started_at": utcnow(), "ok": False}
    try:
        stats = fn() or {}
        run.update(stats, ok=True)
    except Exception as exc:  # on n'arrête jamais le planificateur pour une erreur réseau
        run["error"] = f"{type(exc).__name__}: {exc}"
        run["trace"] = traceback.format_exc(limit=3)
        log.warning("Collecte %s en échec : %s", source, run["error"])
    run["finished_at"] = utcnow()
    db.collection_runs.insert_one(dict(run))
    return run
