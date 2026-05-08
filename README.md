## ClawBot (CivicBot) — Municipal Services Conversational Agent

ClawBot (branded as **CivicBot** in the UI) is a production-ready municipal services assistant for **Belagavi, Karnataka** with:

- **RAG (Retrieval Augmented Generation)** via a local knowledge base + persistent **ChromaDB** vector store
- **Multilingual support** (English + Kannada)
- **Confidence-based escalation** to the relevant department contact
- **Admin analytics dashboard** (SQLite-backed logging + charts)
- **Voice input** using the **Web Speech API**

---

## Prerequisites

- **Python 3.11**
- **Node.js 18+**
- A **Cerebras API key**

---

## 1) Backend setup (FastAPI)

```bash
cd civicbot/backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Edit `civicbot/backend/.env` and set:

```env
CEREBRAS_API_KEY=your_real_key_here
# Optional (defaults to llama3.1-8b)
# CEREBRAS_MODEL=llama3.1-8b
```

Run the API:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

- `GET` `http://localhost:8000/health`

---

## 2) Frontend setup (React + Vite)

```bash
cd civicbot/frontend
npm install
npm run dev
```

Open:

- Chat: `http://localhost:5173/`
- Admin: `http://localhost:5173/admin`

---

## Configuration notes

- **API URL**: By default, the frontend calls `http://localhost:8000`.
  - You can override with `VITE_API_URL` (example: set it to `/api` and use the dev proxy).
- **ChromaDB persistence**: stored at `civicbot/backend/chroma_db/` so embeddings are not recreated on every restart.
- **Analytics DB**: stored at `civicbot/backend/civicbot_analytics.db`.

---

## Deployment targets

- **Frontend (Vercel)**: build with `npm run build` in `civicbot/frontend`
- **Backend (Render)**: run `uvicorn main:app --host 0.0.0.0 --port $PORT`

