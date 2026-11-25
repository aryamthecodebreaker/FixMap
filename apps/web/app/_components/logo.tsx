import Link from "next/link";

/** The FixMap mark: a route from the problem (hollow node) through a check to where to start (solid node). */
export function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden focusable="false">
      <path d="M8 22.5V17a5 5 0 0 1 5-5h6a5 5 0 0 0 5-5V6.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="8" cy="25" r="4" stroke="currentColor" strokeWidth="3" />
      <circle cx="16" cy="12" r="2.6" fill="currentColor" />
      <circle cx="24" cy="5.5" r="4.5" fill="var(--mark-node)" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="FixMap home">
      <Mark />
      <span className="word">FixMap</span>
    </Link>
  );
}
