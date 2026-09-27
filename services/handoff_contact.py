"""Ephemeral user WhatsApp contacts for CHW handoff (Redis or memory, never SQL)."""

from __future__ import annotations

import time
from typing import Optional

from services.session import session_store

HANDOFF_TTL = 24 * 60 * 60  # 24 hours
_MEMORY: dict[str, tuple[str, float]] = {}


def _key(code: str) -> str:
    return f"contrabot:handoff:{code}"


def store_handoff_contact(code: str, whatsapp_digits: str, ttl: int = HANDOFF_TTL) -> bool:
    if not code or not whatsapp_digits:
        return False
    digits = "".join(c for c in whatsapp_digits if c.isdigit())
    if len(digits) < 9:
        return False

    if session_store._use_redis and session_store._redis:
        try:
            session_store._redis.set(_key(code), digits, ex=ttl)
            return True
        except Exception:
            pass

    _MEMORY[code] = (digits, time.time() + ttl)
    return True


def get_handoff_contact(code: str) -> Optional[str]:
    if not code:
        return None

    if session_store._use_redis and session_store._redis:
        try:
            val = session_store._redis.get(_key(code))
            if val:
                return val.decode() if isinstance(val, bytes) else str(val)
        except Exception:
            pass

    entry = _MEMORY.get(code)
    if not entry:
        return None
    digits, expires = entry
    if time.time() > expires:
        _MEMORY.pop(code, None)
        return None
    return digits


def clear_handoff_contact(code: str) -> None:
    if session_store._use_redis and session_store._redis:
        try:
            session_store._redis.delete(_key(code))
        except Exception:
            pass
    _MEMORY.pop(code, None)


def wa_deep_link(whatsapp_digits: str, text: str = "") -> str:
    digits = "".join(c for c in whatsapp_digits if c.isdigit())
    if text:
        from urllib.parse import quote

        return f"https://wa.me/{digits}?text={quote(text)}"
    return f"https://wa.me/{digits}"
