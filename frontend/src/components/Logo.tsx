/**
 * The Threshold Seal. A container seal (the hexagon) cut by a dashed
 * threshold line, with a temperature trace that crosses it - cold below,
 * hot above. The trace's colour change is the whole product: the moment a
 * reading crosses the line is the moment the policy starts to pay.
 */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const id = `gs-trace-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={id} x1="6" y1="24" x2="26" y2="7" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5cc8e4" />
          <stop offset="0.55" stopColor="#f0b65a" />
          <stop offset="1" stopColor="#ff6a55" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.6 27.6 9.3v13.4L16 29.4 4.4 22.7V9.3L16 2.6Z"
        stroke="#e6f2f6"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {size >= 22 ? <path d="M7.5 13.5h17" stroke="#e6f2f6" strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="2 2" /> : null}
      <path d="M7.5 21.5l4-1.2 3.2 1 3.3-5.8 3 1.4 3.5-6.4" stroke={`url(#${id})`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark size={size} />
      <span className="text-lg font-semibold tracking-tight text-ice">
        Gen<span className="text-thermal-cool">Supply</span>
      </span>
    </span>
  );
}
