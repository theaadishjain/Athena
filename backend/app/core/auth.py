import time

import httpx
import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

security = HTTPBearer()

JWKS_TTL_SECONDS = 3600
# Don't hammer Clerk if a token arrives with an unknown `kid`.
JWKS_MIN_REFRESH_SECONDS = 60

_jwks_cache: dict = {"keys": {}, "fetched_at": 0.0}


async def _fetch_jwks() -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://api.clerk.com/v1/jwks",
            headers={"Authorization": f"Bearer {get_settings().clerk_secret_key}"},
        )
        resp.raise_for_status()
        return resp.json()


async def _get_signing_key(kid: str | None):
    now = time.time()
    keys: dict = _jwks_cache["keys"]
    age = now - _jwks_cache["fetched_at"]

    # Refresh when the cache is stale, or when Clerk rotated keys and we
    # haven't seen this kid yet (rate-limited).
    if age > JWKS_TTL_SECONDS or (kid not in keys and age > JWKS_MIN_REFRESH_SECONDS):
        jwks = await _fetch_jwks()
        keys = {k.get("kid"): jwt.PyJWK(k).key for k in jwks.get("keys", [])}
        _jwks_cache["keys"] = keys
        _jwks_cache["fetched_at"] = now

    if kid in keys:
        return keys[kid]
    if kid is None and len(keys) == 1:
        return next(iter(keys.values()))
    raise HTTPException(status_code=401, detail="Invalid token")


def verify_claims(payload: dict) -> str:
    settings = get_settings()

    if settings.clerk_issuer and payload.get("iss") != settings.clerk_issuer.rstrip("/"):
        raise HTTPException(status_code=401, detail="Invalid token")

    # Clerk sets `azp` to the origin that requested the token. Rejecting
    # unknown origins stops tokens minted for other sites being replayed here.
    azp = payload.get("azp")
    allowed = settings.authorized_party_list
    if azp and allowed and azp not in allowed:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user_id


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    token = credentials.credentials
    try:
        header = jwt.get_unverified_header(token)
        key = await _get_signing_key(header.get("kid"))
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            options={"require": ["exp", "sub"], "verify_aud": False},
            leeway=5,
        )
        return verify_claims(payload)
    except HTTPException:
        raise
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=401, detail="Auth failed")
