"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

interface ToolCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
  comingSoon?: boolean;
}

export default function ToolCard({
  title,
  description,
  icon,
  href,
  comingSoon = false,
}: ToolCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (comingSoon) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      cardRef.current.style.setProperty("--mouse-x", `${x}px`);
      cardRef.current.style.setProperty("--mouse-y", `${y}px`);
    };

    const el = cardRef.current;
    if (el) el.addEventListener("mousemove", handleMouseMove);
    return () => {
      if (el) el.removeEventListener("mousemove", handleMouseMove);
    };
  }, [comingSoon]);

  const inner = (
    <div
      ref={cardRef}
      className={`card-glow surface-card p-5 relative overflow-hidden flex items-start gap-4 transition-all duration-300 ${
        comingSoon
          ? "opacity-50 cursor-default select-none"
          : "hover:border-border-light hover:-translate-y-0.5 hover:shadow-lg cursor-pointer"
      }`}
    >
      <div
        className={`shrink-0 rounded-xl p-2.5 ${
          comingSoon
            ? "bg-white/[0.02] text-muted"
            : "bg-primary/10 text-primary"
        }`}
      >
        <div className="w-5 h-5 flex items-center justify-center">{icon}</div>
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center justify-between mb-1">
          <h3 className={`text-[14px] font-semibold tracking-tight leading-none ${comingSoon ? "text-muted" : "text-foreground"}`}>
            {title}
          </h3>
          {comingSoon && (
            <span className="shrink-0 flex items-center justify-center rounded-full bg-white/[0.04] border border-white/[0.05] px-2 py-[2px] text-[10px] font-medium text-muted/80 uppercase tracking-widest">
              Soon
            </span>
          )}
        </div>
        <p className="text-[13px] text-muted leading-relaxed m-0 mt-1.5">{description}</p>
      </div>
    </div>
  );

  if (comingSoon || !href) return <div>{inner}</div>;
  return <Link href={href} className="block">{inner}</Link>;
}
