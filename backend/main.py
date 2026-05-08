from __future__ import annotations
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from starlette.concurrency import run_in_threadpool

from analytics import get_analytics, log_query
from models import AnalyticsResponse, QueryRequest, QueryResponse
from rag import get_confidence, get_index, retrieve


load_dotenv()


def _get_cerebras_key() -> str | None:
    return os.getenv("CEREBRAS_API_KEY")


def _get_cerebras_model() -> str:
    return os.getenv("CEREBRAS_MODEL") or "llama3.1-8b"


def _cerebras_client() -> OpenAI:
    api_key = _get_cerebras_key()
    if not api_key:
        raise RuntimeError("Missing CEREBRAS_API_KEY")
    return OpenAI(base_url="https://api.cerebras.ai/v1", api_key=api_key)


def _format_chunks(chunks: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for i, ch in enumerate(chunks, start=1):
        entry = ch.get("entry") or {}
        score = ch.get("score")
        lines.append(
            "\n".join(
                [
                    f"[{i}] (similarity={score:.3f})",
                    f"Category: {entry.get('category')}",
                    f"Question: {entry.get('question')}",
                    f"Answer: {entry.get('answer')}",
                    f"Department: {entry.get('department')}",
                    f"Contact: {entry.get('contact')}",
                    f"Fee: {entry.get('fee')}",
                    f"Documents: {entry.get('documents')}",
                    f"Timeline: {entry.get('timeline')}",
                ]
            )
        )
    return "\n\n".join(lines).strip()


def _fallback_answer(chunks: list[dict[str, Any]], language: str) -> str:
    if not chunks:
        return (
            "I’m not able to find this in my municipal knowledge base right now. "
            "Please share your ward/area and what service you need (trade licence, tax, permit, utility, certificate, grievance)."
            if language == "en"
            else "ಈ ಪ್ರಶ್ನೆಗೆ ನನ್ನ ನಗರ ಸೇವಾ ಜ್ಞಾನಕೋಶದಲ್ಲಿ ಈಗ ಸ್ಪಷ್ಟ ಉತ್ತರ ಸಿಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ವಾರ್ಡ್/ಪ್ರದೇಶ ಮತ್ತು ಯಾವ ಸೇವೆ ಬೇಕು (ಟ್ರೇಡ್ ಲೈಸೆನ್ಸ್, ಟ್ಯಾಕ್ಸ್, ಪರ್ಮಿಟ್, ಯೂಟಿಲಿಟಿ, ಸರ್ಟಿಫಿಕೇಟ್, ದೂರು) ಎಂಬುದನ್ನು ತಿಳಿಸಿ."
        )
    top = chunks[0]["entry"]
    # Use KB answer verbatim; it is already written in plain language.
    return str(top.get("answer") or "").strip()


def _pick_category(chunks: list[dict[str, Any]]) -> str:
    if not chunks:
        return "unknown"
    entry = chunks[0].get("entry") or {}
    return str(entry.get("category") or "unknown")


def _escalation_details(chunks: list[dict[str, Any]]) -> tuple[str | None, str | None]:
    if not chunks:
        return (
            "Belagavi City Corporation Helpdesk",
            "BCC Main Office, Corporation Road, Belagavi; Phone: 0831-2407200",
        )
    entry = chunks[0].get("entry") or {}
    return entry.get("department"), entry.get("contact")


def _suggested_followups(category: str, language: str) -> list[str]:
    en: dict[str, list[str]] = {
        "trade_licence": [
            "Do you want renewal or a new trade licence?",
            "What is your business type (shop, hotel, clinic, etc.)?",
            "Is the premises owned or rented?",
        ],
        "property_tax": [
            "Do you have your property/khata number?",
            "Is this about payment, name correction, or transfer?",
            "Which ward/area is your property in?",
        ],
        "building_permit": [
            "Is this a new construction or additional floor?",
            "Do you already have a sanctioned plan?",
            "What is the plot size and road width (approx)?",
        ],
        "utility": [
            "Is this about water, drainage, garbage, or streetlights?",
            "Can you share your ward/area and a landmark?",
            "Do you have a consumer/connection number (if any)?",
        ],
        "certificate": [
            "Which certificate do you need (birth, death, marriage, residence)?",
            "Is the event already registered (for birth/death)?",
            "Do you need a correction or a new certificate?",
        ],
        "grievance": [
            "What is the exact location and ward/area?",
            "Is it urgent or recurring, and since when?",
            "Do you have a photo you can share (optional)?",
        ],
    }

    kn: dict[str, list[str]] = {
        "trade_licence": [
            "ನಿಮಗೆ ಹೊಸ ಲೈಸೆನ್ಸ್ ಬೇಕಾ ಅಥವಾ ರಿನ್ಯೂವಲ್ ಬೇಕಾ?",
            "ನಿಮ್ಮ ವ್ಯವಹಾರದ ಪ್ರಕಾರ ಏನು (ಅಂಗಡಿ/ಹೋಟೆಲ್/ಕ್ಲಿನಿಕ್)?",
            "ಸ್ಥಳ ನಿಮ್ಮದೇನಾ ಅಥವಾ ಬಾಡಿಗೆಯಾ?",
        ],
        "property_tax": [
            "ನಿಮ್ಮ ಪ್ರಾಪರ್ಟಿ/ಖಾತಾ ಸಂಖ್ಯೆ ಇದೆಯಾ?",
            "ಪಾವತಿ/ಹೆಸರು ತಿದ್ದುಪಡಿ/ಟ್ರಾನ್ಸ್‌ಫರ್ ಯಾವದಕ್ಕೆ ಸಂಬಂಧಿಸಿದೆ?",
            "ನಿಮ್ಮ ಪ್ರಾಪರ್ಟಿ ಯಾವ ವಾರ್ಡ್/ಪ್ರದೇಶದಲ್ಲಿದೆ?",
        ],
        "building_permit": [
            "ಇದು ಹೊಸ ಕಟ್ಟಡವೇ ಅಥವಾ ಹೆಚ್ಚುವರಿ ಮಹಡಿಯೇ?",
            "ನಿಮ್ಮ ಬಳಿ ಸ್ಯಾಂಕ್ಷನ್ ಪ್ಲಾನ್ ಇದೆಯಾ?",
            "ಪ್ಲಾಟ್ ಗಾತ್ರ ಮತ್ತು ರಸ್ತೆಯ ಅಗಲ (ಅಂದಾಜು) ಎಷ್ಟು?",
        ],
        "utility": [
            "ನೀರು/ಡ್ರೈನೇಜ್/ಕಸ/ಸ್ಟ್ರೀಟ್‌ಲೈಟ್ ಯಾವ ಸಮಸ್ಯೆ?",
            "ನಿಮ್ಮ ವಾರ್ಡ್/ಪ್ರದೇಶ ಮತ್ತು ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ ಹೇಳಬಹುದಾ?",
            "ಕನೆಕ್ಷನ್/ಕನ್ಸ್ಯೂಮರ್ ಸಂಖ್ಯೆ ಇದೆಯಾ (ಇದ್ದರೆ)?",
        ],
        "certificate": [
            "ಯಾವ ಸರ್ಟಿಫಿಕೇಟ್ ಬೇಕು (ಜನನ/ಮರಣ/ಮದುವೆ/ನಿವಾಸ)?",
            "ಜನನ/ಮರಣ ನೋಂದಣಿ ಈಗಾಗಲೇ ಆಗಿದೆಯಾ?",
            "ತಿದ್ದುಪಡಿ ಬೇಕಾ ಅಥವಾ ಹೊಸ ಸರ್ಟಿಫಿಕೇಟ್ ಬೇಕಾ?",
        ],
        "grievance": [
            "ಸ್ಥಳ ಮತ್ತು ವಾರ್ಡ್/ಪ್ರದೇಶವನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ಹೇಳಿರಿ.",
            "ಇದು ತುರ್ತುವೇ ಅಥವಾ ಪುನರಾವರ್ತನೆಯೇ? ಯಾವಾಗಿನಿಂದ?",
            "ಫೋಟೋ ಇದ್ದರೆ ಹಂಚಬಹುದು (ಐಚ್ಛಿಕ).",
        ],
    }

    if language == "kn":
        return kn.get(category, kn["grievance"])[:3]
    return en.get(category, en["grievance"])[:3]


def _action_cards_for(category: str, dept: str | None, contact: str | None) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    # Keep URLs conservative (no made-up payment links).
    if category in {"property_tax", "trade_licence", "building_permit"}:
        cards.append({"label": "Visit BCC Helpdesk", "type": "link", "url": "https://belagavi.gov.in", "phone": None})
    if contact:
        # Extract first phone-like token if present; otherwise show full contact string.
        phone = None
        for token in str(contact).replace(";", " ").replace(",", " ").split():
            if token.strip().replace("-", "").isdigit() and len(token.strip().replace("-", "")) >= 10:
                phone = token.strip()
                break
        cards.append({"label": f"Call {dept or 'Department'}", "type": "call", "url": None, "phone": phone or str(contact)})
    return cards


def _cerebras_generate(system_prompt: str, user_message: str) -> str:
    client = _cerebras_client()
    resp = client.chat.completions.create(
        model=_get_cerebras_model(),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.3,
    )

    choice = (resp.choices or [None])[0]
    message = getattr(choice, "message", None) if choice else None
    content = getattr(message, "content", None) if message else None
    if not content:
        raise RuntimeError("Cerebras returned empty response")
    return str(content).strip()


app = FastAPI(title="ClawBot (CivicBot) API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, Any]:
    idx = get_index()
    return {"status": "ok", "kb_entries": idx.kb_entries_count}


@app.get("/analytics", response_model=AnalyticsResponse)
async def analytics_endpoint() -> dict[str, Any]:
    return get_analytics()


@app.post("/chat", response_model=QueryResponse)
async def chat(req: QueryRequest) -> dict[str, Any]:
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    chunks = retrieve(message, top_k=3)
    scores = [float(c.get("score", 0.0)) for c in chunks]
    confidence = get_confidence(scores)

    category = _pick_category(chunks)
    dept, contact = _escalation_details(chunks)
    escalate = confidence < 0.45

    retrieved_chunks = _format_chunks(chunks)
    system_prompt = f"""
You are CivicBot, a helpful AI assistant for municipal services in Belagavi, Karnataka, India.
Help citizens with: trade licences, property tax, building permits, utility connections, certificates, grievances.

Rules:
- Respond in the SAME language as the user (English or Kannada)
- Use numbered steps for any process
- Be concise and clear — no bureaucratic jargon
- Always mention fees and required documents if relevant
- If escalating, say: "I recommend confirming this with {dept} at {contact}"
- End with ONE relevant follow-up question
- Never make up fees, timelines, or document requirements

Relevant knowledge base context:
{retrieved_chunks}
""".strip()

    try:
        answer = await run_in_threadpool(_cerebras_generate, system_prompt, message)
    except Exception:
        # Hard fail-safe: still answer using KB without hallucinating.
        answer = _fallback_answer(chunks, req.language)

    # If escalation is required but the model didn't include the escalation sentence, append it.
    if escalate and dept and contact:
        esc_line_en = f'I recommend confirming this with {dept} at {contact}.'
        esc_line_kn = f'ನಾನು ಇದನ್ನು {dept} ನಲ್ಲಿ {contact} ಮೂಲಕ ದೃಢಪಡಿಸಲು ಶಿಫಾರಸು ಮಾಡುತ್ತೇನೆ.'
        esc_line = esc_line_kn if req.language == "kn" else esc_line_en
        if esc_line not in answer:
            answer = f"{answer}\n\n{esc_line}"

    followups = _suggested_followups(category, req.language)
    action_cards = _action_cards_for(category, dept, contact)

    log_query(
        session_id=req.session_id,
        query_text=message,
        category=category,
        confidence=confidence,
        escalated=escalate,
        language=req.language,
    )

    return {
        "answer": answer,
        "confidence": float(confidence),
        "category": category,
        "escalate": bool(escalate),
        "department": dept,
        "contact": contact,
        "action_cards": action_cards,
        "suggested_followups": followups,
    }

