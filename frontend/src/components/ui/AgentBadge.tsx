"use client";

interface AgentBadgeProps {
  agent: string;
}

function PlannerGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
      <line x1="0.5" y1="3.5" x2="9.5" y2="3.5" stroke="currentColor" strokeWidth="1" />
      <line x1="3" y1="0.5" x2="3" y2="3.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function SummarizerGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <line x1="1" y1="2" x2="9" y2="2" stroke="currentColor" strokeWidth="1" />
      <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1" />
      <line x1="1" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function AdvisorGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1" />
      <circle cx="5" cy="5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function CoordinatorGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M5 0.5 L9.5 5 L5 9.5 L0.5 5 Z" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="5" cy="5" r="0.9" fill="currentColor" />
    </svg>
  );
}

const GLYPHS: Record<string, React.ReactNode> = {
  planner: <PlannerGlyph />,
  summarizer: <SummarizerGlyph />,
  advisor: <AdvisorGlyph />,
  coordinator: <CoordinatorGlyph />,
};

export default function AgentBadge({ agent }: AgentBadgeProps) {
  const key = agent.toLowerCase();
  const glyph = GLYPHS[key] ?? <AdvisorGlyph />;
  const label = agent.charAt(0).toUpperCase() + agent.slice(1).toLowerCase();

  return (
    <span className="agent-badge">
      <span className="agent-badge-glyph">{glyph}</span>
      {label}
    </span>
  );
}
