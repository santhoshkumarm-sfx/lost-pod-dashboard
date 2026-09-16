/**
 * AWB numbers across Flipkart/Nykaa/Myntra/AJIO/FirstCry style trackers
 * follow a handful of recurring shapes, e.g. "R2466544662BDM" (letter +
 * 10 digits + 3-letter hub suffix). These patterns are intentionally
 * permissive — false positives are filtered out downstream by requiring
 * the token to also appear near AWB-ish context (a header cell, or a
 * "AWB" keyword in the same line/table) before we trust it blindly.
 */
export const AWB_PATTERNS: RegExp[] = [
  /\b[A-Z]{1,2}\d{9,13}[A-Z]{2,4}\b/g, // e.g. R2466544662BDM, FM123456789NYK
  /\b\d{10,14}\b/g, // pure numeric AWBs used by some carriers
  /\b[A-Z]{2}\d{8,12}\b/g, // e.g. SF12345678
];

export function extractAwbCandidates(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of AWB_PATTERNS) {
    const matches = text.match(pattern) ?? [];
    for (const m of matches) found.add(m.trim());
  }
  return Array.from(found);
}

/** Loosely validates a single token looks AWB-shaped (used to sanity-check
 * a value pulled from a spreadsheet cell before trusting it as the AWB). */
export function looksLikeAwb(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 20) return false;
  return AWB_PATTERNS.some((p) => new RegExp(`^${p.source}$`, "i").test(trimmed));
}
