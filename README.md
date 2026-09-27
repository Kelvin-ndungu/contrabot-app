# ContraBot — Production Architecture

ContraBot is an AI-powered contraception counseling platform for East Africa, delivering WHO MEC–grounded recommendations via USSD, WhatsApp, web chat, and a CHW dashboard.

## Architecture

```
channels/ussd.py, channels/whatsapp.py  →  channels/intake.py (shared flow)
                                              ↓
engine/safety_screen.py → engine/scorer.py → engine/recommender.py (+ RAG)
                                              ↓
services/knowledge.py (ChromaDB)   services/facilities.py (PostgreSQL)
services/session.py (Redis)
```

## Data Sources

| Source | Location | Collection |
|--------|----------|------------|
| WHO Medical Eligibility Criteria | `data/chromadb/WHO_MEC.pdf` | `who_mec` |
| APHRC regional evidence (sample) | `data/aphrc/records.json` | `aphrc` |
| Kenya/Uganda facilities | `data/facilities/*.csv` | PostgreSQL `facilities` |

Replace `data/aphrc/records.json` with full APHRC exports when available. Add more rows with fields: `region`, `method`, `discontinuation_reason`, `text`.

## Quick Start (Local)

### 1. Infrastructure

```bash
docker compose up -d redis postgres
```

### 2. Python backend

```bash
python -m venv .venv
.\.venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env     # fill API keys
python ingest.py           # embed WHO MEC + APHRC
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Web app (user-facing chat)

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173 — Landing, Chat, Compare, Facilities.

Set `VITE_USE_MOCK=true` in `.env` to demo without the backend.

### 4. CHW dashboard

```bash
cd chw
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5174 — CHW Home, Consult, Outcomes analytics.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/recommend` | Full engine pipeline (profile JSON) |
| POST | `/chat` | Free-form chat with RAG context |
| GET | `/facilities?district=` | Nearest clinics |
| POST | `/outcomes` | CHW outcome logging |
| GET | `/analytics/outcomes` | Aggregated outcomes |
| GET | `/methods/compare` | Method comparison table |
| POST/GET | `/ussd` | Africa's Talking USSD |
| GET/POST | `/whatsapp` or `/webhook` | Meta WhatsApp |

## Environment Variables

See `.env.example` for:

- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`
- `AT_API_KEY`, `AT_USERNAME`
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`
- `REDIS_URL`, `DATABASE_URL`
- `CORS_ORIGINS`

## Testing

```bash
pytest tests/ -v
```

Includes 10 profile edge cases in `tests/test_engine_e2e.py` and safety screen unit tests.

## Deployment (Railway / Render)

1. Connect GitHub repo
2. Set all env vars from `.env.example`
3. Add Redis and PostgreSQL add-ons (or use `docker-compose.yml`)
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Deploy frontend to Vercel with `VITE_API_URL=https://your-api.railway.app`

## USSD Flow

Callback: `POST/GET /ussd` (Africa's Talking). Sandbox code example: `*384*51567#`.

1. **Mode** — `1` Get recommendation (triage) · `2` Ask a question (chat)
2. **Language** — English / Kiswahili
3. **Triage** — same question set as the web chat (sex, age, goal, pregnancy, health, meds, preferences, district, …)
4. **Recommendation** — top safe methods + optional nearest clinic
5. **Chat** — type a free-text question; reply `0` to end

Keep your AT callback URL pointed at the public tunnel, e.g. `https://<ngrok-host>/ussd`.

## Manual Setup Checklist

- [ ] Africa's Talking sandbox → point USSD callback to `https://your-api/ussd`
- [ ] Meta WhatsApp sandbox → webhook `https://your-api/webhook`
- [ ] Run `python ingest.py` after adding real APHRC PDFs/CSVs
- [ ] Import real DHIS2 facility exports into `data/facilities/`

## Project Structure

```
app/           FastAPI entry + API routes
channels/      USSD, WhatsApp, shared intake
engine/        Safety screen, scorer, recommender
services/      Redis sessions, ChromaDB, PostgreSQL
prompts/       System prompt
data/          PDFs, APHRC JSON, facility CSVs
frontend/      React (Vite) web + CHW UI
tests/         pytest suite
ingest.py      Knowledge base ingestion
docker-compose.yml
```

## Phase Status

| Phase | Status |
|-------|--------|
| 1 Setup | Done |
| 2 Knowledge base | WHO MEC + APHRC sample; add full datasets |
| 3 Core engine | Done |
| 4 USSD + Redis | Done |
| 5 WhatsApp | Done (buttons + langdetect) |
| 6 Facilities | Done (sample CSVs; add DHIS2 exports) |
| 7 Web chat | Done |
| 8 CHW dashboard | Done |
| 9 Testing | pytest suite; device testing manual |

faruoq: working on the bot

## Recent docs

- [CHW.md](CHW.md) — CHW dashboard roles & referrals
- [CHW_HANDOFF.md](CHW_HANDOFF.md) — live CHW ↔ user handoff
- [WHATSAPP.md](WHATSAPP.md) — Meta WhatsApp setup
