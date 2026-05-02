// Bitewise logo — a 270° tracking ring with a bright "bite" accent floating
// in the gap. The ring uses currentColor so it picks up whatever color the
// container sets (used in white inside the brand-blue auth-logo tile).
export default function Logo({ size = 36, accent = '#fbbf24' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* 270° ring — open at the top-right (the "bite") */}
      <path
        d="M 23.07 8.93 A 10 10 0 1 1 8.93 8.93"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Bite accent — bright dot floating in the gap */}
      <circle
        cx="22"
        cy="6"
        r="3"
        fill={accent}
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeWidth="1"
      />
      {/* Inner notch suggesting "log entry" / data point */}
      <circle cx="16" cy="16" r="2.4" fill="currentColor" />
    </svg>
  );
}
