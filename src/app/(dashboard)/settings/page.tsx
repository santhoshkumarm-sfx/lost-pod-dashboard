export default function SettingsPage() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-ink-900">Settings</h1>
        <span className="badge bg-slate-100 text-ink-600">Phase 7</span>
      </div>
      <div className="card p-6 text-sm text-ink-600 max-w-2xl">
        Admin configuration for <code>status_master</code> (add/reorder team statuses beyond the
        eight system ones), <code>aging_bucket_config</code> (edit bucket boundaries), and Google
        Sheets / Gmail connection status will live here.
      </div>
    </div>
  );
}
