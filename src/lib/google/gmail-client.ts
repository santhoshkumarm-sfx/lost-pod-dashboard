import { google } from "googleapis";
import { getGoogleAuthClient, GMAIL_SCOPES } from "./auth";

export interface GmailSearchHit {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export interface GmailMessageDetail extends GmailSearchHit {
  bodyText: string;
  bodyHtml: string | null;
  to: string;
}

function gmailClient() {
  const auth = getGoogleAuthClient(GMAIL_SCOPES);
  return google.gmail({ version: "v1", auth });
}

function headerValue(headers: { name?: string | null; value?: string | null }[] | undefined, name: string) {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/**
 * Decodes a base64url-encoded Gmail body part.
 */
function decodePart(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

/**
 * Walks the MIME tree and concatenates every text/plain part. We
 * deliberately extract the real body rather than relying on Gmail's
 * AI-generated summary, per the ingestion requirements — a summary can
 * silently drop table rows containing individual AWBs.
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extractPlainTextBody(payload: any): { text: string; html: string | null } {
  let text = "";
  let html: string | null = null;

  function walk(part: any) {
    if (!part) return;
    if (part.mimeType === "text/plain" && part.body?.data) {
      text += decodePart(part.body.data) + "\n";
    } else if (part.mimeType === "text/html" && part.body?.data) {
      html = decodePart(part.body.data);
    }
    for (const child of part.parts ?? []) walk(child);
  }
  walk(payload);

  // Fall back to stripping tags out of HTML if no plain-text part exists.
  // (Go through stripHtmlTags() rather than narrowing `html` inline — it was
  // reassigned inside the walk() closure above, which confuses TS's control
  // flow narrowing into typing it as `never` at the point of use here.)
  if (!text && html) {
    text = stripHtmlTags(html);
  }

  return { text: text.trim(), html };
}

/** Searches the connected mailbox for messages matching a subject string. */
export async function searchEmailsBySubject(subjectQuery: string, maxResults = 10): Promise<GmailSearchHit[]> {
  const gmail = gmailClient();
  const q = `subject:"${subjectQuery.replace(/"/g, '\\"')}"`;

  const { data } = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults,
  });

  const messages = data.messages ?? [];
  const hits: GmailSearchHit[] = [];

  for (const m of messages) {
    if (!m.id) continue;
    const { data: msg } = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });
    hits.push({
      messageId: msg.id!,
      threadId: msg.threadId!,
      subject: headerValue(msg.payload?.headers, "Subject"),
      from: headerValue(msg.payload?.headers, "From"),
      date: headerValue(msg.payload?.headers, "Date"),
      snippet: msg.snippet ?? "",
    });
  }

  return hits;
}

/** Fetches the full message (including plain-text body) for extraction. */
export async function getEmailDetail(messageId: string): Promise<GmailMessageDetail> {
  const gmail = gmailClient();
  const { data: msg } = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const { text, html } = extractPlainTextBody(msg.payload);

  return {
    messageId: msg.id!,
    threadId: msg.threadId!,
    subject: headerValue(msg.payload?.headers, "Subject"),
    from: headerValue(msg.payload?.headers, "From"),
    to: headerValue(msg.payload?.headers, "To"),
    date: headerValue(msg.payload?.headers, "Date"),
    snippet: msg.snippet ?? "",
    bodyText: text,
    bodyHtml: html,
  };
}

/** Fetches every message in a thread (used when one AWB list spans replies). */
export async function getThreadMessages(threadId: string): Promise<GmailMessageDetail[]> {
  const gmail = gmailClient();
  const { data } = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  return (data.messages ?? []).map((msg) => {
    const { text, html } = extractPlainTextBody(msg.payload);
    return {
      messageId: msg.id!,
      threadId: msg.threadId!,
      subject: headerValue(msg.payload?.headers, "Subject"),
      from: headerValue(msg.payload?.headers, "From"),
      to: headerValue(msg.payload?.headers, "To"),
      date: headerValue(msg.payload?.headers, "Date"),
      snippet: msg.snippet ?? "",
      bodyText: text,
      bodyHtml: html,
    };
  });
}
