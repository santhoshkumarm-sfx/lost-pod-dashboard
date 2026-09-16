import clsx from "clsx";
import type { StatusCode } from "@/lib/types/domain";

const STATUS_STYLES: Record<StatusCode, string> = {
  PENDING: "bg-slate-100 text-ink-700",
  WORKING_ON_IT: "bg-blue-50 text-blue-700",
  SHIPMENT_AT_DC: "bg-indigo-50 text-indigo-700",
  SHIPMENT_AT_HUB: "bg-purple-50 text-purple-700",
  POD_SHARED: "bg-emerald-50 text-emerald-700",
  LOST_PENDING_APPROVAL: "bg-amber-50 text-amber-800",
  LOST: "bg-red-50 text-red-700",
  CLOSED: "bg-slate-200 text-ink-600",
};

export function StatusBadge({ status, label }: { status: StatusCode; label: string }) {
  return (
    <span className={clsx("badge", STATUS_STYLES[status] ?? "bg-slate-100 text-ink-700")}>
      {label}
    </span>
  );
}

const AGING_STYLES: Record<string, string> = {
  "0-2": "bg-emerald-50 text-emerald-700",
  "3-7": "bg-lime-50 text-lime-700",
  "8-15": "bg-amber-50 text-amber-800",
  "16-30": "bg-orange-50 text-orange-700",
  "31-60": "bg-red-50 text-red-700",
  "61-90": "bg-red-100 text-red-800",
  "90+": "bg-red-200 text-red-900",
};

export function AgingBadge({ bucket, days }: { bucket: string; days: number }) {
  return (
    <span className={clsx("badge", AGING_STYLES[bucket] ?? "bg-slate-100 text-ink-700")}>
      {days}d ({bucket})
    </span>
  );
}
