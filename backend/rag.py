from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer


KB_FILENAME = "knowledge_base.json"
DEFAULT_COLLECTION = "civicbot_kb"
DEFAULT_DB_DIR = Path(__file__).resolve().parent / "chroma_db"
EMBED_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


@dataclass(frozen=True)
class RetrievedChunk:
    entry: dict[str, Any]
    score: float


def _kb_path() -> Path:
    return Path(__file__).resolve().parent / KB_FILENAME


def _load_kb() -> list[dict[str, Any]]:
    path = _kb_path()
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("knowledge_base.json must be a JSON array")
    return data


def _kb_fingerprint(entries: list[dict[str, Any]]) -> str:
    # Stable fingerprint so we can detect changes across restarts.
    normalized = json.dumps(entries, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(normalized).hexdigest()


def _build_doc(entry: dict[str, Any]) -> str:
    q = (entry.get("question") or "").strip()
    a = (entry.get("answer") or "").strip()
    cat = (entry.get("category") or "").strip()
    dept = (entry.get("department") or "").strip()
    keywords = entry.get("keywords") or []
    if not isinstance(keywords, list):
        keywords = []
    kw = ", ".join([str(x) for x in keywords if x])
    # Single string used for embedding.
    return f"Category: {cat}\nDepartment: {dept}\nKeywords: {kw}\nQ: {q}\nA: {a}".strip()


class RAGIndex:
    def __init__(
        self,
        *,
        persist_dir: Path = DEFAULT_DB_DIR,
        collection_name: str = DEFAULT_COLLECTION,
        embed_model_name: str = EMBED_MODEL_NAME,
    ) -> None:
        self.persist_dir = Path(persist_dir)
        self.persist_dir.mkdir(parents=True, exist_ok=True)

        self._client = chromadb.PersistentClient(
            path=str(self.persist_dir),
            settings=Settings(anonymized_telemetry=False),
        )
        self._collection = self._client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

        self._model = SentenceTransformer(embed_model_name)

        self._entries = _load_kb()
        self._kb_hash = _kb_fingerprint(self._entries)
        self._ensure_indexed()

    @property
    def kb_entries_count(self) -> int:
        return len(self._entries)

    def _ensure_indexed(self) -> None:
        meta = self._collection.get(include=["metadatas"], limit=1)
        existing_hash = None
        if meta and meta.get("metadatas"):
            existing_hash = meta["metadatas"][0].get("kb_hash")

        # If hash matches and collection has expected size, keep it.
        try:
            existing_count = self._collection.count()
        except Exception:
            existing_count = 0

        if existing_hash == self._kb_hash and existing_count >= len(self._entries):
            return

        # Rebuild index when KB changes or index is missing/incomplete.
        self._rebuild_collection()

    def _rebuild_collection(self) -> None:
        # Best-effort delete; if collection doesn't exist, ignore.
        name = self._collection.name
        try:
            self._client.delete_collection(name)
        except Exception:
            pass

        self._collection = self._client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )

        ids: list[str] = []
        documents: list[str] = []
        metadatas: list[dict[str, Any]] = []
        for entry in self._entries:
            entry_id = str(entry.get("id") or "").strip()
            if not entry_id:
                # Ensure id exists and is stable even if missing in KB.
                entry_id = hashlib.md5(
                    json.dumps(entry, ensure_ascii=False, sort_keys=True).encode("utf-8")
                ).hexdigest()
                entry["id"] = entry_id
            ids.append(entry_id)
            documents.append(_build_doc(entry))
            metadatas.append(
                {
                    "id": entry_id,
                    "category": entry.get("category"),
                    "department": entry.get("department"),
                    "contact": entry.get("contact"),
                    "fee": entry.get("fee"),
                    "timeline": entry.get("timeline"),
                    "kb_hash": self._kb_hash,
                }
            )

        embeddings = self._model.encode(documents, normalize_embeddings=True).tolist()
        self._collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )

    def retrieve(self, query: str, top_k: int = 3) -> list[dict[str, Any]]:
        query = (query or "").strip()
        if not query:
            return []

        q_emb = self._model.encode([query], normalize_embeddings=True).tolist()
        res = self._collection.query(
            query_embeddings=q_emb,
            n_results=max(1, int(top_k)),
            include=["metadatas", "distances", "documents", "ids"],
        )
        ids = (res.get("ids") or [[]])[0]
        metadatas = (res.get("metadatas") or [[]])[0]
        distances = (res.get("distances") or [[]])[0]

        out: list[dict[str, Any]] = []
        for idx, entry_id in enumerate(ids):
            meta = metadatas[idx] if idx < len(metadatas) else {}
            distance = float(distances[idx]) if idx < len(distances) else 1.0
            score = max(0.0, min(1.0, 1.0 - distance))  # cosine distance -> similarity
            # Map back to original KB entry.
            entry = next((e for e in self._entries if str(e.get("id")) == str(entry_id)), None)
            if not entry:
                entry = {"id": entry_id, **(meta or {})}
            out.append({"entry": entry, "score": score})
        return out


def get_confidence(scores: list[float]) -> float:
    if not scores:
        return 0.0
    best = max(float(s) for s in scores)
    if best != best:  # NaN guard
        return 0.0
    return max(0.0, min(1.0, best))


_INDEX: RAGIndex | None = None


def get_index() -> RAGIndex:
    global _INDEX
    if _INDEX is None:
        # Allow override in deployments
        persist_dir = Path(os.getenv("CHROMA_PERSIST_DIR", str(DEFAULT_DB_DIR)))
        _INDEX = RAGIndex(persist_dir=persist_dir)
    return _INDEX


def retrieve(query: str, top_k: int = 3) -> list[dict[str, Any]]:
    return get_index().retrieve(query, top_k=top_k)

