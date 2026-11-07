/** Small L-shaped marks in each corner of a positioned container. */
export default function CornerTicks({
  size = 8,
  color = "rgba(237,232,220,0.4)",
}: {
  size?: number;
  color?: string;
}) {
  const corners: React.CSSProperties[] = [
    { top: 0, left: 0 },
    { top: 0, right: 0, transform: "rotate(90deg)" },
    { bottom: 0, right: 0, transform: "rotate(180deg)" },
    { bottom: 0, left: 0, transform: "rotate(270deg)" },
  ];
  return (
    <>
      {corners.map((style, i) => (
        <svg
          key={i}
          aria-hidden="true"
          style={{ position: "absolute", pointerEvents: "none", ...style }}
          width={size}
          height={size}
          viewBox="0 0 8 8"
          fill="none"
        >
          <path d="M0 8 L0 0 L8 0" stroke={color} strokeWidth="1" />
        </svg>
      ))}
    </>
  );
}
