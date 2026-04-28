"""Huroof API — Azure Functions Python v2.

Endpoints:
  POST /api/auth/magiclink  body {email}            → emails one-time link
  GET  /api/auth/verify?token=...                   → returns long-lived JWT
  GET  /api/profiles        Authorization: Bearer …  → list parent's child profiles
  POST /api/profiles                                → create child profile
  GET  /api/profiles/{id}                           → load full state JSON
  PUT  /api/profiles/{id}                           → save full state JSON
  DELETE /api/profiles/{id}                         → delete child profile

Auth:
  Two short-lived OTP-style tokens travel by email (TTL 5 min, single-use).
  Verified sessions get a long JWT (24 h) signed with JWT_SECRET.

Storage (Azure Tables):
  Table 'parents'   : PK=email_lower, RK='parent'      → {parent_id}
  Table 'profiles'  : PK=parent_id,   RK=profile_id    → {name, avatar, data_json}
  Table 'magiclinks': PK=email_lower, RK=token         → {expires, used}
"""

import json
import logging
import os
import re
import secrets
import time
import uuid
from typing import Any

import azure.functions as func
import jwt
from azure.communication.email import EmailClient
from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from azure.data.tables import TableServiceClient, UpdateMode

# ── Config ────────────────────────────────────────────────────────────────
TABLES_CONN = os.environ.get("TABLES_CONNECTION_STRING", "")
ACS_CONN = os.environ.get("ACS_CONNECTION_STRING", "")
ACS_SENDER = os.environ.get("ACS_SENDER_ADDRESS", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
MAGIC_LINK_BASE = os.environ.get("MAGIC_LINK_BASE", "https://huroof.au/#/auth")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
# Optional comma-separated list of additional allowed redirect bases
# (origins like https://huroof.au); used to validate client-supplied redirect.
_allowed_redirects_env = os.environ.get("ALLOWED_REDIRECT_BASES", "https://huroof.au,https://has-taiar.github.io/arabiyati,http://localhost:8787")
ALLOWED_REDIRECT_BASES = [s.strip().rstrip("/") for s in _allowed_redirects_env.split(",") if s.strip()]

JWT_ALGO = "HS256"
JWT_TTL_SEC = 24 * 60 * 60
MAGIC_TTL_SEC = 5 * 60
PROFILE_MAX_BYTES = 50 * 1024
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I confusion
CODE_LEN = 6
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
NAME_RE = re.compile(r"^[\w\u0600-\u06FF\s.\-']{1,40}$")  # latin + Arabic

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# ── Helpers ───────────────────────────────────────────────────────────────
def _cors_headers() -> dict:
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "3600",
    }


def _resp(body: Any, status: int = 200, extra_headers: dict | None = None) -> func.HttpResponse:
    headers = {"Content-Type": "application/json", **_cors_headers()}
    if extra_headers:
        headers.update(extra_headers)
    return func.HttpResponse(json.dumps(body), status_code=status, headers=headers)


def _err(msg: str, status: int = 400) -> func.HttpResponse:
    return _resp({"error": msg}, status=status)


def _tables() -> TableServiceClient:
    return TableServiceClient.from_connection_string(TABLES_CONN)


def _table(name: str):
    svc = _tables()
    try:
        svc.create_table_if_not_exists(name)
    except Exception:
        pass
    return svc.get_table_client(name)


def _make_jwt(parent_id: str, email: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": parent_id, "email": email, "iat": now, "exp": now + JWT_TTL_SEC},
        JWT_SECRET, algorithm=JWT_ALGO,
    )


def _auth(req: func.HttpRequest) -> dict | None:
    h = req.headers.get("Authorization") or ""
    if not h.startswith("Bearer "):
        return None
    try:
        return jwt.decode(h[7:], JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        return None


def _gen_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))


def _validate_redirect_base(candidate: str | None) -> str:
    """Return a safe link base. Falls back to MAGIC_LINK_BASE."""
    if not candidate:
        return MAGIC_LINK_BASE
    cand = candidate.strip().rstrip("/")
    # Match by origin/path prefix against allow-list.
    for allowed in ALLOWED_REDIRECT_BASES:
        if cand == allowed or cand.startswith(allowed + "/") or cand.startswith(allowed + "#"):
            # If candidate already has #/auth, use as-is; otherwise append.
            if "#/auth" in cand:
                return cand
            return cand + "/#/auth"
    return MAGIC_LINK_BASE


def _send_magic_link(email: str, link: str, code: str) -> None:
    if not ACS_CONN or not ACS_SENDER:
        logging.warning("ACS not configured — would have sent link: %s (code %s)", link, code)
        return
    client = EmailClient.from_connection_string(ACS_CONN)
    msg = {
        "senderAddress": ACS_SENDER,
        "recipients": {"to": [{"address": email}]},
        "content": {
            "subject": "Huroof · Your sign-in link",
            "plainText": (
                f"Tap this link to sign in to Huroof:\n\n{link}\n\n"
                f"Or enter this 6-character code in the app: {code}\n\n"
                f"Both expire in 5 minutes. If you didn't request this, ignore this email."
            ),
            "html": f"""
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
                <h2 style="color:#00897B;">Huroof · حروف</h2>
                <p>Tap the button below to sign in. This link expires in 5 minutes.</p>
                <p style="text-align:center;margin:30px 0;">
                  <a href="{link}" style="display:inline-block;background:#00BFA5;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;">Sign in</a>
                </p>
                <p style="text-align:center;color:#555;font-size:0.95rem;">
                  Or enter this code in the app:<br>
                  <span style="display:inline-block;font-family:monospace;font-size:1.6rem;letter-spacing:6px;background:#F0FDFA;border:2px dashed #00BFA5;border-radius:10px;padding:10px 16px;margin-top:6px;color:#00695C;font-weight:700;">{code}</span>
                </p>
                <p style="color:#888;font-size:0.85rem;">If you didn't request this, ignore this email. Code expires in 5 minutes.</p>
              </div>
            """,
        },
    }
    poller = client.begin_send(msg)
    poller.result(timeout=30)


# ── CORS preflight (catch-all) ─────────────────────────────────────────────
@app.route(route="{*rest}", methods=[func.HttpMethod.OPTIONS])
def options(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse(status_code=204, headers=_cors_headers())


# ── Auth: send magic link ──────────────────────────────────────────────────
@app.route(route="auth/magiclink", methods=[func.HttpMethod.POST])
def magic_link(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return _err("Invalid JSON")
    email = (body.get("email") or "").strip().lower()
    if not EMAIL_RE.match(email):
        return _err("Invalid email")

    token = secrets.token_urlsafe(32)
    code = _gen_code()
    expires = int(time.time()) + MAGIC_TTL_SEC
    redirect = (body.get("redirect") or "").strip()
    link_base = _validate_redirect_base(redirect)

    try:
        _table("magiclinks").upsert_entity({
            "PartitionKey": email, "RowKey": token,
            "expires": expires, "used": False,
            "code": code,
        })
    except Exception:
        logging.exception("magiclinks upsert failed")
        return _err("Storage error", 500)

    link = f"{link_base}?email={email}&token={token}"
    try:
        _send_magic_link(email, link, code)
    except Exception:
        logging.exception("ACS send failed")
        return _err("Could not send email", 500)

    return _resp({"sent": True})


# ── Auth: verify token → JWT ───────────────────────────────────────────────
@app.route(route="auth/verify", methods=[func.HttpMethod.GET])
def verify(req: func.HttpRequest) -> func.HttpResponse:
    email = (req.params.get("email") or "").strip().lower()
    token = req.params.get("token") or ""
    if not EMAIL_RE.match(email) or not token:
        return _err("Bad request")

    table = _table("magiclinks")
    try:
        ent = table.get_entity(partition_key=email, row_key=token)
    except ResourceNotFoundError:
        return _err("Invalid or expired link", 401)

    if ent.get("used") or int(ent.get("expires", 0)) < int(time.time()):
        return _err("Invalid or expired link", 401)

    ent["used"] = True
    table.update_entity(ent, mode=UpdateMode.REPLACE)

    parents = _table("parents")
    try:
        prow = parents.get_entity(partition_key=email, row_key="parent")
        parent_id = prow["parent_id"]
    except ResourceNotFoundError:
        parent_id = uuid.uuid4().hex
        parents.create_entity({"PartitionKey": email, "RowKey": "parent", "parent_id": parent_id})

    return _resp({"jwt": _make_jwt(parent_id, email), "parentId": parent_id})


# ── Auth: verify 6-char code → JWT ─────────────────────────────────────────
@app.route(route="auth/verifycode", methods=[func.HttpMethod.POST])
def verify_code(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return _err("Invalid JSON")
    email = (body.get("email") or "").strip().lower()
    code = (body.get("code") or "").strip().upper()
    if not EMAIL_RE.match(email) or not re.fullmatch(rf"[A-Z0-9]{{{CODE_LEN}}}", code):
        return _err("Bad request")

    table = _table("magiclinks")
    # Find a matching unused, unexpired entry by email + code.
    now = int(time.time())
    found = None
    try:
        for ent in table.query_entities(f"PartitionKey eq '{email}'"):
            if ent.get("used"):
                continue
            if int(ent.get("expires", 0)) < now:
                continue
            if (ent.get("code") or "").upper() == code:
                found = ent
                break
    except Exception:
        logging.exception("magiclinks query failed")
        return _err("Storage error", 500)

    if not found:
        return _err("Invalid or expired code", 401)

    found["used"] = True
    table.update_entity(found, mode=UpdateMode.REPLACE)

    parents = _table("parents")
    try:
        prow = parents.get_entity(partition_key=email, row_key="parent")
        parent_id = prow["parent_id"]
    except ResourceNotFoundError:
        parent_id = uuid.uuid4().hex
        parents.create_entity({"PartitionKey": email, "RowKey": "parent", "parent_id": parent_id})

    return _resp({"jwt": _make_jwt(parent_id, email), "parentId": parent_id})


# ── Profiles ───────────────────────────────────────────────────────────────
def _profile_table():
    return _table("profiles")


@app.route(route="profiles", methods=[func.HttpMethod.GET])
def list_profiles(req: func.HttpRequest) -> func.HttpResponse:
    claims = _auth(req)
    if not claims:
        return _err("Unauthorized", 401)
    items = []
    for ent in _profile_table().query_entities(f"PartitionKey eq '{claims['sub']}'"):
        items.append({
            "id": ent["RowKey"],
            "name": ent.get("name", ""),
            "avatar": ent.get("avatar", 1),
            "updated": ent.get("updated", 0),
        })
    return _resp({"profiles": items})


@app.route(route="profiles", methods=[func.HttpMethod.POST])
def create_profile(req: func.HttpRequest) -> func.HttpResponse:
    claims = _auth(req)
    if not claims:
        return _err("Unauthorized", 401)
    try:
        body = req.get_json()
    except ValueError:
        return _err("Invalid JSON")
    name = (body.get("name") or "").strip()
    avatar = int(body.get("avatar") or 1)
    if not NAME_RE.match(name):
        return _err("Invalid name")
    if not (1 <= avatar <= 8):
        return _err("Invalid avatar")

    profile_id = uuid.uuid4().hex
    _profile_table().create_entity({
        "PartitionKey": claims["sub"],
        "RowKey": profile_id,
        "name": name, "avatar": avatar,
        "data_json": json.dumps({}),
        "updated": int(time.time()),
    })
    return _resp({"id": profile_id})


@app.route(route="profiles/{id}", methods=[func.HttpMethod.GET])
def get_profile(req: func.HttpRequest) -> func.HttpResponse:
    claims = _auth(req)
    if not claims:
        return _err("Unauthorized", 401)
    pid = req.route_params.get("id", "")
    try:
        ent = _profile_table().get_entity(claims["sub"], pid)
    except ResourceNotFoundError:
        return _err("Not found", 404)
    try:
        data = json.loads(ent.get("data_json") or "{}")
    except json.JSONDecodeError:
        data = {}
    return _resp({
        "id": pid,
        "name": ent.get("name", ""),
        "avatar": ent.get("avatar", 1),
        "data": data,
        "updated": ent.get("updated", 0),
    })


@app.route(route="profiles/{id}", methods=[func.HttpMethod.PUT])
def put_profile(req: func.HttpRequest) -> func.HttpResponse:
    claims = _auth(req)
    if not claims:
        return _err("Unauthorized", 401)
    pid = req.route_params.get("id", "")
    raw = req.get_body() or b""
    if len(raw) > PROFILE_MAX_BYTES:
        return _err("Payload too large", 413)
    try:
        body = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return _err("Invalid JSON")

    name = (body.get("name") or "").strip()
    avatar = int(body.get("avatar") or 1)
    data = body.get("data") or {}
    if not NAME_RE.match(name):
        return _err("Invalid name")
    if not (1 <= avatar <= 8):
        return _err("Invalid avatar")
    if not isinstance(data, dict):
        return _err("Invalid data")

    table = _profile_table()
    try:
        ent = table.get_entity(claims["sub"], pid)
    except ResourceNotFoundError:
        return _err("Not found", 404)
    ent["name"] = name
    ent["avatar"] = avatar
    ent["data_json"] = json.dumps(data)
    ent["updated"] = int(time.time())
    table.update_entity(ent, mode=UpdateMode.REPLACE)
    return _resp({"ok": True, "updated": ent["updated"]})


@app.route(route="profiles/{id}", methods=[func.HttpMethod.DELETE])
def delete_profile(req: func.HttpRequest) -> func.HttpResponse:
    claims = _auth(req)
    if not claims:
        return _err("Unauthorized", 401)
    pid = req.route_params.get("id", "")
    try:
        _profile_table().delete_entity(claims["sub"], pid)
    except ResourceNotFoundError:
        pass
    return _resp({"ok": True})


# ── Health ─────────────────────────────────────────────────────────────────
@app.route(route="health", methods=[func.HttpMethod.GET])
def health(req: func.HttpRequest) -> func.HttpResponse:
    return _resp({"ok": True, "ts": int(time.time())})
