from langgraph.graph import END, START, StateGraph

from app.agents.shared.state import AcademicState
from app.agents.flashcard.nodes import FlashcardNodes
from app.memory.provider import MemoryProvider
from app.services.llm import LLMService


class FlashcardAgent:
    def __init__(self, llm_service: LLMService, memory_provider: MemoryProvider) -> None:
        self.nodes = FlashcardNodes(llm_service, memory_provider)
        self.graph = self._create_subgraph()

    def _create_subgraph(self):
        graph = StateGraph(AcademicState)
        graph.add_node("generate_flashcards", self.nodes.generate_flashcards)
        graph.add_edge(START, "generate_flashcards")
        graph.add_edge("generate_flashcards", END)
        return graph.compile()

    async def __call__(self, state: AcademicState) -> AcademicState:
        return await self.graph.ainvoke(state)
