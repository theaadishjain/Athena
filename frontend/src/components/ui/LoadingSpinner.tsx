"use client";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

const SIZES = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-3",
};

export default function LoadingSpinner({
  size = "md",
  label,
}: LoadingSpinnerProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${SIZES[size]} animate-spin rounded-full border-primary/30 border-t-primary`}
      />
      {label && (
        <span className="text-sm text-muted animate-pulse-glow">{label}</span>
      )}
    </div>
  );
}
