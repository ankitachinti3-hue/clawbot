from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path


DB_PATH = Path(__file__).resolve().parent / "civicbot_analytics.db"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_all_tables() -> None:
    with connect_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS queries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              query_text TEXT NOT NULL,
              response_text TEXT,
              category TEXT NOT NULL,
              confidence REAL NOT NULL,
              escalated INTEGER NOT NULL,
              timestamp TEXT NOT NULL,
              language TEXT NOT NULL
            )
            """
        )
        # Backward-compatible migration for existing databases.
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(queries)").fetchall()}
        if "response_text" not in cols:
            conn.execute("ALTER TABLE queries ADD COLUMN response_text TEXT")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS corruption_signals (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              timestamp TEXT NOT NULL,
              ward_number TEXT,
              department TEXT,
              query_text TEXT NOT NULL,
              signal_strength TEXT NOT NULL,
              resolved INTEGER DEFAULT 0
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS collective_grievances (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ward_number TEXT,
              issue_type TEXT,
              complaint_count INTEGER DEFAULT 1,
              first_reported TEXT NOT NULL,
              last_reported TEXT NOT NULL,
              status TEXT DEFAULT 'open',
              assigned_engineer TEXT,
              expected_resolution TEXT,
              citizen_queries TEXT
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS infrastructure_issues (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ward_number TEXT,
              issue_type TEXT,
              description TEXT,
              reported_count INTEGER DEFAULT 1,
              status TEXT DEFAULT 'open',
              assigned_engineer TEXT,
              expected_resolution TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS query_volume_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ward_number TEXT,
              issue_type TEXT,
              week_number INTEGER NOT NULL,
              year INTEGER NOT NULL,
              query_count INTEGER DEFAULT 0,
              UNIQUE(ward_number, issue_type, week_number, year)
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS silence_alerts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ward_number TEXT,
              issue_type TEXT,
              previous_avg REAL NOT NULL,
              current_count INTEGER NOT NULL,
              flagged_at TEXT NOT NULL,
              acknowledged INTEGER DEFAULT 0
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS community_wisdom (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              contributor_name TEXT NOT NULL,
              contributor_age INTEGER,
              ward_number TEXT,
              wisdom_text TEXT NOT NULL,
              category TEXT,
              verified INTEGER DEFAULT 0,
              submitted_at TEXT NOT NULL,
              upvotes INTEGER DEFAULT 0
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS constitutional_alerts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              article TEXT NOT NULL,
              right_name TEXT NOT NULL,
              ward_number TEXT,
              query_text TEXT NOT NULL,
              timestamp TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ward_health_scores (
              ward_number TEXT PRIMARY KEY,
              ward_name TEXT,
              water_complaints INTEGER DEFAULT 0,
              corruption_signals_count INTEGER DEFAULT 0,
              collective_grievances_count INTEGER DEFAULT 0,
              silence_score INTEGER DEFAULT 0,
              constitutional_alerts INTEGER DEFAULT 0,
              community_wisdom_count INTEGER DEFAULT 0,
              health_score INTEGER DEFAULT 100,
              last_updated TEXT
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS session_query_memory (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              query_text TEXT NOT NULL,
              timestamp TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reckoning_reports (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              generated_at TEXT NOT NULL,
              payload_json TEXT NOT NULL
            )
            """
        )

        conn.execute("CREATE INDEX IF NOT EXISTS idx_queries_ts ON queries(timestamp)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_queries_cat ON queries(category)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_corruption_ts ON corruption_signals(timestamp)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_collective_status ON collective_grievances(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_infra_status ON infrastructure_issues(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_silence_ack ON silence_alerts(acknowledged)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_wisdom_verified ON community_wisdom(verified)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_session_query_mem ON session_query_memory(session_id, timestamp)")
        conn.commit()
