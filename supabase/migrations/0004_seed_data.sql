-- =====================================================================
-- 0004_seed_data.sql
-- Reference/demo data only. Safe to skip in production (see README).
-- Users/profiles are NOT seeded here — create them via Supabase Auth
-- (scripts/seed-demo-data.ts) so passwords are hashed by Supabase, not
-- inserted in plaintext SQL.
-- =====================================================================

insert into public.clients (name, code, default_sla_days) values
  ('Flipkart', 'FLIPKART', 7),
  ('Nykaa',    'NYKAA',    7),
  ('Myntra',   'MYNTRA',   7),
  ('AJIO',     'AJIO',     10),
  ('FirstCry', 'FIRSTCRY', 10)
on conflict (name) do nothing;

-- Example column-mapping profile for a Flipkart-style tracker
-- (columns: Client, Esc Date, Ageing, AWB, Location/Hub, Delivery Date,
--  Seller Name, POD Link, Remarks, Agent, POC, Status)
with p as (
  insert into public.column_mapping_profiles (name, client_id)
  select 'Flipkart — RSC tracker (default)', id from public.clients where code = 'FLIPKART'
  returning id
)
insert into public.column_mapping_rules (profile_id, source_header_pattern, target_field, match_type, priority)
select p.id, rule.pattern, rule.target, rule.match_type, rule.priority
from p, (values
  ('awb',                'awb',              'exact',    10),
  ('awb no',              'awb',              'exact',    10),
  ('awb number',          'awb',              'exact',    10),
  ('tracking number',     'awb',              'exact',    10),
  ('esc date',            'escalation_date',  'exact',    10),
  ('esc. date',           'escalation_date',  'exact',    10),
  ('date',                'escalation_date',  'contains', 50),
  ('ageing',              'source_aging_raw', 'exact',    10),  -- captured but never trusted
  ('aging',               'source_aging_raw', 'exact',    10),
  ('location/hub',        'hub',              'exact',    10),
  ('location',            'location',         'exact',    10),
  ('hub',                 'hub',              'exact',    10),
  ('hub/dc',              'hub',              'exact',    10),
  ('delivery date',       'delivery_date',    'exact',    10),
  ('seller name',         'seller_name',      'exact',    10),
  ('pod link',            'pod_link',         'exact',    10),
  ('remarks',             'team_remark',      'exact',    20),
  ('sfx remark',          'team_remark',      'exact',    10),
  ('shadowfax remark',    'team_remark',      'exact',    10),
  ('shadowfax remarks',   'team_remark',      'exact',    10),
  ('client remark',       'client_remark',    'exact',    10),
  ('agent',               'assigned_agent_raw','exact',   10),
  ('poc',                 'client_poc_raw',   'exact',    10),
  ('status',              'team_status',      'exact',    10),
  ('rider',               'rider_name_raw',   'exact',    10),
  ('rider id',            'rider_id_raw',     'exact',    10),
  ('complaint type',      'complaint_type',   'exact',    10),
  ('reason',              'reason',           'exact',    10),
  ('priority',            'priority',         'exact',    10),
  ('closure date',        'closure_date',     'exact',    10),
  ('mail subject',        'email_subject',    'exact',    10),
  ('client',               'client_name_raw',  'exact',    10),
  ('seller',               'seller_name',      'exact',    20)
) as rule(pattern, target, match_type, priority);
