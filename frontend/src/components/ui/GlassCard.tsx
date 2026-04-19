"use client";

import { useId } from "react";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: string;
}

export default function GlassCard({
  children,
  className = "",
  hover = false,
  padding = "p-6",
}: GlassCardProps) {
  const id = useId();
  return (
    <div
      id={`glass-card-${id}`}
      className={`glass-card ${hover ? "glass-card-hover" : ""} ${padding} ${className}`}
    >
      {children}
    </div>
  );
}
