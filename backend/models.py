from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User message")
    language: Literal["en", "kn"] = Field("en", description="Response language: en or kn")
    session_id: str = Field(..., min_length=1, description="Client session id")


class ActionCard(BaseModel):
    label: str = Field(..., min_length=1)
    type: str = Field(..., min_length=1, description="download | pay | call | link")
    url: str | None = None
    phone: str | None = None


class QueryResponse(BaseModel):
    answer: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    category: str
    escalate: bool
    department: str | None = None
    contact: str | None = None
    action_cards: list[ActionCard] = Field(default_factory=list)
    suggested_followups: list[str] = Field(default_factory=list)


class AnalyticsResponse(BaseModel):
    top_categories: list[dict[str, Any]]
    unanswered_rate: float
    total_queries: int
    queries_by_hour: list[dict[str, Any]]
    recent_queries: list[dict[str, Any]]

