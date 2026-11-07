import asyncio
import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import app.core.auth as auth
from app.core.config import get_settings


@pytest.fixture
def signing_key(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    jwk.update({"kid": "kid-1", "alg": "RS256", "use": "sig"})

    async def fake_fetch():
        return {"keys": [jwk]}

    monkeypatch.setattr(auth, "_fetch_jwks", fake_fetch)
    monkeypatch.setattr(auth, "_jwks_cache", {"keys": {}, "fetched_at": 0.0})
    return key


def make_token(key, **claims):
    payload = {"sub": "user_123", "exp": int(time.time()) + 60, "azp": "http://localhost:3000"}
    payload.update(claims)
    return jwt.encode(payload, key, algorithm="RS256", headers={"kid": "kid-1"})


def authenticate(token: str) -> str:
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    return asyncio.run(auth.get_current_user(creds))


def test_valid_token(signing_key):
    assert authenticate(make_token(signing_key)) == "user_123"


def test_expired_token(signing_key):
    with pytest.raises(HTTPException) as exc:
        authenticate(make_token(signing_key, exp=int(time.time()) - 120))
    assert exc.value.status_code == 401


def test_wrong_azp_rejected(signing_key):
    with pytest.raises(HTTPException):
        authenticate(make_token(signing_key, azp="https://evil.example"))


def test_wrong_signature_rejected(signing_key):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(HTTPException):
        authenticate(make_token(other))


def test_hs256_token_rejected(signing_key):
    token = jwt.encode({"sub": "x", "exp": int(time.time()) + 60}, "secret", algorithm="HS256",
                       headers={"kid": "kid-1"})
    with pytest.raises(HTTPException):
        authenticate(token)


def test_issuer_checked_when_configured(signing_key, monkeypatch):
    monkeypatch.setattr(get_settings(), "clerk_issuer", "https://good.clerk.accounts.dev")
    assert authenticate(make_token(signing_key, iss="https://good.clerk.accounts.dev")) == "user_123"
    with pytest.raises(HTTPException):
        authenticate(make_token(signing_key, iss="https://other.clerk.accounts.dev"))
