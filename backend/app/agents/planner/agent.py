from langgraph.graph import END, START, StateGraph

from app.memory.provider import MemoryProvider
from app.agents.planner.nodes import PlannerNodes
from app.agents.shared.state import AcademicState
from app.services.llm import LLMService


class PlannerAgent:
    def __init__(self, llm_service: LLMService, memory_provider: MemoryProvider) -> None:
        self.nodes = PlannerNodes(llm_service, memory_provider)
        self.graph = self._create_subgraph()

    def _create_subgraph(self):
        graph = StateGraph(AcademicState)
        graph.add_node("calendar_analyzer", self.nodes.calendar_analyzer)
        graph.add_node("task_analyzer", self.nodes.task_analyzer)
        graph.add_node("plan_generator", self.nodes.plan_generator)
        graph.add_edge(START, "calendar_analyzer")
        graph.add_edge("calendar_analyzer", "task_analyzer")
        graph.add_edge("task_analyzer", "plan_generator")
        graph.add_edge("plan_generator", END)
        return graph.compile()

    async def __call__(self, state: AcademicState) -> AcademicState:
        return await self.graph.ainvoke(state)
