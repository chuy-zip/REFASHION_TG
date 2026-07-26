-- =============================================================================
-- Refashion IA · Migration 007
-- Give the service_role the table privileges it was missing, and stop this
-- class of bug from recurring.
--
-- WHY: migration 004 granted table privileges to `authenticated` but never to
-- `service_role`. With "Automatically expose new tables" off, service_role got
-- no grants on the migration-001 tables either. The admin client (secret key ->
-- service_role) then failed with "permission denied for table profiles" when
-- changing a user's role, and likewise on client_members during user deletion.
--
-- service_role bypasses RLS but still needs table GRANTs — same GRANT-vs-RLS
-- split documented in SETUP_SUPABASE_R2.md, one layer down.
--
-- Unlike `authenticated`, service_role is a trusted server-only role (it never
-- reaches the browser), so granting it broadly is safe and matches Supabase's
-- own defaults. The default-privileges block means future tables grant to it
-- automatically — no more per-table service_role migrations.
-- =============================================================================

grant usage on schema public to service_role;

-- Existing tables and sequences.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Future tables/sequences created in this schema (by the migration role) will
-- grant to service_role automatically. Does NOT apply to `authenticated`,
-- which must keep starting closed.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- select table_name, string_agg(privilege_type, ', ' order by privilege_type)
-- from information_schema.role_table_grants
-- where table_schema = 'public' and grantee = 'service_role'
-- group by table_name order by table_name;
--
-- Expected: every table lists SELECT, INSERT, UPDATE, DELETE (and more).
