import { createHash } from "crypto";

export interface MappingRule {
  source_header_pattern: string;
  target_field: string;
  match_type: "exact" | "contains" | "regex";
  transform: string | null;
  priority: number;
}

export interface MappedRow {
  mapped: Record<string, string | null>;
  unmappedHeaders: string[];
  matchedRuleCount: number;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ").replace(/[_.]/g, " ").trim();
}

function headerMatches(normalizedHeader: string, rule: MappingRule): boolean {
  const pattern = normalizeHeader(rule.source_header_pattern);
  switch (rule.match_type) {
    case "exact":
      return normalizedHeader === pattern;
    case "contains":
      return normalizedHeader.includes(pattern);
    case "regex":
      try {
        return new RegExp(rule.source_header_pattern, "i").test(normalizedHeader);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function applyTransform(value: string, transform: string | null): string {
  if (!transform) return value.trim();
  const v = value.trim();
  if (transform === "trim") return v;
  if (transform === "uppercase") return v.toUpperCase();
  if (transform === "lowercase") return v.toLowerCase();
  if (transform.startsWith("date:")) return normalizeDateString(v);
  return v;
}

/**
 * Best-effort date normalization to ISO (yyyy-mm-dd). Source trackers mix
 * dd-mm-yyyy, dd/mm/yyyy, "5 Aug 2026", Excel serials, and plain blanks —
 * this returns null (never throws) when a value can't be confidently
 * parsed, so the row is flagged for manual review rather than silently
 * getting a wrong date.
 */
export function normalizeDateString(raw: string): string {
  const v = raw.trim();
  if (!v || /^#ref!?$/i.test(v) || v === "-") return "";

  // Excel serial date (e.g. exported via Sheets API as a bare number)
  if (/^\d{5}$/.test(v)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const asDate = new Date(excelEpoch.getTime() + Number(v) * 86400000);
    return asDate.toISOString().slice(0, 10);
  }

  const isoMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return v.slice(0, 10);

  const dmy = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy && dmy[1] && dmy[2] && dmy[3]) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const parsed = new Date(v);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return "";
}

/**
 * Maps one raw sheet row (header -> cell value) into standardized field
 * names using the given (admin-configured) rule set. Unmapped source
 * columns are returned too, so the import UI can surface "we didn't
 * recognize this column" rather than silently dropping data.
 */
export function mapRow(rawRow: Record<string, string>, rules: MappingRule[]): MappedRow {
  const mapped: Record<string, string | null> = {};
  const unmappedHeaders: string[] = [];
  let matchedRuleCount = 0;

  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const [header, rawValue] of Object.entries(rawRow)) {
    const normalizedHeader = normalizeHeader(header);
    const rule = sortedRules.find((r) => headerMatches(normalizedHeader, r));

    if (!rule) {
      if (rawValue?.trim()) unmappedHeaders.push(header);
      continue;
    }

    matchedRuleCount += 1;
    const value = rawValue == null ? null : applyTransform(rawValue, rule.transform);
    // Never overwrite an already-mapped, non-empty target with an empty one
    if (mapped[rule.target_field] == null || mapped[rule.target_field] === "") {
      mapped[rule.target_field] = value;
    }
  }

  return { mapped, unmappedHeaders, matchedRuleCount };
}

/** Stable hash of a raw row, used for the source_records UPSERT/dedup key. */
export function hashRow(workbookId: string, sheetName: string, rawRow: Record<string, string>): string {
  const normalized = Object.entries(rawRow)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v ?? ""}`)
    .join("|");
  return createHash("sha256").update(`${workbookId}::${sheetName}::${normalized}`).digest("hex");
}

/**
 * The "Ageing" column is explicitly untrustworthy per the business rules
 * (can contain #REF!, stale values, manual typos). We still capture it as
 * `source_aging_raw` for audit/diff purposes, but it is NEVER used to set
 * a case's aging — see src/lib/aging.ts and the `cases_with_aging` view.
 */
export const UNTRUSTED_SOURCE_FIELDS = ["source_aging_raw"] as const;
