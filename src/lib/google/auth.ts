import { google } from "googleapis";

/**
 * Server-only Google auth helper. Two supported modes, chosen by which
 * env vars are present (see .env.example):
 *
 *  1. OAuth2 + refresh token (default) — a Shadowfax admin authorizes the
 *     app once via /api/google/oauth/callback, and the long-lived refresh
 *     token is stored as GOOGLE_REFRESH_TOKEN. Works for a personal or
 *     shared mailbox without Workspace admin involvement.
 *
 *  2. Service account + domain-wide delegation — set
 *     GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY /
 *     GOOGLE_IMPERSONATE_USER. Preferred for production Workspace setups
 *     since it doesn't depend on any single human's session.
 *
 * Never import this file from a "use client" component.
 */
export function getGoogleAuthClient(scopes: string[]) {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes,
      subject: process.env.GOOGLE_IMPERSONATE_USER, // mailbox/drive owner to act as
    });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2Client;
}

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
export const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
