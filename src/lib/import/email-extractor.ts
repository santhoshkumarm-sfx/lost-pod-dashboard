import type { ExtractedCaseFields, ExtractionResult } from "@/lib/types/domain";
import { extractAwbCandidates, looksLikeAwb } from "./awb-patterns";

/**
 * Per the brief's example email:
 *
 *   "Please provide POD"
 *   AWB | WH
 *   R2466544662BDM | Bangalore
 *   R2460991811BDM | Jaipur
 *
 * This produces ONE ExtractionResult per detected AWB, all sharing the
 * same email-level metadata (client, reason, subject, etc). We deliberately
 * parse `bodyText` — never an AI-generated Gmail summary — because the
 * summary can drop or garble individual table rows.
 */

const KEYWORD_PATTERNS: Record<keyof Omit<ExtractedCaseFields, "awb">, RegExp[]> = {
  client_name_raw: [/client\s*[:\-]\s*(.+)/i],
  escalation_date: [/(?:esc(?:alation)?\s*date|date)\s*[:\-]\s*([0-9]{1,2}[\/\-. ][0-9]{1,2}[\/\-. ][0-9]{2,4})/i],
  reason: [/reason\s*[:\-]\s*(.+)/i, /issue\s*[:\-]\s*(.+)/i],
  complaint_type: [/complaint\s*type\s*[:\-]\s*(.+)/i, /type\s*of\s*complaint\s*[:\-]\s*(.+)/i],
  location: [/location\s*[:\-]\s*(.+)/i],
  hub: [/\b(?:hub|wh|warehouse|dc)\s*[:\-]\s*(.+)/i],
  delivery_date: [/delivery\s*date\s*[:\-]\s*([0-9]{1,2}[\/\-. ][0-9]{1,2}[\/\-. ][0-9]{2,4})/i],
  seller_name: [/seller\s*(?:name)?\s*[:\-]\s*(.+)/i],
  priority: [/priority\s*[:\-]\s*(.+)/i],
  client_poc_raw: [/poc\s*[:\-]\s*(.+)/i, /point\s*of\s*contact\s*[:\-]\s*(.+)/i],
  team_remark: [/remarks?\s*[:\-]\s*(.+)/i],
};

const REQUIRED_FIELDS: (keyof ExtractedCaseFields)[] = [
  "awb",
  "client_name_raw",
  "escalation_date",
  "reason",
];

function firstMatch(patterns: RegExp[], text: string): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim().replace(/\s+/g, " ");
  }
  return null;
}

function extractSharedFields(bodyText: string): Omit<ExtractedCaseFields, "awb"> {
  const result: Partial<Omit<ExtractedCaseFields, "awb">> = {};
  for (const [field, patterns] of Object.entries(KEYWORD_PATTERNS) as [
    keyof Omit<ExtractedCaseFields, "awb">,
    RegExp[]
  ][]) {
    result[field] = firstMatch(patterns, bodyText);
  }
  return result as Omit<ExtractedCaseFields, "awb">;
}

/**
 * Detects a simple pipe/tab/multi-space delimited table inside the body
 * where one column is AWB-shaped, and returns { awb, hub } rows.
 * Handles headers like "AWB | WH", "AWB Number\tHub", "AWB    Location".
 */
function extractAwbTableRows(bodyText: string): { awb: string; hub: string | null }[] {
  const lines = bodyText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: { awb: string; hub: string | null }[] = [];

  for (const line of lines) {
    const cells = line
      .split(/\s*\|\s*|\t+|\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);

    if (cells.length < 1) continue;

    const awbCell = cells.find((c) => looksLikeAwb(c));
    if (!awbCell) continue;

    const otherCell = cells.find((c) => c !== awbCell);
    rows.push({ awb: awbCell, hub: otherCell ?? null });
  }

  // Fallback: no clean table detected, just scan the whole body for
  // AWB-shaped tokens with no hub info.
  if (rows.length === 0) {
    for (const awb of extractAwbCandidates(bodyText)) {
      rows.push({ awb, hub: null });
    }
  }

  return rows;
}

export function extractCasesFromEmail(params: {
  subject: string;
  bodyText: string;
}): ExtractionResult[] {
  const shared = extractSharedFields(params.bodyText);
  const awbRows = extractAwbTableRows(params.bodyText);

  if (awbRows.length === 0) {
    // No AWB found at all — return a single all-manual-review result so
    // the team still gets a review screen instead of a silent no-op.
    const fields: ExtractedCaseFields = { awb: null, ...shared };
    return [
      {
        fields,
        confidence: 0,
        missingFields: REQUIRED_FIELDS.filter((f) => !fields[f]),
        needsManualReview: true,
      },
    ];
  }

  return awbRows.map(({ awb, hub }) => {
    const fields: ExtractedCaseFields = {
      awb,
      ...shared,
      hub: shared.hub ?? hub,
      location: shared.location ?? hub,
    };
    const missingFields = REQUIRED_FIELDS.filter((f) => !fields[f]);
    // Confidence: found AWB via a real table structure + all required
    // fields present -> high; missing required fields drags it down.
    const base = hub ? 0.85 : 0.6;
    const confidence = Math.max(0, base - missingFields.length * 0.15);
    return {
      fields,
      confidence: Math.round(confidence * 100) / 100,
      missingFields,
      needsManualReview: confidence < 0.7 || missingFields.length > 0,
    };
  });
}
