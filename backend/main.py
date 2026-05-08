from __future__ import annotations
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from apscheduler.schedulers.background import BackgroundScheduler
from starlette.concurrency import run_in_threadpool

from analytics import get_analytics, log_query
from civic_features import (
    append_verified_wisdom,
    classify_issue_type,
    corruption_signal_check,
    detect_constitutional_alert,
    detect_poverty_indicators,
    detect_ward_from_text,
    find_sakala_service,
    handle_collective_grievance,
    handle_infrastructure_memory,
    load_officer_data,
    load_ward_data,
    run_silence_detection_job,
    upsert_query_volume,
)
from db_init import connect_db, init_all_tables, utc_now_iso
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
init_all_tables()
WARD_DATA = load_ward_data()
OFFICER_SERVICES = load_officer_data()
SCHEDULER = BackgroundScheduler(timezone="UTC")

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

    ward_number, ward_info = detect_ward_from_text(message, WARD_DATA)
    chunks = retrieve(message, top_k=3)
    scores = [float(c.get("score", 0.0)) for c in chunks]
    confidence = get_confidence(scores)

    category = _pick_category(chunks)
    dept, contact = _escalation_details(chunks)
    escalate = confidence < 0.45

    retrieved_chunks = _format_chunks(chunks)
    ward_context = ""
    if ward_info:
        ward_context = (
            f"\nWard context:\nThe citizen is from {ward_info.get('name')} (Ward {ward_number}). "
            f"Ward-specific info: {json.dumps(ward_info, ensure_ascii=False)}"
        )
    else:
        ward_context = (
            "\nWard context:\nIf useful, ask one follow-up: "
            "'Which ward or area are you in? This helps me give you exact information.'"
        )

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
{ward_context}
""".strip()

    try:
        answer = await run_in_threadpool(_cerebras_generate, system_prompt, message)
    except Exception:
        # Hard fail-safe: still answer using KB without hallucinating.
        answer = _fallback_answer(chunks, req.language)

    issue_type = classify_issue_type(message)
    if issue_type:
        upsert_query_volume(ward_number, issue_type)
        infra_msg = handle_infrastructure_memory(ward_number, issue_type, message)
        collective_msg = handle_collective_grievance(ward_number, issue_type, message)
        if infra_msg:
            answer = f"{answer}\n\n{infra_msg}"
        if collective_msg:
            answer = f"{answer}\n\n{collective_msg}"

    service = find_sakala_service(message, OFFICER_SERVICES)
    if service:
        answer = (
            f"{answer}\n\nThe officer responsible for this is {service.get('responsible_officer')}. "
            f"Under the Karnataka Sakala Services Act, this must be completed in {service.get('sakala_timeline_days')} days. "
            f"If not, {service.get('responsible_officer')} is legally accountable and you can claim "
            f"Rs.{service.get('penalty_per_day')}/day compensation. "
            f"To escalate: contact {service.get('escalation_officer')} via {service.get('contact')}."
        )

    const_alert = detect_constitutional_alert(message, ward_number)
    if const_alert:
        article, right_name = const_alert
        answer = (
            f"{answer}\n\n⚖️ RIGHTS ALERT: What you are describing may be a violation of {article} "
            f"of the Indian Constitution — {right_name}.\n"
            "You have the right to approach the Karnataka High Court via a Public Interest Petition.\n"
            "1. Draft a petition describing the violation\n"
            "2. File at Karnataka High Court Registry, Bengaluru\n"
            "3. No lawyer required for PIL\n"
            "4. Filing fee: Rs.0 for public interest matters\n"
            "You can also file a complaint with the Karnataka Lokayukta."
        )

    life_event = None
    if "birth registration" in message.lower() or "birth certificate" in message.lower():
        life_event = "birth"
    elif "death registration" in message.lower() or "death certificate" in message.lower():
        life_event = "death"
    elif "marriage registration" in message.lower() or "marriage certificate" in message.lower():
        life_event = "marriage"
    elif message.strip().upper() == "YES":
        with connect_db() as conn:
            recent = conn.execute(
                "SELECT query_text FROM session_query_memory WHERE session_id=? ORDER BY timestamp DESC LIMIT 5",
                (req.session_id,),
            ).fetchall()
        joined = " ".join([r["query_text"].lower() for r in recent])
        if "birth" in joined:
            life_event = "birth"
        elif "death" in joined:
            life_event = "death"
        elif "marriage" in joined:
            life_event = "marriage"

    if life_event and message.strip().upper() != "YES":
        answer = (
            f"{answer}\n\nWould you like me to create a civic action timeline based on this event? "
            "It will show you every government service you'll need in the coming years. Reply YES to generate."
        )
    elif life_event and message.strip().upper() == "YES":
        prompt = (
            "You are a civic life planner for Karnataka, India.\n"
            f"A citizen in Belagavi just completed a {life_event} registration.\n"
            "Generate a complete civic reminder timeline — all government actions they will need to take in coming years.\n"
            "Return ONLY valid JSON:\n"
            "{timeline: [{age_or_date: string, action: string, department: string, documents_needed: [string], "
            "importance: 'critical'|'important'|'optional', deadline_strict: bool}]}"
        )
        try:
            timeline_resp = _cerebras_client().chat.completions.create(
                model="llama-3.3-70b",
                messages=[{"role": "system", "content": prompt}, {"role": "user", "content": req.message}],
                temperature=0.2,
            )
            payload = (timeline_resp.choices[0].message.content if timeline_resp.choices else "") or ""
            answer = f"{answer}\n\nYour Civic Life Roadmap:\n{payload}"
        except Exception:
            pass

    answer = append_verified_wisdom(answer, ward_number, category)

    try:
        corruption_signal_check(_cerebras_client(), message, ward_number, dept)
    except Exception:
        pass

    # If escalation is required but the model didn't include the escalation sentence, append it.
    if escalate and dept and contact:
        esc_line_en = f'I recommend confirming this with {dept} at {contact}.'
        esc_line_kn = f'ನಾನು ಇದನ್ನು {dept} ನಲ್ಲಿ {contact} ಮೂಲಕ ದೃಢಪಡಿಸಲು ಶಿಫಾರಸು ಮಾಡುತ್ತೇನೆ.'
        esc_line = esc_line_kn if req.language == "kn" else esc_line_en
        if esc_line not in answer:
            answer = f"{answer}\n\n{esc_line}"

    followups = _suggested_followups(category, req.language)
    action_cards = _action_cards_for(category, dept, contact)
    poverty_report = detect_poverty_indicators(req.session_id, message, _cerebras_client())
    if poverty_report:
        action_cards.append(
            {
                "label": f"Eligible schemes: {len(poverty_report.get('schemes', []))}",
                "type": "link",
                "url": None,
                "phone": None,
            }
        )
        answer = (
            f"{answer}\n\n🔴 Based on your queries, you may qualify for "
            f"{len(poverty_report.get('schemes', []))} government schemes worth "
            f"Rs.{int(poverty_report.get('total_potential_monthly_benefit', 0))}/month."
        )

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


@app.on_event("startup")
def startup_jobs() -> None:
    if not SCHEDULER.running:
        SCHEDULER.add_job(run_silence_detection_job, trigger="interval", hours=24, id="silence_job", replace_existing=True)
        SCHEDULER.start()


@app.on_event("shutdown")
def shutdown_jobs() -> None:
    if SCHEDULER.running:
        SCHEDULER.shutdown(wait=False)


@app.get("/admin/corruption-signals")
async def admin_corruption_signals() -> dict[str, Any]:
    with connect_db() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM corruption_signals ORDER BY timestamp DESC").fetchall()]
    return {"items": rows}


@app.patch("/admin/corruption-signals/{signal_id}/resolve")
async def resolve_corruption_signal(signal_id: int) -> dict[str, Any]:
    with connect_db() as conn:
        conn.execute("UPDATE corruption_signals SET resolved=1 WHERE id=?", (signal_id,))
        conn.commit()
    return {"ok": True}


@app.get("/admin/officer-accountability")
async def admin_officer_accountability() -> dict[str, Any]:
    with connect_db() as conn:
        rows = conn.execute(
            """
            SELECT department, COUNT(*) AS escalation_count
            FROM corruption_signals
            GROUP BY department
            """
        ).fetchall()
    counts = {r["department"]: int(r["escalation_count"]) for r in rows}
    services = []
    for svc in OFFICER_SERVICES:
        item = dict(svc)
        item["escalation_count"] = counts.get(item.get("department"), 0)
        services.append(item)
    return {"services": services}


@app.get("/admin/collective-grievances")
async def admin_collective_grievances() -> dict[str, Any]:
    with connect_db() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM collective_grievances ORDER BY complaint_count DESC").fetchall()]
    return {"items": rows}


@app.get("/admin/grievances/{grievance_id}/petition")
async def grievance_petition(grievance_id: int) -> dict[str, Any]:
    with connect_db() as conn:
        row = conn.execute("SELECT * FROM collective_grievances WHERE id=?", (grievance_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="grievance not found")
    text = (
        "GROUP PETITION - BELAGAVI CITY CORPORATION\n\n"
        f"Ward: {row['ward_number']}\nIssue: {row['issue_type']}\n"
        f"Total complaints: {row['complaint_count']}\n"
        f"First reported: {row['first_reported']}\nLatest reported: {row['last_reported']}\n\n"
        "Citizen evidence snippets:\n"
        f"{row['citizen_queries'] or ''}\n"
    )
    return {"petition_text": text}


@app.get("/admin/infrastructure-memory")
async def admin_infra_memory() -> dict[str, Any]:
    with connect_db() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM infrastructure_issues ORDER BY updated_at DESC").fetchall()]
    return {"items": rows}


@app.patch("/admin/infrastructure-memory/{issue_id}")
async def update_infra_issue(issue_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    allowed = {"status", "assigned_engineer", "expected_resolution"}
    sets: list[str] = []
    vals: list[Any] = []
    for key in allowed:
        if key in payload:
            sets.append(f"{key}=?")
            vals.append(payload[key])
    if not sets:
        return {"ok": True}
    sets.append("updated_at=?")
    vals.append(utc_now_iso())
    vals.append(issue_id)
    with connect_db() as conn:
        conn.execute(f"UPDATE infrastructure_issues SET {', '.join(sets)} WHERE id=?", tuple(vals))
        conn.commit()
    return {"ok": True}


@app.get("/admin/silence-patterns")
async def admin_silence_patterns() -> dict[str, Any]:
    with connect_db() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM silence_alerts ORDER BY flagged_at DESC").fetchall()]
    return {"items": rows}


@app.patch("/admin/silence-patterns/{alert_id}/ack")
async def ack_silence(alert_id: int) -> dict[str, Any]:
    with connect_db() as conn:
        conn.execute("UPDATE silence_alerts SET acknowledged=1 WHERE id=?", (alert_id,))
        conn.commit()
    return {"ok": True}


@app.post("/wisdom")
async def post_wisdom(payload: dict[str, Any]) -> dict[str, Any]:
    with connect_db() as conn:
        conn.execute(
            """
            INSERT INTO community_wisdom
            (contributor_name, contributor_age, ward_number, wisdom_text, category, verified, submitted_at, upvotes)
            VALUES (?, ?, ?, ?, ?, 0, ?, 0)
            """,
            (
                payload.get("contributor_name"),
                payload.get("contributor_age"),
                payload.get("ward_number"),
                payload.get("wisdom_text"),
                payload.get("category", "general"),
                utc_now_iso(),
            ),
        )
        conn.commit()
    return {"ok": True}


@app.get("/wisdom")
async def get_wisdom(ward: str | None = None) -> dict[str, Any]:
    with connect_db() as conn:
        if ward:
            rows = conn.execute(
                "SELECT * FROM community_wisdom WHERE verified=1 AND ward_number=? ORDER BY upvotes DESC, submitted_at DESC",
                (ward,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM community_wisdom WHERE verified=1 ORDER BY upvotes DESC, submitted_at DESC"
            ).fetchall()
    return {"items": [dict(r) for r in rows]}


@app.patch("/admin/wisdom/{wisdom_id}/verify")
async def verify_wisdom(wisdom_id: int) -> dict[str, Any]:
    with connect_db() as conn:
        row = conn.execute("SELECT * FROM community_wisdom WHERE id=?", (wisdom_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="wisdom not found")
        conn.execute("UPDATE community_wisdom SET verified=1 WHERE id=?", (wisdom_id,))
        conn.commit()
    return {"ok": True}


@app.get("/admin/rights-alerts")
async def admin_rights_alerts() -> dict[str, Any]:
    with connect_db() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM constitutional_alerts ORDER BY timestamp DESC").fetchall()]
    return {"items": rows}


@app.get("/admin/civic-twin")
async def admin_civic_twin() -> dict[str, Any]:
    ward_rows: list[dict[str, Any]] = []
    with connect_db() as conn:
        for ward_num, ward_info in WARD_DATA.items():
            water = conn.execute(
                "SELECT COUNT(*) AS c FROM infrastructure_issues WHERE ward_number=? AND issue_type='water' AND status='open'",
                (ward_num,),
            ).fetchone()["c"]
            corr = conn.execute(
                "SELECT COUNT(*) AS c FROM corruption_signals WHERE ward_number=?",
                (ward_num,),
            ).fetchone()["c"]
            coll = conn.execute(
                "SELECT COUNT(*) AS c FROM collective_grievances WHERE ward_number=? AND status='open'",
                (ward_num,),
            ).fetchone()["c"]
            silence = conn.execute(
                "SELECT COUNT(*) AS c FROM silence_alerts WHERE ward_number=? AND acknowledged=0",
                (ward_num,),
            ).fetchone()["c"]
            rights = conn.execute(
                "SELECT COUNT(*) AS c FROM constitutional_alerts WHERE ward_number=?",
                (ward_num,),
            ).fetchone()["c"]
            wisdom = conn.execute(
                "SELECT COUNT(*) AS c FROM community_wisdom WHERE ward_number=? AND verified=1",
                (ward_num,),
            ).fetchone()["c"]
            score = int(max(0, min(100, 100 - (water * 2) - (corr * 5) - (coll * 3) - (silence * 4) - (rights * 8) + (wisdom * 2))))
            ward_rows.append(
                {
                    "ward_number": ward_num,
                    "ward_name": ward_info.get("name"),
                    "water_complaints": water,
                    "corruption_signals_count": corr,
                    "collective_grievances_count": coll,
                    "silence_score": silence,
                    "constitutional_alerts": rights,
                    "community_wisdom_count": wisdom,
                    "health_score": score,
                }
            )
    city_avg = sum(w["health_score"] for w in ward_rows) / max(1, len(ward_rows))
    critical = min(ward_rows, key=lambda x: x["health_score"]) if ward_rows else None
    return {"city_health_score": round(city_avg, 2), "most_critical_ward": critical, "wards": ward_rows}


@app.get("/admin/reckoning-report")
async def admin_reckoning_report() -> dict[str, Any]:
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    with connect_db() as conn:
        top_dept = [
            dict(r)
            for r in conn.execute(
                """
                SELECT department, COUNT(*) AS count
                FROM corruption_signals
                WHERE timestamp>=?
                GROUP BY department
                ORDER BY count DESC
                LIMIT 3
                """,
                (since,),
            ).fetchall()
        ]
        top_ward = conn.execute(
            """
            SELECT ward_number, SUM(complaint_count) AS c
            FROM collective_grievances
            GROUP BY ward_number
            ORDER BY c DESC
            LIMIT 1
            """
        ).fetchone()
        unresolved_issue = conn.execute(
            """
            SELECT issue_type, COUNT(*) AS c
            FROM infrastructure_issues
            WHERE status!='resolved'
            GROUP BY issue_type
            ORDER BY c DESC
            LIMIT 1
            """
        ).fetchone()
        rights_count = conn.execute("SELECT COUNT(*) AS c FROM constitutional_alerts WHERE timestamp>=?", (since,)).fetchone()["c"]
        silence_rows = [dict(r) for r in conn.execute("SELECT * FROM silence_alerts WHERE flagged_at>=?", (since,)).fetchall()]
        longest = conn.execute(
            "SELECT query_text FROM queries WHERE timestamp>=? ORDER BY LENGTH(query_text) DESC LIMIT 1",
            (since,),
        ).fetchone()
    payload = {
        "headline": "Belagavi Civic Accountability Weekly",
        "most_failed_department": top_dept[0]["department"] if top_dept else "N/A",
        "most_suffering_ward": (top_ward["ward_number"] if top_ward else "N/A"),
        "corruption_summary": f"Top departments: {top_dept}",
        "silence_zones_summary": f"Silence alerts: {len(silence_rows)}",
        "constitutional_violations_summary": f"Rights alerts in 7 days: {rights_count}",
        "citizen_story_of_week": (longest["query_text"] if longest else "N/A"),
        "full_report_text": (
            f"Top corruption departments: {top_dept}. "
            f"Ward with highest complaints: {(top_ward['ward_number'] if top_ward else 'N/A')}. "
            f"Most common unresolved issue: {(unresolved_issue['issue_type'] if unresolved_issue else 'N/A')}."
        ),
        "severity_rating": "CRITICAL" if rights_count > 10 else "SERIOUS" if rights_count > 4 else "MODERATE",
        "generated_at": utc_now_iso(),
    }
    with connect_db() as conn:
        conn.execute("INSERT INTO reckoning_reports (generated_at, payload_json) VALUES (?, ?)", (utc_now_iso(), json.dumps(payload)))
        archived = [
            {"generated_at": r["generated_at"], **json.loads(r["payload_json"])}
            for r in conn.execute(
                "SELECT generated_at, payload_json FROM reckoning_reports ORDER BY generated_at DESC LIMIT 4"
            ).fetchall()
        ]
        conn.commit()
    return {"report": payload, "archive": archived}

