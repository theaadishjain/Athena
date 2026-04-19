from typing import Literal

from langgraph.graph import END, START, StateGraph

from app.agents.advisor.agent import AdvisorAgent
from app.agents.coordinator.router import detect_intent
from app.agents.planner.agent import PlannerAgent
from app.agents.shared.executor import AgentExecutor
from app.agents.shared.state import AcademicState
from app.agents.summarizer.agent import SummarizerAgent
from app.memory.provider import MemoryProvider
from app.services.llm import LLMService

RouteLiteral = Literal["planner", "summarizer", "advisor", "coordinator", "flashcard"]


from app.agents.flashcard.agent import FlashcardAgent

class CoordinatorWorkflow:
    def __init__(self, llm_service: LLMService, memory_provider: MemoryProvider) -> None:
        self.executor = AgentExecutor()
        self.planner_agent = PlannerAgent(llm_service, memory_provider)
        self.summarizer_agent = SummarizerAgent(llm_service, memory_provider)
        self.advisor_agent = AdvisorAgent(llm_service, memory_provider)
        self.flashcard_agent = FlashcardAgent(llm_service, memory_provider)
        self.graph = self._create_graph()

    async def coordinator(self, state: AcademicState) -> AcademicState:
        if state["intent"] == "coordinator":
            state["intent"] = detect_intent(state["input"])
        return state

    async def run_planner(self, state: AcademicState) -> AcademicState:
        state["intent"] = "planner"
        return await self.executor.run(state, self.planner_agent)

    async def run_summarizer(self, state: AcademicState) -> AcademicState:
        state["intent"] = "summarizer"
        return await self.executor.run(state, self.summarizer_agent)

    async def run_advisor(self, state: AcademicState) -> AcademicState:
        state["intent"] = "advisor"
        return await self.executor.run(state, self.advisor_agent)

    async def run_flashcard(self, state: AcademicState) -> AcademicState:
        state["intent"] = "flashcard"
        return await self.executor.run(state, self.flashcard_agent)

    def route(self, state: AcademicState) -> RouteLiteral:
        if state["intent"] in ("planner", "summarizer", "advisor", "flashcard"):
            return state["intent"]
        return "advisor"

    def _create_graph(self):
        graph = StateGraph(AcademicState)
        graph.add_node("coordinator", self.coordinator)
        graph.add_node("planner", self.run_planner)
        graph.add_node("summarizer", self.run_summarizer)
        graph.add_node("advisor", self.run_advisor)
        graph.add_node("flashcard", self.run_flashcard)
        graph.add_edge(START, "coordinator")
        graph.add_conditional_edges(
            "coordinator",
            self.route,
            {
                "planner": "planner",
                "summarizer": "summarizer",
                "advisor": "advisor",
                "flashcard": "flashcard",
                "coordinator": "advisor",
            },
        )
        graph.add_edge("planner", END)
        graph.add_edge("summarizer", END)
        graph.add_edge("advisor", END)
        graph.add_edge("flashcard", END)
        return graph.compile()

    async def run(self, state: AcademicState) -> AcademicState:
        return await self.graph.ainvoke(state)
