"""CHW roster loader — staff WhatsApp numbers for live handoff notify."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional


def _roster_path() -> Path:
    configured = os.getenv("CHW_ROSTER_PATH")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parent.parent / "data" / "chw_roster.json"


def load_chw_roster() -> list[dict]:
    path = _roster_path()
    rows: list[dict] = []
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                rows.extend(data)
        except Exception:
            pass

    # Fallback / merge from env: CHW_NOTIFY_NUMBERS=2547...,2547...
    extra = os.getenv("CHW_NOTIFY_NUMBERS", "")
    for i, raw in enumerate(extra.split(",")):
        digits = "".join(c for c in raw if c.isdigit())
        if not digits:
            continue
        rows.append(
            {
                "chw_id": f"ENV-{i+1}",
                "name": f"On-call CHW {i+1}",
                "district": "*",
                "whatsapp": digits,
                "active": True,
            }
        )
    return [r for r in rows if r.get("active", True) and r.get("whatsapp")]


def pick_chw_for_district(district: str) -> Optional[dict]:
    roster = load_chw_roster()
    if not roster:
        return None
    d = (district or "").strip().lower()
    exact = [r for r in roster if str(r.get("district", "")).lower() == d]
    if exact:
        return exact[0]
    wildcard = [r for r in roster if str(r.get("district", "")) in ("*", "", "any")]
    if wildcard:
        return wildcard[0]
    return roster[0]


def digits_only(value: str) -> str:
    return "".join(c for c in str(value or "") if c.isdigit())
