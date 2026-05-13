import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt as _bcrypt_lib
from fastapi import HTTPException
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from models import User

_SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
_ALGORITHM = "HS256"
_TOKEN_EXPIRE_DAYS = 7

_PUBLIC_PATHS = {
    "/api/auth/login",
    "/api/admin/login",
    "/api/ponderadores/defaults",
    "/api/settings/branding",
}


def hash_password(pw: str) -> str:
    return _bcrypt_lib.hashpw(pw.encode(), _bcrypt_lib.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt_lib.checkpw(plain.encode(), hashed.encode())


def create_token(username: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": username, "exp": exp}, _SECRET_KEY, algorithm=_ALGORITHM)


def decode_token(token: str) -> str:
    payload = jwt.decode(token, _SECRET_KEY, algorithms=[_ALGORITHM])
    username = payload.get("sub")
    if not username:
        raise JWTError("no sub")
    return username


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in _PUBLIC_PATHS or not request.url.path.startswith("/api/"):
            return await call_next(request)
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse({"detail": "No autenticado"}, status_code=401)
        try:
            decode_token(auth.split(" ", 1)[1])
        except JWTError:
            return JSONResponse({"detail": "Token inválido o expirado"}, status_code=401)
        return await call_next(request)


def current_user(request: Request, db: Session) -> User:
    token = request.headers.get("Authorization", "").split(" ", 1)[-1]
    try:
        username = decode_token(token)
    except JWTError:
        raise HTTPException(401, "Token inválido")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(401, "Usuario no encontrado")
    return user


def require_admin(request: Request, db: Session) -> User:
    user = current_user(request, db)
    if not user.is_admin:
        raise HTTPException(403, "Se requieren permisos de administrador")
    return user


def require_approver(request: Request, db: Session) -> User:
    user = current_user(request, db)
    if not user.is_admin or not user.is_approver:
        raise HTTPException(403, "Se requieren permisos de approver")
    return user


def require_superadmin(request: Request, db: Session) -> User:
    user = current_user(request, db)
    if not user.is_superadmin:
        raise HTTPException(403, "Se requieren permisos de superadmin")
    return user


# Keep underscore-prefixed aliases for backwards compatibility with main.py during transition
_hash_password = hash_password
_verify_password = verify_password
_create_token = create_token
_decode_token = decode_token
_current_user = current_user
_require_admin = require_admin
_require_approver = require_approver
_require_superadmin = require_superadmin
