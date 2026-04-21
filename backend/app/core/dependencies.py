from functools import lru_cache

from app.agents.coordinator.workflow import CoordinatorWorkflow
from app.memory.mempalace_store import MemPalaceStore
from app.memory.provider import MemoryProvider


@lru_cache
def get_coordinator_workflow() -> CoordinatorWorkflow:
    return CoordinatorWorkflow(get_memory_provider())


@lru_cache
def get_mempalace_store() -> MemPalaceStore:
    return MemPalaceStore()


@lru_cache
def get_memory_provider() -> MemoryProvider:
    return MemoryProvider(get_mempalace_store())
