/**
 * The Circadia clock. Static everywhere except inside the Dock open cover,
 * where `globals.css` draws it: ring strokes in from 12, ticks blink, hands
 * sweep from 12 and settle, moon rises, halo breathes once.
 *
 * The hands sit in `<g>` seats so their resting rotation lives in CSS
 * (`.mark-hand-minute`, `.mark-hand-hour`) and the open can animate it. Those
 * seats carry no transform attribute, because a CSS transform would replace it.
 * The ring is the opposite case: it is positioned by attribute and animated only
 * through `stroke-dashoffset`, so nothing competes for its transform.
 *
 * Same geometry as `phone/ios/App/App/CircadiaMarkView.swift`.
 */
export function Mark({ className = "size-16" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      className={`mark-face ${className}`}
      aria-hidden="true"
      fill="none"
    >
      {/*
        Rotated by attribute, about the centre, so the stroke starts at 12 o'clock.
        This must NOT be a CSS transform: a CSS transform replaces the element's
        `transform` attribute outright, which silently dropped the translate and
        drew the ring around the top-left corner of the viewBox. Only
        `stroke-dashoffset` is animated here, which is not a transform at all.
      */}
      <g transform="rotate(-90 64 64)">
        <circle
          className="mark-ring"
          cx="64"
          cy="64"
          r="46"
          stroke="rgba(125,211,252,0.42)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
      <g className="mark-ticks" transform="translate(64 64)" stroke="rgba(228,228,231,0.7)" strokeLinecap="round">
        <line className="mark-tick" y1="-40" y2="-34" strokeWidth="1.5" transform="rotate(90)" />
        <line className="mark-tick" y1="-40" y2="-34" strokeWidth="1.5" transform="rotate(180)" />
        <line className="mark-tick" y1="-40" y2="-34" strokeWidth="1.5" transform="rotate(270)" />
      </g>
      <g className="mark-moon-seat" transform="translate(64 22)">
        <path
          className="mark-moon"
          d="M0-4c2.4 1.1 4 3.4 4 6.2 0 3.6-2.9 6.8-6.8 6.8-1 0-2-.2-2.9-.6 2.4.8 5.2-.5 6.3-3.1 1.1-2.6-.3-5.2-2.9-6.3.8-1 1.8-2.1 2.3-3z"
          fill="#c4b5fd"
        />
      </g>
      <g className="mark-hands" transform="translate(64 64)">
        <g className="mark-hand mark-hand-minute">
          <rect x="-1.1" y="-32" width="2.2" height="35" rx="1.1" fill="#e4e4e7" />
        </g>
        <g className="mark-hand mark-hand-hour">
          <rect x="-1.5" y="-23" width="3" height="26" rx="1.5" fill="#c4b5fd" />
        </g>
        <circle className="mark-pivot" r="3.4" fill="#7dd3fc" />
        <circle className="mark-pivot-dot" r="1.2" fill="#07060f" />
      </g>
    </svg>
  );
}
