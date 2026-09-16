import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CaseWithAging } from "@/lib/types/domain";

const EXPORT_ROW_CAP = 20000;

const COLUMNS: (keyof CaseWithAging)[] = [
  "case_number",
  "awb",
  "client_name_resolved",
  "source_type",
  "escalation_date",
  "aging_days",
  "aging_bucket",
  "hub",
  "location",
  "status_label",
  "pod_status",
  "pod_link",
  "assigned_agent",
  "client_remark",
  "team_remark",
  "closure_date",
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  const bucket = url.searchParams.get("bucket");

  // Same RLS-scoped query as the list page — a client_poc only ever
  // gets their own client's rows here, never a full-org dump.
  let query = supabase.from("cases_with_aging").select(COLUMNS.join(","));

  if (q) {
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

  const { data, error } = await query.limit(EXPORT_ROW_CAP).returns<CaseWithAging[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = data ?? [];
  const csv = [
    COLUMNS.join(","),
    ...rows.map((r) => COLUMNS.map((c) => csvEscape((r as any)[c])).join(",")),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cases-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
