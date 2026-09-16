import { google } from "googleapis";
import { getGoogleAuthClient, SHEETS_SCOPES } from "./auth";

export interface SheetTabRows {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[]; // header -> cell value, 1 entry per data row
}

function sheetsClient() {
  const auth = getGoogleAuthClient(SHEETS_SCOPES);
  return google.sheets({ version: "v4", auth });
}

/** Lists every tab name in a workbook, so the importer can iterate them all. */
export async function listSheetTabs(spreadsheetId: string): Promise<string[]> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.get({ spreadsheetId });
  return (data.sheets ?? []).map((s) => s.properties?.title).filter((t): t is string => !!t);
}

/**
 * Reads one tab and returns rows keyed by header — the first non-empty
 * row is treated as the header row. Ragged rows (missing trailing cells)
 * are padded with "" rather than dropped, since a missing column is
 * exactly the kind of inconsistency this importer must tolerate.
 */
export async function readSheetTab(spreadsheetId: string, sheetName: string): Promise<SheetTabRows> {
  const sheets = sheetsClient();
  const range = `${sheetName}`;
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const values = data.values ?? [];
  if (values.length === 0) return { sheetName, headers: [], rows: [] };

  const headers = (values[0] ?? []).map((h: unknown) => String(h ?? "").trim()).filter(Boolean);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < values.length; i++) {
    const raw = values[i];
    if (!raw || raw.every((c: unknown) => c === "" || c == null)) continue; // skip blank rows
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = raw[idx] == null ? "" : String(raw[idx]);
    });
    rows.push(row);
  }

  return { sheetName, headers, rows };
}

export async function readAllTabs(spreadsheetId: string): Promise<SheetTabRows[]> {
  const tabNames = await listSheetTabs(spreadsheetId);
  return Promise.all(tabNames.map((name) => readSheetTab(spreadsheetId, name)));
}
