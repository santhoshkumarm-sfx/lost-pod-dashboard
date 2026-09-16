import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CaseWithAging } from "@/lib/types/domain";
import { StatusBadge, AgingBadge } from "@/components/StatusBadge";
import { CaseFilters } from "@/components/CaseFilters";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function CasesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = createSupabaseServerClient();

  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const status = typeof searchParams.status === "string" ? searchParams.status : "";
  const source = typeof searchParams.source === "string" ? searchParams.source : "";
  const bucket = typeof searchParams.bucket === "string" ? searchParams.bucket : "";
  const page = Math.max(1, parseInt((searchParams.page as string) ?? "1", 10) || 1);

  let query = supabase.from("cases_with_aging").select("*", { count: "exact" });

  if (q) {
    // AWB, client name, email subject, hub/location, agent — matched via ilike/trgm
    query = query.or(
      [
        `awb.ilike.%${q}%`,
        `client_name_resolved.ilike.%${q}%`,
        `email_subject.ilike.%${q}%`,
        `hub.ilike.%${q}%`,
        `location.ilike.%${q}%`,
        `assigned_agent.ilike.%${q}%`,
      ].join(",")
    );
  }
  if (status) query = query.eq("status_code", status);
  if (source) query = query.eq("source_type", source);
  if (bucket) query = query.eq("aging_bucket", bucket);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await query
    .order("escalation_date", { ascending: true })
    .range(from, to)
    .returns<CaseWithAging[]>();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900">Cases</h1>
        <a href={`/api/cases/export?${new URLSearchParams(searchParams as Record<string, string>).toString()}`} className="btn-secondary">
          Export CSV
        </a>
      </div>

      <CaseFilters />

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {error.message}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>AWB</th>
              <th>Client</th>
              <th>Source</th>
              <th>Esc. Date</th>
              <th>Aging</th>
              <th>Hub / Location</th>
              <th>Status</th>
              <th>POD</th>
              <th>Agent</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((c) => (
              <tr key={c.case_id}>
                <td>
                  <Link href={`/cases/${c.case_id}`} className="text-brand-600 hover:underline font-medium">
                    {c.awb}
                  </Link>
                </td>
                <td>{c.client_name_resolved}</td>
                <td className="capitalize">{c.source_type.replace("_", " ")}</td>
                <td>{c.escalation_date}</td>
                <td>
                  <AgingBadge bucket={c.aging_bucket} days={c.aging_days} />
                </td>
                <td>{c.hub || c.location || "—"}</td>
                <td>
                  <StatusBadge status={c.status_code} label={c.status_label} />
                </td>
                <td>{c.pod_status.replace("_", " ")}</td>
                <td>{c.assigned_agent || "—"}</td>
              </tr>
            ))}
            {(data ?? []).length === 0 && !error && (
              <tr>
                <td colSpan={9} className="text-center text-ink-500 py-8">
                  No cases match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
