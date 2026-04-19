import os
import uuid
from typing import List

import chromadb

from app.core.config import get_settings


class MemoryStoreError(Exception):
    pass


class MemPalaceStore:
    def __init__(self) -> None:
        settings = get_settings()
        self._base_collection = settings.mempalace_collection
        self._client = chromadb.PersistentClient(path=os.path.expanduser(settings.mempalace_path))

    def _collection_name(self, user_id: str) -> str:
        return f"{self._base_collection}_{user_id}"

    def store(self, user_id: str, memory_type: str, content: str) -> None:
        try:
            collection = self._client.get_or_create_collection(self._collection_name(user_id))
            memory_id = f"{memory_type}_{uuid.uuid4().hex}"
            collection.upsert(
                documents=[content],
                ids=[memory_id],
                metadatas=[{"user_id": user_id, "memory_type": memory_type}],
            )
        except Exception as exc:
            raise MemoryStoreError("Failed to store memory.") from exc

    def retrieve(self, user_id: str, memory_type: str, k: int, query: str) -> List[str]:
        try:
            collection = self._client.get_collection(self._collection_name(user_id))
        except Exception:
            return []

        try:
            results = collection.query(
                query_texts=[query],
                n_results=k,
                where={"memory_type": memory_type},
                include=["documents"],
            )
            docs = results.get("documents", [[]])
            return docs[0] if docs and docs[0] else []
        except Exception as exc:
            raise MemoryStoreError("Failed to retrieve memories.") from exc
