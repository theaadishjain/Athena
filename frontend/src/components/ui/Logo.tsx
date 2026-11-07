/** Athena mark + wordmark. */
export default function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="14.5" stroke="#ede8dc" strokeWidth="1" fill="none" opacity="0.5" />
        <path d="M16 5 L27 16 L16 27 L5 16 Z" stroke="#ede8dc" strokeWidth="1" fill="none" />
        <circle cx="16" cy="16" r="3" fill="#ede8dc" />
        <circle cx="16" cy="16" r="1" fill="#0a0a0c" />
        <line x1="16" y1="1" x2="16" y2="4" stroke="#ede8dc" strokeWidth="1" />
        <line x1="16" y1="28" x2="16" y2="31" stroke="#ede8dc" strokeWidth="1" />
      </svg>
      <span className="serif text-[17px] leading-none">Athena</span>
    </span>
  );
}
