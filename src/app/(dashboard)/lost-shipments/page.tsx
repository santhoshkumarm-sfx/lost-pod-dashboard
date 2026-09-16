import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CaseWithAging } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

export default async function LostShipmentsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = createSupabaseServerClient();
  const client = typeof searchParams.client === "string" ? searchParams.client : "";
  const hub = typeof searchParams.hub === "string" ? searchParams.hub : "";
  const from = typeof searchParams.from === "string" ? searchParams.from : "";
  const to = typeof searchParams.to === "string" ? searchParams.to : "";

  let query = supabase.from("cases_with_aging").select("*").eq("status_code", "LOST");
  if (client) query = query.ilike("client_name_resolved", `%${client}%`);
  if (hub) query = query.ilike("hub", `%${hub}%`);
  if (from) query = query.gte("escalation_date", from);
  if (to) query = query.lte("escalation_date", to);

  const { data } = await query
    .order("lost_approved_at", { ascending: false })
    .returns<CaseWithAging[]>();

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Lost Shipments</h1>
        <p className="text-sm text-ink-600">
          Admin-approved Lost cases. Lost aging = escalation date → approval date, frozen at approval
          (see <code>final_aging_days</code>).
        </p>
      </div>

      <form className="card p-4 flex flex-wrap gap-3 items-end" method="get">
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Client</label>
          <input name="client" defaultValue={client} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Hub</label>
          <input name="hub" defaultValue={hub} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Escalated from</label>
          <input type="date" name="from" defaultValue={from} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Escalated to</label>
          <input type="date" name="to" defaultValue={to} className="input" />
        </div>
        <button className="btn-primary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>AWB</th>
              <th>Client</th>
              <th>Esc. Date</th>
              <th>Approved</th>
              <th>Lost aging (days)</th>
              <th>Hub</th>
              <th>Reason</th>
              <th>Final remark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.case_id}>
                <td className="font-medium">{c.awb}</td>
                <td>{c.client_name_resolved}</td>
                <td>{c.escalation_date}</td>
                <td>{c.lost_approved_at ? new Date(c.lost_approved_at).toLocaleDateString("en-IN") : "—"}</td>
                <td>{c.final_aging_days ?? c.aging_days}</td>
                <td>{c.hub || c.location || "—"}</td>
                <td>{c.reason || "—"}</td>
                <td>{c.team_remark || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-ink-500 py-8">
                  No approved Lost cases match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
