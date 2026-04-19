from typing import List

from app.core.config import get_settings
from app.memory.mempalace_store import MemPalaceStore, MemoryStoreError


class MemoryProvider:
    def __init__(self, store: MemPalaceStore) -> None:
        self._store = store
        self._settings = get_settings()

    def write_memory(self, user_id: str, memory_type: str, content: str) -> None:
        try:
            self._store.store(user_id=user_id, memory_type=memory_type, content=content)
        except MemoryStoreError:
            # Keep agent flow resilient; API callers should use write_memory_result.
            return

    def read_memory(
        self,
        user_id: str,
        memory_type: str,
        query: str,
        k: int | None = None,
    ) -> List[str]:
        try:
            top_k = k if k is not None else self._settings.memory_top_k
            results = self._store.retrieve(user_id=user_id, memory_type=memory_type, k=top_k, query=query)
            return [m[:200] for m in results]
        except MemoryStoreError:
            # Keep agent flow resilient; API callers should use read_memory_result.
            return []

    def write_memory_result(self, user_id: str, memory_type: str, content: str) -> dict:
        try:
            self._store.store(user_id=user_id, memory_type=memory_type, content=content)
            return {"status": "success"}
        except MemoryStoreError as exc:
            return {"status": "error", "error": str(exc)}

    def read_memory_result(
        self,
        user_id: str,
        memory_type: str,
        query: str,
        k: int | None = None,
    ) -> dict:
        try:
            top_k = k if k is not None else self._settings.memory_top_k
            memories = self._store.retrieve(
                user_id=user_id,
                memory_type=memory_type,
                k=top_k,
                query=query,
            )
            return {"status": "success", "memories": memories}
        except MemoryStoreError as exc:
            return {"status": "error", "memories": [], "error": str(exc)}
