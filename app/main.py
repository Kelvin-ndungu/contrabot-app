from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from dotenv import load_dotenv
import os

from channels.ussd import handle_ussd_input
from channels.whatsapp import handle_whatsapp_webhook, verify_whatsapp_webhook
from app.routes import router as legacy_router
from app.api_routes import router as api_router
from services.database import import_facilities_csv, init_db

load_dotenv()

app = FastAPI(title="ContraBot", version="1.0.0")

origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://localhost:5175",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(legacy_router)


@app.on_event("startup")
def startup():
    init_db()
    from pathlib import Path
    from services.database import Facility, get_db

    db = get_db()
    try:
        if db.query(Facility).count() == 0:
            base = Path(__file__).parent.parent / "data" / "facilities"
            import_facilities_csv(base / "kenya_facilities.csv", "Kenya")
            import_facilities_csv(base / "uganda_facilities.csv", "Uganda")
    finally:
        db.close()


@app.get("/")
async def root():
    return {"status": "ok", "message": "ContraBot backend is running.", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ussd")
@app.get("/ussd")
async def ussd_webhook(request: Request):
    """Africa's Talking USSD callback. Expects sessionId, phoneNumber, text."""
    params = request.query_params
    form = {}
    try:
        form = await request.form()
    except Exception:
        # Fallback when python-multipart is missing or body is raw
        try:
            raw = (await request.body()).decode("utf-8", errors="ignore")
            from urllib.parse import parse_qs

            parsed = {k: v[0] for k, v in parse_qs(raw).items()}
            form = parsed
        except Exception:
            form = {}

    session_id = form.get("sessionId") or params.get("sessionId")
    phone_number = form.get("phoneNumber") or params.get("phoneNumber")
    text = form.get("text") or params.get("text") or ""

    if not session_id or not phone_number:
        return PlainTextResponse("END Missing required USSD parameters.", media_type="text/plain")

    try:
        return handle_ussd_input(str(session_id), str(text), str(phone_number))
    except Exception as exc:
        print(f"USSD error: {exc}")
        return PlainTextResponse("END Sorry, service error. Please try again.", media_type="text/plain")



@app.get("/whatsapp")
@app.get("/webhook")
async def verify_whatsapp(request: Request):
    return await verify_whatsapp_webhook(request)


@app.post("/whatsapp")
@app.post("/webhook")
async def handle_whatsapp(request: Request):
    return await handle_whatsapp_webhook(request)
