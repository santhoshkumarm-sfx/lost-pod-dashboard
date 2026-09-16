import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CaseWithAging } from "@/lib/types/domain";
import { AgingBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function LostApprovalPage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("cases_with_aging")
    .select("*")
    .eq("status_code", "LOST_PENDING_APPROVAL")
    .order("escalation_date", { ascending: true })
    .returns<CaseWithAging[]>();

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Lost Approval</h1>
        <p className="text-sm text-ink-600">
          {rows.length} case{rows.length === 1 ? "" : "s"} waiting on an Admin decision. Aging is
          measured from the original escalation date, not the request date.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>AWB</th>
              <th>Client</th>
              <th>Esc. Date</th>
              <th>Aging</th>
              <th>Hub / Location</th>
              <th>Requested by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.case_id}>
                <td className="font-medium">{c.awb}</td>
                <td>{c.client_name_resolved}</td>
                <td>{c.escalation_date}</td>
                <td>
                  <AgingBadge bucket={c.aging_bucket} days={c.aging_days} />
                </td>
                <td>{c.hub || c.location || "—"}</td>
                <td>{c.lost_requested_by ? "POC / Team" : "—"}</td>
                <td>
                  <Link href={`/cases/${c.case_id}`} className="text-brand-600 hover:underline">
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-ink-500 py-8">
                  Nothing pending approval.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
