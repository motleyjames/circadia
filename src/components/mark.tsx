export function Mark({ className = "size-16" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <circle cx="64" cy="64" r="46" stroke="rgba(125,211,252,0.28)" strokeWidth="1.5" />
      <path
        d="M78 36a36 36 0 1 0 14 48 30 30 0 0 1-14-48z"
        fill="#c4b5fd"
      />
      <circle cx="96" cy="34" r="3.5" fill="#7dd3fc" />
    </svg>
  );
}
