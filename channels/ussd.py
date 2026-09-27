from fastapi.responses import PlainTextResponse
from typing import List

from channels.ussd_flow import new_ussd_session, process_ussd
from services.session import session_store

CHANNEL = "ussd"
USSD_MAX = 160


def build_response(message: str, end: bool = False) -> PlainTextResponse:
    message = (message or "").strip()
    if len(message) > USSD_MAX and not end:
        message = message[: USSD_MAX - 3] + "..."
    # END can carry a slightly longer recommendation
    limit = USSD_MAX if not end else min(len(message), 320)
    prefix = "END" if end else "CON"
    return PlainTextResponse(f"{prefix} {message[:limit]}", media_type="text/plain")


def parse_ussd_text(text: str) -> List[str]:
    if text is None:
        return []
    return [part for part in text.strip().split("*") if part != ""]


def handle_ussd_input(session_id: str, text: str, phone_number: str) -> PlainTextResponse:
    inputs = parse_ussd_text(text)
    session = session_store.get(session_id, CHANNEL) or new_ussd_session(phone_number)

    # Fresh dial — show mode menu (triage vs chat)
    if not inputs:
        session = new_ussd_session(phone_number)
        session["stage"] = "mode"
        session_store.set(session_id, session, CHANNEL, ttl=900)
        return build_response("ContraBot\n1.Get recommendation\n2.Ask a question")

    latest = inputs[-1]
    session, message, end = process_ussd(session, latest)

    if end:
        session_store.delete(session_id, CHANNEL)
        return build_response(message, end=True)

    session_store.set(session_id, session, CHANNEL, ttl=900)
    return build_response(message)
