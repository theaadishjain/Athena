"use client";

interface AgentBadgeProps {
  agent: string;
}

const BADGE_CLASSES: Record<string, string> = {
  planner: "badge-planner",
  summarizer: "badge-summarizer",
  advisor: "badge-advisor",
  coordinator: "badge-coordinator",
};

export default function AgentBadge({ agent }: AgentBadgeProps) {
  const badgeClass = BADGE_CLASSES[agent] ?? "badge-coordinator";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide uppercase ${badgeClass}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {agent}
    </span>
  );
}
