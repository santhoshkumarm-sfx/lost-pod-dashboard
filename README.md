# Lost Shipment / POD Management Dashboard

Trust & Safety internal tool that consolidates lost-shipment / POD escalations from Google
Sheets and Gmail into a single Supabase-backed case database, with a role-based Admin / Internal
Team / Client POC portal and a controlled Lost-approval workflow.

**GitHub = source code only. Supabase = the master operational database.** Google Sheets and
Gmail are input sources — they are never treated as the source of truth once a case exists.

## Status — what's built vs. what's next

This repo currently implements **Phase 1** end-to-end (see `MVP Development Order` in the spec):

- ✅ Full Postgres schema, RLS policies, and DB-level business rules (`supabase/migrations/`)
- ✅ Supabase Auth (email/password) for all roles
- ✅ Role-based dashboard shell (Super Admin / Admin / Internal Team / Client POC)
- ✅ Case list (search, filter, pagination, CSV export), case detail with full timeline
- ✅ Status workflow + the Lost → Pending Admin Approval → Lost gate, enforced in Postgres
  (not just the UI — see `enforce_lost_approval_gate()` in `0002_functions_triggers.sql`)
- ✅ Client / POC / internal-user management (Admin)
- ✅ Aging computed dynamically from `escalation_date`, never trusted from source data

Scaffolded but **not yet wired to a UI** (Phase 2/3, stub pages link to this README):

- 🚧 Google Sheets multi-workbook/multi-sheet importer — mapping engine exists at
  `src/lib/import/column-mapper.ts`, tables exist (`column_mapping_profiles`,
  `column_mapping_rules`, `source_records`, `import_batches`); needs the sync trigger + UI.
- 🚧 Gmail escalation import — extractor at `src/lib/import/email-extractor.ts`, Gmail client at
  `src/lib/google/gmail-client.ts`; needs the "Add Email Escalation" flow + review screen.
- 🚧 Daily consolidated admin email (Section 13) + the three Top-10 tables — `aging.ts` already
  has the right-to-left daily aging bucketing helper (`dailyAgingColumn`) the report needs.

## Tech stack

Next.js 14 (App Router) + TypeScript · Supabase (Postgres + Auth) · Tailwind · Recharts ·
Gmail API / Sheets API via `googleapis` · deploys to Vercel.

## 1. Create the Supabase project

1. Create a new project at supabase.com.
2. In the SQL editor, run the four migration files **in order**:
   `supabase/migrations/0001_init_schema.sql` → `0002_functions_triggers.sql` →
   `0003_rls_policies.sql` → `0004_seed_data.sql` (seed data is optional demo clients).
3. Copy **Project URL**, **anon public key**, and **service_role key** from
   Project Settings → API into your `.env.local` (see `.env.example`).
4. In Authentication → Providers, keep Email enabled. Turn off public sign-ups
   (Authentication → Settings → "Allow new users to sign up" → off) — every account in this app
   is provisioned by an Admin via the Users/POCs pages, never self-registered.

## 2. Create the Google Cloud project (for Gmail + Sheets, Phase 2/3)

1. Create a project at console.cloud.google.com, enable the **Gmail API** and
   **Google Sheets API**.
2. Configure an OAuth consent screen (internal, if you're on Google Workspace) and create an
   OAuth 2.0 Client ID (Web application) with your Vercel deployment URL as an authorized
   redirect URI, e.g. `https://your-app.vercel.app/api/google/oauth/callback`.
3. Put the client ID/secret in `.env.local` as `GOOGLE_OAUTH_CLIENT_ID` /
   `GOOGLE_OAUTH_CLIENT_SECRET`. The mailbox that gets connected (via the OAuth consent flow,
   not a hardcoded credential) is whichever inbox the escalations land in.

## 3. Local development

```bash
npm install
cp .env.example .env.local   # fill in real values — never commit .env.local
npm run dev
```

Create your first Super Admin directly in Supabase once, since no UI can bootstrap the first
account (every later account is created by an existing Admin):

```sql
-- after signing up once via Supabase Auth (dashboard: Authentication -> Add user),
-- promote that user's profile row:
update public.profiles set role = 'super_admin' where email = 'you@shadowfax.in';
```

## 4. Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel; set all variables from `.env.example` as Vercel Environment Variables
   (never commit `.env`/`.env.local` — `.gitignore` already excludes them).
3. `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe to expose to the browser
   (that's what `NEXT_PUBLIC_` means) — RLS is what actually protects the data, not secrecy of
   these two values. `SUPABASE_SERVICE_ROLE_KEY` and the Google OAuth secrets must **never** be
   prefixed `NEXT_PUBLIC_` and are only read in server-side code (`src/lib/supabase/server.ts`'s
   `createSupabaseServiceRoleClient`, API routes, server actions).
4. **After adding or changing any environment variable, redeploy** (Deployments → latest → ⋯ →
   Redeploy). `NEXT_PUBLIC_*` values are baked into the build at build time, not read at
   runtime — an already-built deployment won't pick up a variable you add afterward.

## Temporary public access (no login) — setup/testing only

Set two environment variables in Vercel, then redeploy:

```
AUTH_DISABLED=true
AUTH_DISABLED_ACTOR_ID=<id from: select id from public.profiles where role = 'super_admin'>
```

With this on:

- The login screen and middleware redirect are both skipped — anyone with the URL lands
  straight on the dashboard with full Admin access.
- Every page read goes through the service-role client (bypasses RLS entirely), not a
  per-visitor session — there is no per-user distinction while this is on.
- Every write (status change, Lost request/approval, user/client/POC creation) is attributed
  to the profile named by `AUTH_DISABLED_ACTOR_ID`, since there's no real logged-in visitor to
  attribute it to. Pick an existing `super_admin` row for this — it must already exist in
  `public.profiles` (and therefore in `auth.users`); this mode does not create one for you.
- The dashboard shows a visible amber banner the whole time this is on, as a reminder.

**Turn it off** by setting `AUTH_DISABLED=false` (or deleting both variables) and redeploying —
no code changes needed either way. Don't leave a publicly reachable URL in this mode for longer
than it takes to finish setup; if the deployment needs to be reachable before you're ready to
turn real login back on, put it behind Vercel's own Deployment Protection (Project Settings →
Deployment Protection) in the meantime.

## Security model

- Every table has RLS enabled (`0003_rls_policies.sql`). The frontend never filters by
  client for security — it filters for UX (e.g. hiding a column); if a Client POC edits a
  request to fetch another client's `case_id`, Postgres returns nothing, not a leaked row.
- The service-role client (`createSupabaseServiceRoleClient`) is used only in the handful of
  places that must bypass RLS by design (provisioning `auth.users`, the future daily-report
  cron, the future Sheets/Gmail import workers) — every one of those call sites does its own
  `requireRole()` check first, in code, because Postgres RLS does not apply once you're on the
  service-role key.
- The Lost-approval rule is enforced in the database (`enforce_lost_approval_gate` trigger), not
  only in the API layer — even a buggy or malicious direct `UPDATE` cannot skip
  `LOST_PENDING_APPROVAL`.

## Database schema

See `supabase/migrations/0001_init_schema.sql` for the full DDL. Key tables: `profiles`,
`clients`, `client_pocs`, `cases`, `case_updates`, `lost_approvals`, `emails`, `source_records`,
`import_batches`, `column_mapping_profiles` / `column_mapping_rules`, `status_master`,
`aging_bucket_config`, `notifications`, `audit_logs`, `daily_report_runs`. The
`cases_with_aging` view (in `0002_functions_triggers.sql`) is what every page and future report
should query — it computes `aging_days` / `aging_bucket` live rather than trusting any source
"Ageing" column.
