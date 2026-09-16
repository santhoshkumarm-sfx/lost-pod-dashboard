"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StatusCode, UserRole } from "@/lib/types/domain";
import { STATUS_LABELS } from "@/lib/types/domain";

// Statuses a human can pick directly. LOST is reachable only via the
// approval workflow (request -> admin decision), never a direct set.
const SELECTABLE_STATUSES: StatusCode[] = [
  "PENDING",
  "WORKING_ON_IT",
  "SHIPMENT_AT_DC",
  "SHIPMENT_AT_HUB",
  "POD_SHARED",
  "CLOSED",
];

export function CaseActions({
  caseId,
  statusCode,
  role,
}: {
  caseId: string;
  statusCode: StatusCode;
  role: UserRole;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const isAdmin = role === "super_admin" || role === "admin";
  const isStaff = isAdmin || role === "internal_team";
  const isPoc = role === "client_poc";
  const isPendingApproval = statusCode === "LOST_PENDING_APPROVAL";

  async function callApi(path: string, body: unknown) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {isStaff && !isPendingApproval && statusCode !== "LOST" && (
        <section className="card p-4">
          <h3 className="text-sm font-semibold text-ink-800 mb-2">Update status</h3>
          <select
            className="input"
            defaultValue={statusCode}
            disabled={loading}
            onChange={(e) =>
              callApi(`/api/cases/${caseId}/status`, { status_code: e.target.value })
            }
          >
            {SELECTABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </section>
      )}

      {(isPoc || isStaff) && statusCode !== "LOST" && statusCode !== "CLOSED" && !isPendingApproval && (
        <section className="card p-4">
          <h3 className="text-sm font-semibold text-ink-800 mb-2">Mark as Lost</h3>
          <p className="text-xs text-ink-500 mb-2">
            This sends the case for Admin approval — it will not become Lost immediately.
          </p>
          <textarea
            className="input mb-2"
            rows={2}
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="btn-danger w-full"
            disabled={loading}
            onClick={() => callApi(`/api/cases/${caseId}/lost-request`, { reason })}
          >
            Request Lost
          </button>
        </section>
      )}

      {isAdmin && isPendingApproval && (
        <section className="card p-4 border-amber-200">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">Lost approval required</h3>
          <textarea
            className="input mb-2"
            rows={2}
            placeholder="Decision note (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="grid grid-cols-1 gap-2">
            <button
              className="btn-danger"
              disabled={loading}
              onClick={() => callApi(`/api/cases/${caseId}/lost-decision`, { decision: "approved", reason })}
            >
              Approve Lost
            </button>
            <button
              className="btn-secondary"
              disabled={loading}
              onClick={() => callApi(`/api/cases/${caseId}/lost-decision`, { decision: "rejected", reason })}
            >
              Reject
            </button>
            <button
              className="btn-secondary"
              disabled={loading}
              onClick={() =>
                callApi(`/api/cases/${caseId}/lost-decision`, {
                  decision: "sent_back_for_investigation",
                  reason,
                })
              }
            >
              Send back for investigation
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
