import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import type { CaseWithAging, StatusCode } from "@/lib/types/domain";
import { AGING_BUCKETS, STATUS_CODES, STATUS_LABELS } from "@/lib/types/domain";
import { KpiCard } from "@/components/KpiCard";
import { DashboardCharts } from "@/components/DashboardCharts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const profile = await getCurrentProfile();

  const isStaff = profile.role !== "client_poc";

  // RLS scopes this automatically: staff see everything, a POC sees only
  // their own client's cases (or, in AUTH_DISABLED mode, everyone sees
  // everything via the service-role client). No client-side filtering
  // needed for security.
  const { data: cases, error } = await supabase
    .from("cases_with_aging")
    .select("*")
    .returns<CaseWithAging[]>();

  if (error) {
    return (
      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
        Failed to load dashboard data: {error.message}
      </div>
    );
  }

  const rows = cases ?? [];
  const total = rows.length;
  const open = rows.filter((r) => r.status_category === "open").length;
  const lostPending = rows.filter((r) => r.status_code === "LOST_PENDING_APPROVAL").length;
  const lost = rows.filter((r) => r.status_code === "LOST").length;
  const closed = rows.filter((r) => r.status_code === "CLOSED").length;
  const tatBreached = rows.filter((r) => {
    const sla = 7; // fallback SLA; per-client SLA applied in reports module
    return r.status_category === "open" && r.aging_days > sla;
  }).length;

  const statusCounts: Record<StatusCode, number> = Object.fromEntries(
    STATUS_CODES.map((code) => [code, rows.filter((r) => r.status_code === code).length])
  ) as Record<StatusCode, number>;

  const agingCounts = Object.fromEntries(
    AGING_BUCKETS.map((b) => [b, rows.filter((r) => r.aging_bucket === b).length])
  );

  const sourceCounts = {
    google_sheet: rows.filter((r) => r.source_type === "google_sheet").length,
    email: rows.filter((r) => r.source_type === "email").length,
    manual: rows.filter((r) => r.source_type === "manual").length,
  };

  const clientCounts = isStaff
    ? Object.entries(
        rows.reduce<Record<string, number>>((acc, r) => {
          acc[r.client_name_resolved] = (acc[r.client_name_resolved] ?? 0) + 1;
          return acc;
        }, {})
      )
        .map(([client, count]) => ({ client, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Dashboard</h1>
        <p className="text-sm text-ink-600">
          {isStaff ? "Org-wide view across all clients." : "Your escalations only."}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
        <KpiCard label="Total cases" value={total} />
        <KpiCard label="Open" value={open} />
        <KpiCard label="Pending" value={statusCounts.PENDING} />
        <KpiCard label="Working on it" value={statusCounts.WORKING_ON_IT} />
        <KpiCard label="Shipment at DC" value={statusCounts.SHIPMENT_AT_DC} />
        <KpiCard label="Shipment at Hub" value={statusCounts.SHIPMENT_AT_HUB} />
        <KpiCard label="POD Shared" value={statusCounts.POD_SHARED} />
        <KpiCard label="Lost — Pending Approval" value={lostPending} tone="warning" />
        <KpiCard label="Lost" value={lost} tone="danger" />
        <KpiCard label="Closed" value={closed} />
        <KpiCard label="TAT/SLA breached" value={tatBreached} tone="danger" />
      </div>

      <DashboardCharts
        agingCounts={agingCounts}
        statusCounts={statusCounts}
        statusLabels={STATUS_LABELS}
        sourceCounts={sourceCounts}
        clientCounts={clientCounts}
        isStaff={isStaff}
      />
    </div>
  );
}
