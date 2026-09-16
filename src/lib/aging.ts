import { differenceInCalendarDays, parseISO } from "date-fns";
import type { AgingBucket } from "@/lib/types/domain";

/**
 * Mirrors public.case_current_aging_days() / public.aging_bucket_for() in
 * 0002_functions_triggers.sql. Used for client-side display and for the
 * report generator, which pulls raw rows via the service-role client and
 * needs the same math in TypeScript. The database view `cases_with_aging`
 * remains the source of truth for anything that hits Postgres directly —
 * this function exists so the UI never has to trust a source "Ageing"
 * column, matching the same rule enforced server-side.
 */
export function calculateAgingDays(escalationDateISO: string, asOf: Date = new Date()): number {
  return Math.max(0, differenceInCalendarDays(asOf, parseISO(escalationDateISO)));
}

export interface AgingBucketDef {
  label: AgingBucket;
  min: number;
  max: number | null;
}

// Keep in sync with the aging_bucket_config seed rows.
export const DEFAULT_AGING_BUCKETS: AgingBucketDef[] = [
  { label: "0-2", min: 0, max: 2 },
  { label: "3-7", min: 3, max: 7 },
  { label: "8-15", min: 8, max: 15 },
  { label: "16-30", min: 16, max: 30 },
  { label: "31-60", min: 31, max: 60 },
  { label: "61-90", min: 61, max: 90 },
  { label: "90+", min: 91, max: null },
];

export function bucketForAging(days: number, buckets: AgingBucketDef[] = DEFAULT_AGING_BUCKETS): AgingBucket {
  const match = buckets.find((b) => days >= b.min && (b.max === null || days <= b.max));
  // buckets is always non-empty in practice (DEFAULT_AGING_BUCKETS has 7 entries,
  // and aging_bucket_config is seeded with 7 rows) — the assertion documents that
  // invariant rather than silently returning `undefined.label` if it's ever violated.
  if (match) return match.label;
  const last = buckets[buckets.length - 1];
  if (!last) throw new Error("bucketForAging() called with an empty buckets array");
  return last.label;
}

/** Right-to-left daily buckets for the admin email's "Top 10 Aging" table: 1,2,...,10,10+ */
export const DAILY_AGING_COLUMNS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "10+"] as const;

export function dailyAgingColumn(days: number): (typeof DAILY_AGING_COLUMNS)[number] {
  return days >= 10 ? "10+" : (Math.max(1, days) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10);
}

export function isTatBreached(escalationDateISO: string, slaDays: number, asOf: Date = new Date()): boolean {
  return calculateAgingDays(escalationDateISO, asOf) > slaDays;
}
