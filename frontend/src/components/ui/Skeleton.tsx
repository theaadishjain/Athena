/** Shimmering placeholder shown while content loads. */
export default function Skeleton({
  width = "100%",
  height = 12,
  className = "",
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  return <span aria-hidden="true" className={`skeleton ${className}`} style={{ width, height }} />;
}

/** A stack of list-row placeholders (title line + meta line). */
export function SkeletonRows({
  rows = 3,
  className = "",
  meta = true,
}: {
  rows?: number;
  className?: string;
  meta?: boolean;
}) {
  const widths = ["78%", "62%", "70%", "54%", "66%"];
  return (
    <div role="status" aria-label="Loading" className={className}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 py-3">
          <Skeleton width={widths[i % widths.length]} height={12} />
          {meta && <Skeleton width="32%" height={9} />}
        </div>
      ))}
    </div>
  );
}
