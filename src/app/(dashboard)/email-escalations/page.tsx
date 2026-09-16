export default function EmailEscalationsPage() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-ink-900">Email Escalations</h1>
        <span className="badge bg-slate-100 text-ink-600">Phase 3</span>
      </div>
      <div className="card p-6 text-sm text-ink-600 max-w-2xl">
        Add-by-subject → Gmail search → extraction → manual-review flow. The extraction engine
        (<code>src/lib/import/email-extractor.ts</code>) and Gmail client
        (<code>src/lib/google/gmail-client.ts</code>) are already scaffolded — this screen will wire
        them to a &ldquo;Add Email Escalation&rdquo; form, a thread picker, and the review form
        described in the spec (Section 11), writing into <code>emails</code> and{" "}
        <code>cases</code> with <code>needs_manual_review</code> flagged for low-confidence fields.
      </div>
    </div>
  );
}
