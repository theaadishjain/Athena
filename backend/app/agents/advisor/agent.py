from langgraph.graph import END, START, StateGraph

from app.agents.advisor.nodes import AdvisorNodes
from app.agents.shared.state import AcademicState
from app.memory.provider import MemoryProvider
from app.services.llm import LLMService


class AdvisorAgent:
    def __init__(self, llm_service: LLMService, memory_provider: MemoryProvider) -> None:
        self.nodes = AdvisorNodes(llm_service, memory_provider)
        self.graph = self._create_subgraph()

    def _create_subgraph(self):
        graph = StateGraph(AcademicState)
        graph.add_node("advisor_analyze", self.nodes.analyze_situation)
        graph.add_node("advisor_generate", self.nodes.generate_guidance)
        graph.add_edge(START, "advisor_analyze")
        graph.add_edge("advisor_analyze", "advisor_generate")
        graph.add_edge("advisor_generate", END)
        return graph.compile()

    async def __call__(self, state: AcademicState) -> AcademicState:
        return await self.graph.ainvoke(state)
