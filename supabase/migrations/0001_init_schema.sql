-- =====================================================================
-- 0001_init_schema.sql
-- Lost Shipment / POD Management Dashboard — core schema
-- Supabase Postgres. Run in order with the other migration files.
-- =====================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- fuzzy search on AWB/subject/remarks

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------

create type user_role as enum (
  'super_admin',
  'admin',
  'internal_team',
  'client_poc'
);

create type source_type as enum (
  'google_sheet',
  'email',
  'manual'
);

create type case_status_category as enum (
  'open',
  'lost_pending_approval',
  'lost',
  'closed'
);

create type approval_action as enum (
  'requested',
  'approved',
  'rejected',
  'sent_back_for_investigation'
);

create type pod_status as enum (
  'not_shared',
  'requested',
  'shared',
  'invalid',
  'not_applicable'
);

-- ---------------------------------------------------------------------
-- PROFILES  (1:1 with auth.users; role + client scoping live here)
-- ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role user_role not null default 'internal_team',
  -- populated only when role = 'client_poc'; enforced by trigger below
  client_id uuid,                       -- fk added after clients table exists
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Every authenticated user (internal staff + client POCs). role drives RLS.';

-- ---------------------------------------------------------------------
-- CLIENTS
-- ---------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,                     -- short code, e.g. 'FLIPKART', 'NYKAA'
  is_active boolean not null default true,
  default_sla_days integer default 7,   -- used for TAT/SLA breach calc
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete set null;

-- a profile may only carry a client_id when it is a client_poc
alter table public.profiles
  add constraint profiles_client_scope_chk
  check (
    (role = 'client_poc' and client_id is not null)
    or (role <> 'client_poc')
  );

-- ---------------------------------------------------------------------
-- CLIENT POCs  (POC is a profile; this table adds POC-specific metadata
-- and lets one client have many POCs with per-POC visibility settings)
-- ---------------------------------------------------------------------

create table public.client_pocs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  designation text,
  can_request_lost boolean not null default true,
  can_view_internal_remarks boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_client_pocs_client on public.client_pocs(client_id);

-- ---------------------------------------------------------------------
-- STATUS MASTER  (configurable operational statuses)
-- ---------------------------------------------------------------------

create table public.status_master (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,            -- machine key, e.g. 'POD_SHARED'
  label text not null,                  -- display label
  category case_status_category not null,
  sort_order integer not null default 100,
  is_terminal boolean not null default false,   -- true for Closed / Lost
  is_active boolean not null default true,
  is_system boolean not null default false,     -- system statuses can't be deleted
  created_at timestamptz not null default now()
);

insert into public.status_master (code, label, category, sort_order, is_terminal, is_system) values
  ('PENDING',                    'Pending',                          'open',                  10, false, true),
  ('WORKING_ON_IT',               'Working on it',                    'open',                  20, false, true),
  ('SHIPMENT_AT_DC',              'Shipment at DC',                   'open',                  30, false, true),
  ('SHIPMENT_AT_HUB',             'Shipment at Hub',                  'open',                  40, false, true),
  ('POD_SHARED',                  'POD Shared',                       'open',                  50, false, true),
  ('LOST_PENDING_APPROVAL',       'Lost — Pending Admin Approval',    'lost_pending_approval', 60, false, true),
  ('LOST',                        'Lost',                             'lost',                  70, true,  true),
  ('CLOSED',                      'Closed',                           'closed',                80, true,  true);

-- ---------------------------------------------------------------------
-- AGING BUCKET CONFIG  (admin-configurable; dashboard always reads this)
-- ---------------------------------------------------------------------

create table public.aging_bucket_config (
  id uuid primary key default gen_random_uuid(),
  label text not null,                  -- '0-2', '3-7', ...
  min_days integer not null,
  max_days integer,                     -- null = open-ended (e.g. 90+)
  sort_order integer not null,
  is_active boolean not null default true
);

insert into public.aging_bucket_config (label, min_days, max_days, sort_order) values
  ('0-2',   0,  2,   10),
  ('3-7',   3,  7,   20),
  ('8-15',  8,  15,  30),
  ('16-30', 16, 30,  40),
  ('31-60', 31, 60,  50),
  ('61-90', 61, 90,  60),
  ('90+',   91, null,70);

-- ---------------------------------------------------------------------
-- CASES  (the central table)
-- ---------------------------------------------------------------------

create table public.cases (
  case_id uuid primary key default gen_random_uuid(),
  case_number text not null unique,     -- human friendly, e.g. LPD-000123 (set by trigger)

  awb text not null,
  client_id uuid not null references public.clients(id),
  client_poc_id uuid references public.client_pocs(id),

  escalation_date date not null,
  delivery_date date,

  location text,
  hub text,
  seller_name text,

  complaint_type text,
  reason text,
  priority text default 'Normal',       -- Low / Normal / High / Critical (free text, configurable later)

  shipment_status text,                 -- carrier/network-facing status, free text from source
  status_code text not null default 'PENDING' references public.status_master(code),
  pod_status pod_status not null default 'not_shared',
  pod_link text,

  -- source lineage — never nullable-away; every case must say where it came from
  source_type source_type not null,
  source_workbook text,
  source_sheet text,
  source_row integer,
  source_record_hash text,              -- dedup key for sheet rows

  email_subject text,
  email_message_id text,
  email_thread_id text,

  team_status text,                     -- legacy/raw status text from source, kept for audit
  team_remark text,
  client_remark text,

  assigned_agent uuid references public.profiles(id),

  -- aging: NEVER trust source ageing columns. Always derived.
  final_aging_days integer,             -- frozen at closure/lost-approval time
  closure_date date,

  -- lost workflow
  lost_requested_at timestamptz,
  lost_requested_by uuid references public.profiles(id),
  lost_approved_at timestamptz,
  lost_approved_by uuid references public.profiles(id),

  needs_manual_review boolean not null default false,
  extraction_confidence numeric(3,2),   -- 0.00 - 1.00, for email-extracted cases

  product_name text,
  product_value numeric(12,2),

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- AWB is indexed for duplicate *detection*, but intentionally NOT unique —
-- the same AWB can legitimately recur across separate escalations.
create index idx_cases_awb on public.cases using btree (awb);
create index idx_cases_awb_trgm on public.cases using gin (awb gin_trgm_ops);
create index idx_cases_client on public.cases (client_id);
create index idx_cases_status on public.cases (status_code);
create index idx_cases_source_type on public.cases (source_type);
create index idx_cases_escalation_date on public.cases (escalation_date);
create index idx_cases_hub on public.cases (hub);
create index idx_cases_email_thread on public.cases (email_thread_id);
create index idx_cases_subject_trgm on public.cases using gin (email_subject gin_trgm_ops);

-- source_row is only meaningful for google_sheet rows; source_record_hash
-- lets the importer UPSERT without creating duplicate cases on re-sync.
create unique index uq_cases_source_hash
  on public.cases (source_record_hash)
  where source_record_hash is not null;

-- ---------------------------------------------------------------------
-- CASE UPDATES / HISTORY  (every field change, status change, remark)
-- ---------------------------------------------------------------------

create table public.case_updates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(case_id) on delete cascade,
  changed_by uuid references public.profiles(id),
  action text not null,                 -- e.g. 'STATUS_CHANGE', 'REMARK_ADDED', 'CREATED', 'FIELD_UPDATE'
  field_name text,
  old_value text,
  new_value text,
  source source_type,
  note text,
  created_at timestamptz not null default now()
);

create index idx_case_updates_case on public.case_updates (case_id, created_at desc);

-- ---------------------------------------------------------------------
-- LOST APPROVAL HISTORY  (dedicated trail for the lost-approval workflow)
-- ---------------------------------------------------------------------

create table public.lost_approvals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(case_id) on delete cascade,
  action approval_action not null,
  acted_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

create index idx_lost_approvals_case on public.lost_approvals (case_id, created_at desc);

-- ---------------------------------------------------------------------
-- EMAILS  (raw email/thread reference — audit + re-extraction source)
-- ---------------------------------------------------------------------

create table public.emails (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null,
  gmail_thread_id text not null,
  subject text not null,
  sender text not null,
  recipients text,
  email_date timestamptz not null,
  snippet text,
  body_text text,                       -- plain-text body actually parsed (never the AI summary)
  body_html text,
  raw_ref text,                         -- storage pointer if body archived externally
  client_id uuid references public.clients(id),
  imported_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (gmail_message_id)
);

create index idx_emails_thread on public.emails (gmail_thread_id);
create index idx_emails_subject_trgm on public.emails using gin (subject gin_trgm_ops);

-- ---------------------------------------------------------------------
-- SOURCE RECORDS  (raw google-sheet rows, kept verbatim for audit/replay)
-- ---------------------------------------------------------------------

create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  source_type source_type not null,
  workbook_id text,                     -- Google Sheets spreadsheetId
  workbook_name text,
  sheet_name text,
  row_number integer,
  row_hash text not null,               -- hash of raw row, used for UPSERT/dedup
  raw_json jsonb not null,              -- the untouched source row
  mapped_json jsonb,                    -- result after column-mapping
  case_id uuid references public.cases(case_id) on delete set null,
  import_batch_id uuid,
  sync_status text not null default 'pending', -- pending | mapped | created | updated | error | skipped
  error_message text,
  created_at timestamptz not null default now(),
  unique (workbook_id, sheet_name, row_hash)
);

create index idx_source_records_batch on public.source_records (import_batch_id);
create index idx_source_records_case on public.source_records (case_id);

-- ---------------------------------------------------------------------
-- IMPORT BATCHES  (one row per sheets-sync run, for observability)
-- ---------------------------------------------------------------------

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_type source_type not null,
  workbook_id text,
  workbook_name text,
  sheet_name text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_seen integer default 0,
  rows_created integer default 0,
  rows_updated integer default 0,
  rows_skipped integer default 0,
  rows_errored integer default 0,
  triggered_by uuid references public.profiles(id),
  status text not null default 'running' -- running | completed | failed
);

-- ---------------------------------------------------------------------
-- COLUMN MAPPING CONFIG  (admin-configurable source-column -> case-field)
-- ---------------------------------------------------------------------

create table public.column_mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,                   -- e.g. 'Flipkart RSC default'
  client_id uuid references public.clients(id),  -- null = generic/fallback profile
  workbook_id text,                     -- optional: pin to a specific workbook
  sheet_name text,                      -- optional: pin to a specific tab
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.column_mapping_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.column_mapping_profiles(id) on delete cascade,
  source_header_pattern text not null,  -- normalized/lowercased header text to match
  target_field text not null,           -- e.g. 'awb', 'escalation_date', 'hub'
  match_type text not null default 'exact', -- exact | contains | regex
  transform text,                       -- optional: 'date:dd-mm-yyyy', 'trim', 'uppercase'
  priority integer not null default 100
);

create index idx_mapping_rules_profile on public.column_mapping_rules (profile_id);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS  (in-app; e.g. admin notified of a Lost request)
-- ---------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,                   -- 'LOST_APPROVAL_REQUESTED', 'LOST_APPROVED', ...
  title text not null,
  body text,
  case_id uuid references public.cases(case_id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_recipient on public.notifications (recipient_id, is_read);

-- ---------------------------------------------------------------------
-- AUDIT LOGS  (system-wide: logins, user/client/role management, settings)
-- ---------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,                 -- 'USER_CREATED', 'ROLE_CHANGED', 'MAPPING_UPDATED', ...
  entity_type text not null,            -- 'profile' | 'client' | 'case' | 'column_mapping_profile' | ...
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_entity on public.audit_logs (entity_type, entity_id);
create index idx_audit_logs_actor on public.audit_logs (actor_id, created_at desc);

-- ---------------------------------------------------------------------
-- DAILY REPORT LOG  (record of each sent daily-summary email, for audit)
-- ---------------------------------------------------------------------

create table public.daily_report_runs (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  recipients text[] not null,
  attachment_ref text,
  summary_json jsonb,
  status text not null default 'pending', -- pending | sent | failed
  error_message text,
  created_at timestamptz not null default now()
);
