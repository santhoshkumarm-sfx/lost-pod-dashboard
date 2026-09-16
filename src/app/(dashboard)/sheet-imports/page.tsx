export default function SheetImportsPage() {
  return (
    <PhaseStub
      title="Google Sheet Imports"
      phase="Phase 2"
      description="Multi-workbook, multi-sheet import with configurable column mapping (src/lib/import/column-mapper.ts and the column_mapping_profiles / column_mapping_rules tables) is already modeled in the schema. This screen will let Admin configure mappings per client/sheet, trigger a sync, and review import_batches results."
    />
  );
}

function PhaseStub({ title, phase, description }: { title: string; phase: string; description: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
        <span className="badge bg-slate-100 text-ink-600">{phase}</span>
      </div>
      <div className="card p-6 text-sm text-ink-600 max-w-2xl">{description}</div>
    </div>
  );
}
