from langgraph.graph import END, START, StateGraph

from app.agents.shared.state import AcademicState
from app.agents.summarizer.nodes import SummarizerNodes
from app.memory.provider import MemoryProvider
from app.memory.provider import MemoryProvider


class SummarizerAgent:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.nodes = SummarizerNodes(memory_provider)
        self.graph = self._create_subgraph()

    def _create_subgraph(self):
        graph = StateGraph(AcademicState)
        graph.add_node("summarize", self.nodes.summarize)
        graph.add_edge(START, "summarize")
        graph.add_edge("summarize", END)
        return graph.compile()

    async def __call__(self, state: AcademicState) -> AcademicState:
        return await self.graph.ainvoke(state)
