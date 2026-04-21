from langgraph.graph import END, START, StateGraph

from app.agents.shared.state import AcademicState
from app.agents.quiz.nodes import QuizNodes
from app.memory.provider import MemoryProvider


class QuizAgent:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.nodes = QuizNodes(memory_provider)
        self.graph = self._create_subgraph()

    def _create_subgraph(self):
        graph = StateGraph(AcademicState)
        graph.add_node("generate_quiz", self.nodes.generate_quiz)
        graph.add_edge(START, "generate_quiz")
        graph.add_edge("generate_quiz", END)
        return graph.compile()

    async def __call__(self, state: AcademicState) -> AcademicState:
        return await self.graph.ainvoke(state)
