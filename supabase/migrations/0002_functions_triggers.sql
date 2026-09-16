-- =====================================================================
-- 0002_functions_triggers.sql
-- Business logic that must hold regardless of which client hits the API:
--   * aging is always derived, never trusted from source
--   * a case can never jump straight from "POC marked Lost" to "Lost"
--   * every change is written to case_updates
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger trg_client_pocs_updated_at before update on public.client_pocs
  for each row execute function public.set_updated_at();
create trigger trg_cases_updated_at before update on public.cases
  for each row execute function public.set_updated_at();
create trigger trg_mapping_profiles_updated_at before update on public.column_mapping_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Human-friendly case numbers: LPD-000001, LPD-000002, ...
-- ---------------------------------------------------------------------

create sequence if not exists public.case_number_seq start 1;

create or replace function public.set_case_number()
returns trigger language plpgsql as $$
begin
  if new.case_number is null then
    new.case_number := 'LPD-' || lpad(nextval('public.case_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_cases_case_number before insert on public.cases
  for each row execute function public.set_case_number();

-- ---------------------------------------------------------------------
-- AGING — the single source of truth. Never read a source "ageing" column.
--   * Open cases: today - escalation_date
--   * Closed/Lost cases: final_aging_days, frozen at the moment status
--     entered a terminal state (set by trg_cases_freeze_final_aging)
-- ---------------------------------------------------------------------

create or replace function public.case_current_aging_days(p_escalation_date date)
returns integer language sql immutable as $$
  select (current_date - p_escalation_date)::integer;
$$;

create or replace function public.aging_bucket_for(p_days integer)
returns text language sql stable as $$
  select label from public.aging_bucket_config
  where is_active
    and p_days >= min_days
    and (max_days is null or p_days <= max_days)
  order by sort_order
  limit 1;
$$;

-- Convenience view: cases with live aging + bucket computed dynamically.
-- All dashboard/report queries should read FROM THIS VIEW, not public.cases,
-- so aging is always fresh and never stale/cached.
create or replace view public.cases_with_aging as
select
  c.*,
  case
    when c.status_code in ('LOST', 'CLOSED') and c.final_aging_days is not null
      then c.final_aging_days
    else public.case_current_aging_days(c.escalation_date)
  end as aging_days,
  case
    when c.status_code in ('LOST', 'CLOSED') and c.final_aging_days is not null
      then public.aging_bucket_for(c.final_aging_days)
    else public.aging_bucket_for(public.case_current_aging_days(c.escalation_date))
  end as aging_bucket,
  sm.label as status_label,
  sm.category as status_category,
  cl.name as client_name_resolved
from public.cases c
join public.status_master sm on sm.code = c.status_code
join public.clients cl on cl.id = c.client_id;

-- Freeze final_aging_days + closure_date the moment a case becomes terminal.
create or replace function public.freeze_final_aging()
returns trigger language plpgsql as $$
begin
  if new.status_code in ('LOST', 'CLOSED')
     and (old.status_code is distinct from new.status_code) then
    new.final_aging_days := public.case_current_aging_days(new.escalation_date);
    new.closure_date := coalesce(new.closure_date, current_date);
  end if;
  return new;
end;
$$;

create trigger trg_cases_freeze_final_aging before update on public.cases
  for each row execute function public.freeze_final_aging();

-- ---------------------------------------------------------------------
-- LOST-APPROVAL GATE
-- A client_poc (or anyone) requesting "Lost" NEVER lands directly on
-- status_code = 'LOST'. Application code should call
-- public.request_lost_status(case_id, actor_id, reason) rather than
-- UPDATE-ing status_code directly — but this trigger is a hard backstop
-- so the rule holds even if a bug in the API tries to bypass it.
-- ---------------------------------------------------------------------

create or replace function public.enforce_lost_approval_gate()
returns trigger language plpgsql as $$
begin
  if new.status_code = 'LOST' and old.status_code <> 'LOST_PENDING_APPROVAL' then
    raise exception
      'Cases must pass through LOST_PENDING_APPROVAL before becoming LOST. Use the approval workflow.';
  end if;
  return new;
end;
$$;

create trigger trg_cases_lost_gate before update on public.cases
  for each row execute function public.enforce_lost_approval_gate();

-- RPC: a POC (or agent) requests Lost. Always routes to pending-approval.
create or replace function public.request_lost_status(
  p_case_id uuid,
  p_actor_id uuid,
  p_reason text default null
) returns public.cases language plpgsql security invoker as $$
declare
  v_case public.cases;
begin
  update public.cases
  set status_code = 'LOST_PENDING_APPROVAL',
      lost_requested_at = now(),
      lost_requested_by = p_actor_id
  where case_id = p_case_id
  returning * into v_case;

  insert into public.lost_approvals (case_id, action, acted_by, reason)
  values (p_case_id, 'requested', p_actor_id, p_reason);

  insert into public.case_updates (case_id, changed_by, action, field_name, old_value, new_value, note)
  values (p_case_id, p_actor_id, 'STATUS_CHANGE', 'status_code', v_case.status_code, 'LOST_PENDING_APPROVAL', p_reason);

  -- notify every admin / super_admin
  insert into public.notifications (recipient_id, type, title, body, case_id)
  select id, 'LOST_APPROVAL_REQUESTED',
         'Lost approval requested: ' || v_case.case_number,
         coalesce(p_reason, 'A client POC requested this shipment be marked Lost.'),
         p_case_id
  from public.profiles
  where role in ('admin', 'super_admin') and is_active;

  return v_case;
end;
$$;

-- RPC: admin decision on a pending Lost request.
create or replace function public.decide_lost_status(
  p_case_id uuid,
  p_actor_id uuid,
  p_decision approval_action,   -- 'approved' | 'rejected' | 'sent_back_for_investigation'
  p_reason text default null
) returns public.cases language plpgsql security invoker as $$
declare
  v_case public.cases;
  v_old_status text;
  v_new_status text;
begin
  select status_code into v_old_status from public.cases where case_id = p_case_id;

  if v_old_status <> 'LOST_PENDING_APPROVAL' then
    raise exception 'Case % is not currently pending Lost approval (status: %)', p_case_id, v_old_status;
  end if;

  v_new_status := case p_decision
    when 'approved' then 'LOST'
    when 'rejected' then 'WORKING_ON_IT'
    when 'sent_back_for_investigation' then 'PENDING'
    else v_old_status
  end;

  update public.cases
  set status_code = v_new_status,
      lost_approved_at = case when p_decision = 'approved' then now() else lost_approved_at end,
      lost_approved_by = case when p_decision = 'approved' then p_actor_id else lost_approved_by end
  where case_id = p_case_id
  returning * into v_case;

  insert into public.lost_approvals (case_id, action, acted_by, reason)
  values (p_case_id, p_decision, p_actor_id, p_reason);

  insert into public.case_updates (case_id, changed_by, action, field_name, old_value, new_value, note)
  values (p_case_id, p_actor_id, 'STATUS_CHANGE', 'status_code', v_old_status, v_new_status, p_reason);

  if v_case.lost_requested_by is not null then
    insert into public.notifications (recipient_id, type, title, body, case_id)
    values (
      v_case.lost_requested_by,
      'LOST_DECISION_' || upper(p_decision::text),
      'Lost request for ' || v_case.case_number || ': ' || p_decision::text,
      p_reason,
      p_case_id
    );
  end if;

  return v_case;
end;
$$;

-- ---------------------------------------------------------------------
-- Generic status-change logger for any *other* status transition
-- (Pending -> Working on it -> Shipment at DC -> ... -> POD Shared -> Closed).
-- The Lost path is handled by the RPCs above and is exempt here to avoid
-- double-logging.
-- ---------------------------------------------------------------------

create or replace function public.log_case_status_change()
returns trigger language plpgsql as $$
begin
  if old.status_code is distinct from new.status_code
     and new.status_code not in ('LOST_PENDING_APPROVAL', 'LOST') then
    insert into public.case_updates (case_id, action, field_name, old_value, new_value)
    values (new.case_id, 'STATUS_CHANGE', 'status_code', old.status_code, new.status_code);
  end if;
  return new;
end;
$$;

create trigger trg_cases_log_status_change after update on public.cases
  for each row execute function public.log_case_status_change();

-- Log case creation.
create or replace function public.log_case_created()
returns trigger language plpgsql as $$
begin
  insert into public.case_updates (case_id, changed_by, action, source, note)
  values (new.case_id, new.created_by, 'CREATED', new.source_type,
          'Case created via ' || new.source_type::text);
  return new;
end;
$$;

create trigger trg_cases_log_created after insert on public.cases
  for each row execute function public.log_case_created();
