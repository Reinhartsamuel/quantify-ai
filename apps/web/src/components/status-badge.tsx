import { statusTone } from "@/lib/format";

export function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  const className =
    tone === "positive"
      ? "badge badge-positive"
      : tone === "negative"
        ? "badge badge-negative"
        : tone === "accent"
          ? "badge badge-accent"
          : tone === "warning"
            ? "badge badge-warning"
            : "badge";
  return (
    <span className={className}>
      <span className="dot" aria-hidden />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
