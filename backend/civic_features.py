from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from openai import OpenAI

from db_init import connect_db, utc_now_iso


WARD_DATA_PATH = Path(__file__).resolve().parent / "ward_data.json"
OFFICER_DATA_PATH = Path(__file__).resolve().parent / "officer_data.json"
KB_PATH = Path(__file__).resolve().parent / "knowledge_base.json"

POVERTY_KEYWORDS = [
    "pmay",
    "bpl",
    "ration card",
    "scholarship",
    "unemployment",
    "pension",
    "anganwadi",
    "housing scheme",
    "free electricity",
    "disability benefit",
    "widow pension",
    "old age pension",
    "sc/st scheme",
    "minority scheme",
]

COMPLAINT_ISSUES = {
    "drainage": ["drain", "drainage", "sewer"],
    "pothole": ["pothole", "road damage", "road broken"],
    "garbage": ["garbage", "waste", "swm", "trash"],
    "water": ["water", "supply", "pipeline", "tap water"],
    "lighting": ["streetlight", "light", "pole light"],
}

CONSTITUTION_THRESHOLDS = [
    ("water supply cut", "Article 21", "Right to Life"),
    ("demolition without notice", "Article 300A", "Right to Property"),
    ("birth certificate denied", "Article 21", "Right to Life"),
    ("ration card denied", "Article 14", "Right to Equality"),
    ("school admission denied due to caste", "Article 15", "Prohibition of discrimination"),
]


def _safe_json(text: str) -> dict[str, Any] | None:
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"\{.*\}", text or "", flags=re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def call_cerebras_json(
    client: OpenAI,
    system_prompt: str,
    user_content: str,
    model: str = "llama-3.3-70b",
) -> dict[str, Any] | None:
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_content}],
            temperature=0.1,
        )
        content = (((resp.choices or [None])[0]).message.content if (resp.choices or [None])[0] else "") or ""
        return _safe_json(content)
    except Exception:
        return None


def load_ward_data() -> dict[str, Any]:
    if not WARD_DATA_PATH.exists():
        return {}
    try:
        return json.loads(WARD_DATA_PATH.read_text(encoding="utf-8")).get("ward_data", {})
    except Exception:
        return {}


def load_officer_data() -> list[dict[str, Any]]:
    if not OFFICER_DATA_PATH.exists():
        return []
    try:
        return json.loads(OFFICER_DATA_PATH.read_text(encoding="utf-8")).get("services", [])
    except Exception:
        return []


def detect_ward_from_text(text: str, ward_data: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    q = (text or "").lower()
    ward_match = re.search(r"\bward\s*(\d{1,2})\b", q)
    if ward_match:
        ward_num = ward_match.group(1)
        if ward_num in ward_data:
            return ward_num, ward_data[ward_num]

    for ward_num, info in ward_data.items():
        name = str(info.get("name", "")).lower()
        if name and name in q:
            return ward_num, info
        for loc in info.get("localities", []) or []:
            if str(loc).lower() in q:
                return ward_num, info
    return None, None


def append_verified_wisdom(answer: str, ward_number: str | None, category: str) -> str:
    if not ward_number:
        return answer
    with connect_db() as conn:
        row = conn.execute(
            """
            SELECT wisdom_text
            FROM community_wisdom
            WHERE verified=1 AND ward_number=? AND (category=? OR category='general')
            ORDER BY upvotes DESC, submitted_at DESC
            LIMIT 1
            """,
            (ward_number, category),
        ).fetchone()
    if not row:
        return answer
    return f"{answer}\n\n💡 Local tip from a Belagavi resident: {row['wisdom_text']}"


def corruption_signal_check(client: OpenAI, query_text: str, ward_number: str | None, department: str | None) -> None:
    prompt = (
        "You are a corruption signal detector for an Indian municipal chatbot.\n"
        "Given a citizen message, determine if it contains any hint of bribery,\n"
        "unofficial payments, or corruption — including indirect hints like\n"
        "'nothing moves without', 'chai paani', 'ghoos', 'pay extra',\n"
        "'officer demanding', 'asked me to come back', 'they want something'.\n"
        "Return ONLY valid JSON, no explanation:\n"
        "{detected: bool, signal_strength: 'low'|'medium'|'high', department_hint: string, explanation: string}"
    )
    data = call_cerebras_json(client, prompt, query_text)
    if not data or not data.get("detected"):
        return
    strength = str(data.get("signal_strength", "low")).lower()
    if strength not in {"low", "medium", "high"}:
        strength = "low"
    dep = data.get("department_hint") or department or "unknown"
    with connect_db() as conn:
        conn.execute(
            """
            INSERT INTO corruption_signals (timestamp, ward_number, department, query_text, signal_strength, resolved)
            VALUES (?, ?, ?, ?, ?, 0)
            """,
            (utc_now_iso(), ward_number, dep, query_text, strength),
        )
        conn.commit()


def classify_issue_type(text: str) -> str | None:
    t = (text or "").lower()
    for issue, tokens in COMPLAINT_ISSUES.items():
        if any(tok in t for tok in tokens):
            return issue
    return None


def upsert_query_volume(ward_number: str | None, issue_type: str | None) -> None:
    if not ward_number or not issue_type:
        return
    now = datetime.now(timezone.utc)
    week_num = int(now.strftime("%V"))
    year = now.year
    with connect_db() as conn:
        conn.execute(
            """
            INSERT INTO query_volume_log (ward_number, issue_type, week_number, year, query_count)
            VALUES (?, ?, ?, ?, 1)
            ON CONFLICT(ward_number, issue_type, week_number, year)
            DO UPDATE SET query_count = query_count + 1
            """,
            (ward_number, issue_type, week_num, year),
        )
        conn.commit()


def handle_infrastructure_memory(
    ward_number: str | None,
    issue_type: str | None,
    query_text: str,
) -> str | None:
    if not ward_number or not issue_type:
        return None
    with connect_db() as conn:
        open_issue = conn.execute(
            """
            SELECT * FROM infrastructure_issues
            WHERE ward_number=? AND issue_type=? AND status='open'
            ORDER BY updated_at DESC LIMIT 1
            """,
            (ward_number, issue_type),
        ).fetchone()
        if open_issue:
            conn.execute(
                "UPDATE infrastructure_issues SET reported_count=reported_count+1, updated_at=? WHERE id=?",
                (utc_now_iso(), open_issue["id"]),
            )
            conn.commit()
            return (
                f"We are aware of this issue in your area. It has been reported {open_issue['reported_count'] + 1} times. "
                f"Assigned to: {open_issue['assigned_engineer'] or 'Ward engineer'}. "
                f"Expected fix by: {open_issue['expected_resolution'] or 'to be announced'}. "
                "Your report has been noted."
            )

        ts = utc_now_iso()
        conn.execute(
            """
            INSERT INTO infrastructure_issues
            (ward_number, issue_type, description, reported_count, status, assigned_engineer, expected_resolution, created_at, updated_at)
            VALUES (?, ?, ?, 1, 'open', 'Ward engineer', ?, ?, ?)
            """,
            (ward_number, issue_type, query_text, (datetime.now() + timedelta(days=7)).date().isoformat(), ts, ts),
        )
        conn.commit()
    return None


def handle_collective_grievance(
    ward_number: str | None,
    issue_type: str | None,
    query_text: str,
) -> str | None:
    if not ward_number or not issue_type:
        return None
    with connect_db() as conn:
        row = conn.execute(
            """
            SELECT * FROM collective_grievances
            WHERE ward_number=? AND issue_type=? AND status='open'
            ORDER BY last_reported DESC LIMIT 1
            """,
            (ward_number, issue_type),
        ).fetchone()
        if row:
            updated_q = (row["citizen_queries"] or "") + f"\n- {query_text}"
            count = int(row["complaint_count"]) + 1
            conn.execute(
                """
                UPDATE collective_grievances
                SET complaint_count=?, last_reported=?, citizen_queries=?
                WHERE id=?
                """,
                (count, utc_now_iso(), updated_q, row["id"]),
            )
            conn.commit()
            return (
                f"We already have {count} complaints about this in your area. This is a known issue. "
                f"Assigned engineer: {row['assigned_engineer'] or 'Ward engineer'}. "
                f"Expected resolution: {row['expected_resolution'] or 'in progress'}. "
                "Your complaint has been added."
            )
        ts = utc_now_iso()
        conn.execute(
            """
            INSERT INTO collective_grievances
            (ward_number, issue_type, complaint_count, first_reported, last_reported, status, assigned_engineer, expected_resolution, citizen_queries)
            VALUES (?, ?, 1, ?, ?, 'open', 'Ward engineer', ?, ?)
            """,
            (ward_number, issue_type, ts, ts, (datetime.now() + timedelta(days=5)).date().isoformat(), f"- {query_text}"),
        )
        conn.commit()
    return None


def detect_poverty_indicators(session_id: str, query_text: str, client: OpenAI) -> dict[str, Any] | None:
    with connect_db() as conn:
        conn.execute(
            "INSERT INTO session_query_memory (session_id, query_text, timestamp) VALUES (?, ?, ?)",
            (session_id, query_text, utc_now_iso()),
        )
        rows = conn.execute(
            "SELECT query_text FROM session_query_memory WHERE session_id=? ORDER BY timestamp DESC LIMIT 30",
            (session_id,),
        ).fetchall()
        conn.commit()

    combined = " ".join(r["query_text"] for r in rows).lower()
    hit_count = sum(1 for k in POVERTY_KEYWORDS if k in combined)
    if hit_count < 2:
        return None
    prompt = (
        "You are a Karnataka government welfare expert.\n"
        "Based on these citizen queries showing poverty indicators:\n"
        "{session_queries}\n"
        "Generate a Full Entitlement Report — every central + state + municipal scheme this citizen likely qualifies for in Belagavi.\n"
        "Return ONLY valid JSON:\n"
        "{schemes: [{name, eligibility_criteria, how_to_apply, documents_needed, office_location, deadline_if_any, monthly_benefit_amount}],\n"
        "priority_order: [scheme names, easiest first], total_potential_monthly_benefit: number}"
    )
    data = call_cerebras_json(client, prompt, combined)
    if not data:
        return None
    data["type"] = "poverty_report"
    return data


def detect_constitutional_alert(query_text: str, ward_number: str | None) -> tuple[str, str] | None:
    q = (query_text or "").lower()
    for phrase, article, right_name in CONSTITUTION_THRESHOLDS:
        if phrase in q:
            with connect_db() as conn:
                conn.execute(
                    """
                    INSERT INTO constitutional_alerts (article, right_name, ward_number, query_text, timestamp)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (article, right_name, ward_number, query_text, utc_now_iso()),
                )
                conn.commit()
            return article, right_name
    return None


def find_sakala_service(query_text: str, services: list[dict[str, Any]]) -> dict[str, Any] | None:
    q = (query_text or "").lower()
    for svc in services:
        name = str(svc.get("service_name", "")).lower()
        if name and name in q:
            return svc
    return None


def run_silence_detection_job() -> None:
    now = datetime.now(timezone.utc)
    week_num = int(now.strftime("%V"))
    year = now.year
    with connect_db() as conn:
        rows = conn.execute(
            """
            SELECT ward_number, issue_type, query_count
            FROM query_volume_log
            WHERE week_number=? AND year=?
            """,
            (week_num, year),
        ).fetchall()
        for row in rows:
            ward = row["ward_number"]
            issue = row["issue_type"]
            current = int(row["query_count"])
            hist = conn.execute(
                """
                SELECT AVG(query_count) AS avg_q
                FROM query_volume_log
                WHERE ward_number=? AND issue_type=?
                  AND NOT (week_number=? AND year=?)
                ORDER BY year DESC, week_number DESC
                LIMIT 4
                """,
                (ward, issue, week_num, year),
            ).fetchone()
            avg_q = float(hist["avg_q"] or 0)
            if avg_q > 5 and current < (0.2 * avg_q):
                conn.execute(
                    """
                    INSERT INTO silence_alerts (ward_number, issue_type, previous_avg, current_count, flagged_at, acknowledged)
                    VALUES (?, ?, ?, ?, ?, 0)
                    """,
                    (ward, issue, avg_q, current, utc_now_iso()),
                )
        conn.commit()

