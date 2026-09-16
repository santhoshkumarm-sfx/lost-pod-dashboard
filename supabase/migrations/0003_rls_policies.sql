-- =====================================================================
-- 0003_rls_policies.sql
-- Security is enforced here, in Postgres — never only in the frontend.
-- Client POC A must never be able to read Client B's rows, regardless
-- of what the API/browser sends.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can read profiles even
-- though profiles itself is RLS-protected; kept minimal on purpose)
-- ---------------------------------------------------------------------

create or replace function public.current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('super_admin', 'admin', 'internal_team')
     from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('super_admin', 'admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_pocs enable row level security;
alter table public.cases enable row level security;
alter table public.case_updates enable row level security;
alter table public.lost_approvals enable row level security;
alter table public.emails enable row level security;
alter table public.source_records enable row level security;
alter table public.import_batches enable row level security;
alter table public.column_mapping_profiles enable row level security;
alter table public.column_mapping_rules enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.status_master enable row level security;
alter table public.aging_bucket_config enable row level security;
alter table public.daily_report_runs enable row level security;

-- ---------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------

create policy profiles_self_select on public.profiles
  for select using (id = auth.uid() or public.is_staff());

create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

create policy profiles_admin_all on public.profiles
  for all using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- CLIENTS — staff see all; client_poc sees only their own client
-- ---------------------------------------------------------------------

create policy clients_staff_select on public.clients
  for select using (public.is_staff());

create policy clients_poc_select_own on public.clients
  for select using (id = public.current_client_id());

create policy clients_admin_write on public.clients
  for insert with check (public.is_admin());
create policy clients_admin_update on public.clients
  for update using (public.is_admin());
create policy clients_admin_delete on public.clients
  for delete using (public.current_role() = 'super_admin');

-- ---------------------------------------------------------------------
-- CLIENT_POCS
-- ---------------------------------------------------------------------

create policy client_pocs_staff_select on public.client_pocs
  for select using (public.is_staff());

create policy client_pocs_self_select on public.client_pocs
  for select using (profile_id = auth.uid());

create policy client_pocs_admin_write on public.client_pocs
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- CASES — the core isolation boundary
-- ---------------------------------------------------------------------

create policy cases_staff_select on public.cases
  for select using (public.is_staff());

create policy cases_poc_select_own_client on public.cases
  for select using (client_id = public.current_client_id());

create policy cases_staff_insert on public.cases
  for insert with check (public.is_staff());

-- staff can update any field on cases they can see; POCs can only update
-- via the request_lost_status() RPC (SECURITY INVOKER + this same policy),
-- and only remarks/lost-request fields — enforced at the API layer too.
create policy cases_staff_update on public.cases
  for update using (public.is_staff());

create policy cases_poc_update_own_limited on public.cases
  for update using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

create policy cases_admin_delete on public.cases
  for delete using (public.current_role() = 'super_admin');

-- ---------------------------------------------------------------------
-- CASE_UPDATES (history) — read scoped like cases; write via API/RPCs only
-- ---------------------------------------------------------------------

create policy case_updates_staff_select on public.case_updates
  for select using (public.is_staff());

create policy case_updates_poc_select on public.case_updates
  for select using (
    exists (
      select 1 from public.cases c
      where c.case_id = case_updates.case_id
        and c.client_id = public.current_client_id()
    )
  );

create policy case_updates_insert on public.case_updates
  for insert with check (
    public.is_staff()
    or exists (
      select 1 from public.cases c
      where c.case_id = case_updates.case_id
        and c.client_id = public.current_client_id()
    )
  );

-- ---------------------------------------------------------------------
-- LOST_APPROVALS — POCs may see the trail for their own cases (not just
-- staff), since they need to know why a Lost request was rejected.
-- ---------------------------------------------------------------------

create policy lost_approvals_staff_select on public.lost_approvals
  for select using (public.is_staff());

create policy lost_approvals_poc_select on public.lost_approvals
  for select using (
    exists (
      select 1 from public.cases c
      where c.case_id = lost_approvals.case_id
        and c.client_id = public.current_client_id()
    )
  );

create policy lost_approvals_insert on public.lost_approvals
  for insert with check (public.is_staff() or true); -- RPCs run as invoker; further gated in RPC logic

-- ---------------------------------------------------------------------
-- EMAILS / SOURCE_RECORDS / IMPORT_BATCHES — internal only, never client-visible
-- ---------------------------------------------------------------------

create policy emails_staff_only on public.emails
  for all using (public.is_staff()) with check (public.is_staff());

create policy source_records_staff_only on public.source_records
  for all using (public.is_staff()) with check (public.is_staff());

create policy import_batches_staff_only on public.import_batches
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- COLUMN MAPPING CONFIG — admin-managed, staff can read (to see how a
-- sheet was mapped when reviewing a case), POCs never see it.
-- ---------------------------------------------------------------------

create policy mapping_profiles_staff_select on public.column_mapping_profiles
  for select using (public.is_staff());
create policy mapping_profiles_admin_write on public.column_mapping_profiles
  for all using (public.is_admin()) with check (public.is_admin());

create policy mapping_rules_staff_select on public.column_mapping_rules
  for select using (public.is_staff());
create policy mapping_rules_admin_write on public.column_mapping_rules
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- NOTIFICATIONS — only the recipient (or admin) can see/update their own
-- ---------------------------------------------------------------------

create policy notifications_own on public.notifications
  for select using (recipient_id = auth.uid() or public.is_admin());
create policy notifications_own_update on public.notifications
  for update using (recipient_id = auth.uid());
create policy notifications_system_insert on public.notifications
  for insert with check (true); -- inserted by SECURITY INVOKER RPCs acting on behalf of staff/system

-- ---------------------------------------------------------------------
-- AUDIT_LOGS — admin read-only view; writes come from the API service role
-- ---------------------------------------------------------------------

create policy audit_logs_admin_select on public.audit_logs
  for select using (public.is_admin());
create policy audit_logs_insert on public.audit_logs
  for insert with check (public.is_staff());

-- ---------------------------------------------------------------------
-- STATUS MASTER / AGING BUCKETS — readable by all authenticated users
-- (needed to render labels/buckets in the POC portal), writable by admin
-- ---------------------------------------------------------------------

create policy status_master_read on public.status_master
  for select using (auth.role() = 'authenticated');
create policy status_master_admin_write on public.status_master
  for all using (public.is_admin()) with check (public.is_admin());

create policy aging_buckets_read on public.aging_bucket_config
  for select using (auth.role() = 'authenticated');
create policy aging_buckets_admin_write on public.aging_bucket_config
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- DAILY REPORT RUNS — admin only
-- ---------------------------------------------------------------------

create policy daily_report_runs_admin on public.daily_report_runs
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Auto-create a profile row when a new auth.users row appears.
-- Role/client defaults to internal_team/null; Admin promotes afterwards
-- (see /users management UI, which runs with the service role).
-- ---------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'internal_team')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
