import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import type { Case, CaseUpdate, LostApproval } from "@/lib/types/domain";
import { StatusBadge } from "@/components/StatusBadge";
import { CaseActions } from "@/components/CaseActions";
import { calculateAgingDays, bucketForAging } from "@/lib/aging";
import { STATUS_LABELS } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({ params }: { params: { case_id: string } }) {
  const supabase = createSupabaseServerClient();
  const profile = await getCurrentProfile();

  // RLS scopes this query: a client_poc gets a row only if the case
  // belongs to their client; otherwise this comes back null (not a leak).
  const { data: kase } = await supabase
    .from("cases")
    .select("*")
    .eq("case_id", params.case_id)
    .single<Case>();

  if (!kase) notFound();

  const { data: updates } = await supabase
    .from("case_updates")
    .select("*, profiles:changed_by(full_name)")
    .eq("case_id", params.case_id)
    .order("created_at", { ascending: false })
    .returns<(CaseUpdate & { profiles: { full_name: string } | null })[]>();

  const { data: approvals } = await supabase
    .from("lost_approvals")
    .select("*, profiles:acted_by(full_name)")
    .eq("case_id", params.case_id)
    .order("created_at", { ascending: false })
    .returns<(LostApproval & { profiles: { full_name: string } | null })[]>();

  const isPoc = profile.role === "client_poc";
  const canSeeInternal = !isPoc; // POC internal-remark visibility is refined via client_pocs.can_view_internal_remarks — see README

  const agingDays =
    kase.final_aging_days ?? calculateAgingDays(kase.escalation_date);
  const agingBucket = bucketForAging(agingDays);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">{kase.awb}</h1>
          <div className="text-sm text-ink-600">
            {kase.case_number} · Escalated {kase.escalation_date} · {agingDays} days ({agingBucket})
          </div>
        </div>
        <StatusBadge status={kase.status_code} label={STATUS_LABELS[kase.status_code]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-ink-800 mb-3">Shipment information</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="Hub / Location" value={kase.hub || kase.location} />
              <Field label="Delivery date" value={kase.delivery_date} />
              <Field label="Seller" value={kase.seller_name} />
              <Field label="Complaint type" value={kase.complaint_type} />
              <Field label="Reason" value={kase.reason} />
              <Field label="Priority" value={kase.priority} />
              <Field label="Shipment status (source)" value={kase.shipment_status} />
              <Field label="POD status" value={kase.pod_status?.replace("_", " ")} />
              <Field
                label="POD link"
                value={
                  kase.pod_link ? (
                    <a href={kase.pod_link} target="_blank" className="text-brand-600 hover:underline">
                      View POD
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <Field label="Assigned agent" value={kase.assigned_agent} />
              {kase.product_name && <Field label="Product" value={kase.product_name} />}
              {kase.product_value != null && (
                <Field label="Product value" value={`₹${kase.product_value.toLocaleString("en-IN")}`} />
              )}
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-ink-800 mb-3">Source</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="Source type" value={kase.source_type.replace("_", " ")} />
              {kase.source_type === "google_sheet" && (
                <>
                  <Field label="Workbook" value={kase.source_workbook} />
                  <Field label="Sheet" value={kase.source_sheet} />
                  <Field label="Row" value={kase.source_row} />
                </>
              )}
              {kase.source_type === "email" && (
                <>
                  <Field label="Email subject" value={kase.email_subject} />
                  <Field label="Message ID" value={kase.email_message_id} />
                  <Field label="Thread ID" value={kase.email_thread_id} />
                </>
              )}
            </dl>
            {kase.needs_manual_review && (
              <div className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                This case was auto-extracted with low confidence and flagged for manual review.
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-ink-800 mb-3">Remarks</h2>
            <dl className="grid grid-cols-1 gap-y-3 text-sm">
              <Field label="Client remark" value={kase.client_remark} />
              {canSeeInternal && <Field label="Internal / Shadowfax remark" value={kase.team_remark} />}
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-ink-800 mb-3">Timeline</h2>
            <ol className="space-y-3">
              {(updates ?? []).map((u) => (
                <li key={u.id} className="text-sm border-l-2 border-slate-200 pl-3">
                  <div className="text-ink-800">
                    <span className="font-medium">{u.action.replace(/_/g, " ")}</span>
                    {u.field_name && (
                      <>
                        {" "}
                        — {u.field_name}:{" "}
                        <span className="text-ink-500 line-through">{u.old_value ?? "—"}</span>{" "}
                        → <span className="font-medium">{u.new_value ?? "—"}</span>
                      </>
                    )}
                  </div>
                  {u.note && <div className="text-ink-600">{u.note}</div>}
                  <div className="text-xs text-ink-400 mt-0.5">
                    {new Date(u.created_at).toLocaleString("en-IN")} · {u.profiles?.full_name ?? "System"}
                  </div>
                </li>
              ))}
              {(updates ?? []).length === 0 && <div className="text-sm text-ink-500">No history yet.</div>}
            </ol>
          </section>

          {(approvals ?? []).length > 0 && (
            <section className="card p-4">
              <h2 className="text-sm font-semibold text-ink-800 mb-3">Lost approval history</h2>
              <ol className="space-y-3">
                {(approvals ?? []).map((a) => (
                  <li key={a.id} className="text-sm border-l-2 border-amber-200 pl-3">
                    <div className="font-medium capitalize">{a.action.replace(/_/g, " ")}</div>
                    {a.reason && <div className="text-ink-600">{a.reason}</div>}
                    <div className="text-xs text-ink-400 mt-0.5">
                      {new Date(a.created_at).toLocaleString("en-IN")} · {a.profiles?.full_name ?? "System"}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <CaseActions
            caseId={kase.case_id}
            statusCode={kase.status_code}
            role={profile.role}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-ink-900">{value ?? "—"}</dd>
    </div>
  );
}
