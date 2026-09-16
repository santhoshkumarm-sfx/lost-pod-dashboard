export default function ReportsPage() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-ink-900">Reports</h1>
        <span className="badge bg-slate-100 text-ink-600">Phase 6</span>
      </div>
      <div className="card p-6 text-sm text-ink-600 max-w-2xl space-y-2">
        <p>
          The daily consolidated report (Section 13) — client-wise and aging-wise summaries, the
          approved-Lost table, the pending-approval table, the Top-10 Aging table, Top-10 Highest
          Product Value table, and Top-10 Highest AWB Count table, all computed from{" "}
          <code>cases_with_aging</code> — will run as a Vercel Cron job
          (<code>src/app/api/cron/daily-report/route.ts</code>) that emails{" "}
          santhoshkumar.m@shadowfax.in, naveed.iqbal@shadowfax.in and binay.sharma@shadowfax.in via
          the Gmail API, with a CSV/XLSX attachment and a row logged to{" "}
          <code>daily_report_runs</code> for audit.
        </p>
        <p>This page will let Admin trigger that report on demand and browse past runs.</p>
      </div>
    </div>
  );
}
