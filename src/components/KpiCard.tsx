import clsx from "clsx";

export function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-ink-600 uppercase tracking-wide">{label}</div>
      <div
        className={clsx(
          "text-2xl font-semibold mt-1",
          tone === "warning" && "text-amber-700",
          tone === "danger" && "text-red-700",
          tone === "default" && "text-ink-900"
        )}
      >
        {value.toLocaleString("en-IN")}
      </div>
    </div>
  );
}
