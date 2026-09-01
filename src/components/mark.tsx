export function Mark({ className = "size-16" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      className={`mark-face ${className}`}
      aria-hidden="true"
      fill="none"
    >
      <circle
        className="mark-ring"
        cx="64"
        cy="64"
        r="46"
        stroke="rgba(125,211,252,0.42)"
        strokeWidth="1.5"
      />
      <g className="mark-ticks" transform="translate(64 64)" stroke="rgba(228,228,231,0.7)" strokeLinecap="round">
        <line y1="-40" y2="-34" strokeWidth="1.5" transform="rotate(90)" />
        <line y1="-40" y2="-34" strokeWidth="1.5" transform="rotate(180)" />
        <line y1="-40" y2="-34" strokeWidth="1.5" transform="rotate(270)" />
      </g>
      <path
        className="mark-moon"
        transform="translate(64 22)"
        d="M0-4c2.4 1.1 4 3.4 4 6.2 0 3.6-2.9 6.8-6.8 6.8-1 0-2-.2-2.9-.6 2.4.8 5.2-.5 6.3-3.1 1.1-2.6-.3-5.2-2.9-6.3.8-1 1.8-2.1 2.3-3z"
        fill="#c4b5fd"
      />
      <g className="mark-hands" transform="translate(64 64)">
        <rect x="-1.1" y="-32" width="2.2" height="35" rx="1.1" fill="#e4e4e7" transform="rotate(60)" />
        <rect x="-1.5" y="-23" width="3" height="26" rx="1.5" fill="#c4b5fd" transform="rotate(305)" />
        <circle r="3.4" fill="#7dd3fc" />
        <circle r="1.2" fill="#07060f" />
      </g>
    </svg>
  );
}
