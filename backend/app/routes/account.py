"""Compte : inscription, connexion, mot de passe, préférences et droits RGPD (export, suppression)."""
import secrets
from datetime import datetime, timezone

import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from ..core import security as sec
from ..core.ratelimit import limit
from ..deps import db_dep, role_of, user_dep
from ..schemas import ChangePassword, ForgotPassword, Login, Preferences, Register, ResetPassword, SavedPlace
from ..services import mailer

router = APIRouter(tags=["compte"])

MAX_PLACES = 10


def profile_defaults(profile: list[str]) -> dict:
    """Réglages activés d'office selon le profil (l'usager peut ensuite les changer) :
    malvoyant → voix, contraste renforcé, grand texte ; malentendant → vibration."""
    p = set(profile)
    out = {}
    if "malvoyant" in p:
        out.update(voice=True, high_contrast=True, text_size=3)
    if "malentendant" in p:
        out.update(vibrate=True)
    if "lecture_difficile" in p:
        out.update(text_size=3)
    return out
DEFAULT_ALERTS = ["chaleur", "grand_froid", "neige_verglas", "orages_pluie", "vent_fort", "ascenseur"]


def public(user: dict) -> dict:
    profile = sec.decrypt_profile(user.get("profile_enc"))
    return {"email": user["email"], "role": role_of(user), "language": user.get("language", "fr"),
            "alerts": user.get("alerts", []), "places": user.get("places", []),
            "offline": user.get("offline", True), "text_size": user.get("text_size", 2),
            "high_contrast": user.get("high_contrast", False), "voice": user.get("voice", False),
            "vibrate": user.get("vibrate", True), "profile": profile,
            "profile_consent_at": user.get("profile_consent_at"),
            "settings": sec.settings_for(profile), "first_screen": sec.first_screen(profile)}


def session(user: dict) -> dict:
    return {"token": sec.make_token(str(user["_id"]), user.get("token_version", 0)), "user": public(user)}


def check(p: Preferences | Register) -> None:
    if p.language and p.language not in sec.LANGS:
        raise HTTPException(422, "unknown_language")
    if p.profile and not set(p.profile) <= sec.PROFILES:
        raise HTTPException(422, "unknown_profile")
    if p.profile and not p.profile_consent:
        raise HTTPException(422, "consent_required")
    if getattr(p, "alerts", None) and not set(p.alerts) <= sec.HAZARDS:
        raise HTTPException(422, "unknown_alert")


@router.post("/auth/register", dependencies=[Depends(limit("register"))])
def register(body: Register, db=Depends(db_dep)):
    check(body)
    email = body.email.lower()
    if db.users.find_one({"email": email}):
        raise HTTPException(409, "email_taken")
    now = datetime.now(timezone.utc)
    doc = {"email": email, "password": sec.hash_password(body.password), "language": body.language,
           "created_at": now, "alerts": DEFAULT_ALERTS, "offline": True, "role": "user", "token_version": 0}
    if body.profile:
        doc["profile_enc"] = sec.encrypt_profile(body.profile)
        doc["profile_consent_at"] = now
        doc.update(profile_defaults(body.profile))
    uid = db.users.insert_one(doc).inserted_id
    return session(db.users.find_one({"_id": uid}))


@router.post("/auth/login", dependencies=[Depends(limit("login"))])
def login(body: Login, db=Depends(db_dep)):
    user = db.users.find_one({"email": body.email.lower()})
    # Même coût de calcul que l'adresse existe ou non
    if not sec.check_password_or_dummy(body.password, (user or {}).get("password")):
        raise HTTPException(401, "bad_credentials")
    return session(user)


@router.post("/auth/forgot-password", dependencies=[Depends(limit("email"))])
def forgot_password(body: ForgotPassword, tasks: BackgroundTasks, db=Depends(db_dep)):
    """Envoie un lien de réinitialisation. Réponse identique que le compte existe ou non."""
    user = db.users.find_one({"email": body.email.lower()})
    if user:
        token = sec.make_reset_token(user)
        lang = user.get("language", "fr")
        tasks.add_task(mailer.send, user["email"], mailer.text(lang, "reset_subject"),
                       mailer.text(lang, "reset_body", link=mailer.reset_link(token),
                                   minutes=sec.settings.reset_token_minutes), lang)
    return {"sent": True}


@router.post("/auth/reset-password", dependencies=[Depends(limit("login"))])
def reset_password(body: ResetPassword, db=Depends(db_dep)):
    try:
        claims = sec.read_reset_token(body.token)
        user = db.users.find_one({"_id": ObjectId(claims["sub"])})
    except (jwt.InvalidTokenError, InvalidId, TypeError):
        raise HTTPException(400, "reset_invalid")
    if not user or not sec.reset_token_matches(claims, user):
        raise HTTPException(400, "reset_invalid")
    db.users.update_one({"_id": user["_id"]}, {"$set": {"password": sec.hash_password(body.password)},
                                               "$inc": {"token_version": 1}})
    return session(db.users.find_one({"_id": user["_id"]}))


@router.post("/me/password", dependencies=[Depends(limit("login"))])
def change_password(body: ChangePassword, user=Depends(user_dep), db=Depends(db_dep)):
    if not sec.check_password(body.current_password, user["password"]):
        raise HTTPException(401, "bad_credentials")
    db.users.update_one({"_id": user["_id"]}, {"$set": {"password": sec.hash_password(body.password)},
                                               "$inc": {"token_version": 1}})
    # Les autres appareils sont déconnectés ; celui-ci reçoit un nouveau jeton
    return session(db.users.find_one({"_id": user["_id"]}))


@router.get("/me")
def me(user=Depends(user_dep)):
    return public(user)


@router.put("/me/preferences")
def update_preferences(body: Preferences, user=Depends(user_dep), db=Depends(db_dep)):
    check(body)
    upd = {k: v for k, v in body.model_dump().items() if v is not None and k not in ("profile", "profile_consent")}
    ops: dict = {}
    if body.profile is not None:
        if body.profile:
            upd["profile_enc"] = sec.encrypt_profile(body.profile)
            upd["profile_consent_at"] = datetime.now(timezone.utc)
            # Réglages du profil, sauf ceux que l'usager envoie lui-même dans la même requête
            upd = {**profile_defaults(body.profile), **upd}
        else:  # retrait du consentement : on efface le profil
            ops["$unset"] = {"profile_enc": "", "profile_consent_at": ""}
    if upd:
        ops["$set"] = upd
    if ops:
        db.users.update_one({"_id": user["_id"]}, ops)
    return public(db.users.find_one({"_id": user["_id"]}))


@router.post("/me/places")
def add_place(body: SavedPlace, user=Depends(user_dep), db=Depends(db_dep)):
    """Enregistre une destination (10 au plus) ; une destination déjà enregistrée au même endroit est renommée."""
    places = [p for p in user.get("places", []) if (round(p["lat"], 5), round(p["lon"], 5)) != (round(body.lat, 5), round(body.lon, 5))]
    if len(places) >= MAX_PLACES:
        raise HTTPException(409, "too_many_places")
    places.append({"id": secrets.token_hex(6), **body.model_dump()})
    db.users.update_one({"_id": user["_id"]}, {"$set": {"places": places}})
    return public(db.users.find_one({"_id": user["_id"]}))


@router.delete("/me/places/{place_id}")
def remove_place(place_id: str, user=Depends(user_dep), db=Depends(db_dep)):
    db.users.update_one({"_id": user["_id"]}, {"$pull": {"places": {"id": place_id}}})
    return public(db.users.find_one({"_id": user["_id"]}))


@router.get("/me/export")
def export(user=Depends(user_dep)):
    return {**public(user), "created_at": user.get("created_at")}


@router.delete("/me")
def delete_me(user=Depends(user_dep), db=Depends(db_dep)):
    if role_of(user) == "superadmin":
        # Le super admin défini dans SUPERADMIN_EMAILS serait recréé : on le retire d'abord de la configuration
        raise HTTPException(409, "superadmin_cannot_delete")
    db.users.delete_one({"_id": user["_id"]})
    return {"deleted": True}
