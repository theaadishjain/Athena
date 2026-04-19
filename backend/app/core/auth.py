import time
import httpx
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.core.config import get_settings

security = HTTPBearer()

# Simple in-memory JWKS cache — 1 hour TTL
_jwks_cache: dict = {"data": None, "fetched_at": 0.0}


async def get_jwks() -> dict:
    now = time.time()
    if _jwks_cache["data"] and now - _jwks_cache["fetched_at"] < 3600:
        return _jwks_cache["data"]
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.clerk.com/v1/jwks",
            headers={
                "Authorization": f"Bearer {get_settings().clerk_secret_key}"
            },
        )
        resp.raise_for_status()
        _jwks_cache["data"] = resp.json()
        _jwks_cache["fetched_at"] = now
    return _jwks_cache["data"]


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    token = credentials.credentials
    try:
        jwks = await get_jwks()
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Auth failed")
