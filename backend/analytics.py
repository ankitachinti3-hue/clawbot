from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from db_init import connect_db, init_all_tables, utc_now_iso

init_all_tables()


def log_query(
    session_id: str,
    query_text: str,
    response_text: str,
    category: str,
    confidence: float,
    escalated: bool,
    language: str,
) -> None:
    ts = utc_now_iso()
    with connect_db() as conn:
        conn.execute(
            """
            INSERT INTO queries (session_id, query_text, response_text, category, confidence, escalated, timestamp, language)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                query_text,
                response_text,
                category,
                float(confidence),
                1 if escalated else 0,
                ts,
                language,
            ),
        )
        conn.commit()


def get_analytics() -> dict[str, Any]:
    with connect_db() as conn:
        total = conn.execute("SELECT COUNT(*) AS c FROM queries").fetchone()["c"]
        unanswered = conn.execute(
            "SELECT COUNT(*) AS c FROM queries WHERE confidence < 0.4"
        ).fetchone()["c"]
        unanswered_rate = (unanswered / total) if total else 0.0

        top_categories = [
            dict(r)
            for r in conn.execute(
                """
                SELECT category, COUNT(*) AS count
                FROM queries
                GROUP BY category
                ORDER BY count DESC
                LIMIT 5
                """
            ).fetchall()
        ]

        now = datetime.now(timezone.utc)
        start = now - timedelta(hours=24)

        rows = conn.execute(
            """
            SELECT substr(timestamp, 1, 13) AS hour_bucket, COUNT(*) AS count
            FROM queries
            WHERE timestamp >= ?
            GROUP BY hour_bucket
            ORDER BY hour_bucket ASC
            """,
            (start.isoformat(),),
        ).fetchall()

        count_by_bucket = {r["hour_bucket"]: r["count"] for r in rows}

        # Fill missing buckets for a stable chart (last 24 hours).
        buckets: list[dict[str, Any]] = []
        for i in range(24):
            t = (start + timedelta(hours=i + 1)).replace(minute=0, second=0, microsecond=0)
            key = t.isoformat()[:13]
            buckets.append(
                {
                    "hour": t.strftime("%H:00"),
                    "count": int(count_by_bucket.get(key, 0)),
                    "timestamp": t.isoformat(),
                }
            )

        recent_queries = [
            {
                "session_id": r["session_id"],
                "query_text": r["query_text"],
                "category": r["category"],
                "confidence": r["confidence"],
                "escalated": bool(r["escalated"]),
                "timestamp": r["timestamp"],
                "language": r["language"],
            }
            for r in conn.execute(
                """
                SELECT session_id, query_text, category, confidence, escalated, timestamp, language
                FROM queries
                ORDER BY timestamp DESC
                LIMIT 10
                """
            ).fetchall()
        ]

        return {
            "total_queries": int(total),
            "unanswered_rate": float(unanswered_rate),
            "top_categories": top_categories,
            "queries_by_hour": buckets,
            "recent_queries": recent_queries,
        }

