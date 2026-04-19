"use client";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="glass-card border-error/30 bg-error/5 p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <svg
          className="h-5 w-5 text-error shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
          />
        </svg>
        <p className="text-sm text-error/90">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 rounded-lg bg-error/10 px-3 py-1.5 text-xs font-medium text-error hover:bg-error/20 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
