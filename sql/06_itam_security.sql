-- =====================================================================
-- 06_itam_security.sql : let the read-only dashboard user READ the IT
-- asset tables, and nothing else.
--
-- Run this AFTER 03_security.sql (which creates dashboard_reader) and
-- 04_itam_schema.sql. It does not touch the password.
-- =====================================================================

-- Layer 1: permissions. Look inside the schema and SELECT. Nothing else.
grant usage  on schema itam to dashboard_reader;
grant select on all tables in schema itam to dashboard_reader;  -- includes the two views

-- dashboard_reader is already read-only by default with a 5-second limit
-- (03_security.sql). Add itam to its search path so the AI box can find
-- the tables too.
alter role dashboard_reader set search_path = receiving, itam;

-- Layer 2: Row Level Security, the same as the receiving tables. Only
-- dashboard_reader has a policy, so any other role (like Supabase's
-- "anon") would see zero rows even if the schema were exposed.
do $$
declare t text;
begin
  foreach t in array array['locations', 'employees', 'models', 'assets', 'asset_events',
                           'device_checks', 'licenses', 'license_seats']
  loop
    execute format('alter table itam.%I enable row level security', t);
    execute format('drop policy if exists reader_can_read on itam.%I', t);
    execute format('create policy reader_can_read on itam.%I for select to dashboard_reader using (true)', t);
  end loop;
end
$$;
