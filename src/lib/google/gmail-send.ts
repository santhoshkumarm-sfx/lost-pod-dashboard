import { google } from "googleapis";
import { getGoogleAuthClient } from "./auth";

const SEND_SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

function buildMimeMessage(params: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  attachment?: { filename: string; contentBase64: string; mimeType: string };
}): string {
  const boundary = `lpd_boundary_${Date.now()}`;
  const lines: string[] = [
    `From: ${params.from}`,
    `To: ${params.to.join(", ")}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    params.html,
    "",
  ];

  if (params.attachment) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${params.attachment.mimeType}; name="${params.attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${params.attachment.filename}"`,
      "",
      params.attachment.contentBase64,
      ""
    );
  }

  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}

export async function sendDailyReportEmail(params: {
  to: string[];
  subject: string;
  html: string;
  attachment?: { filename: string; contentBase64: string; mimeType: string };
}) {
  const auth = getGoogleAuthClient(SEND_SCOPES);
  const gmail = google.gmail({ version: "v1", auth });

  const from = process.env.REPORT_SENDER_EMAIL || process.env.GOOGLE_IMPERSONATE_USER || "me";
  const raw = buildMimeMessage({ from, to: params.to, subject: params.subject, html: params.html, attachment: params.attachment });
  const encoded = Buffer.from(raw).toString("base64url");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
}
