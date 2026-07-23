-- =============================================================================
-- Refashion IA · Migration 004
-- Grant the Data API roles the table privileges they were missing.
--
-- WHY: the project was created with "Automatically expose new tables" turned
-- OFF, so the tables from migration 001 never received the DML grants that the
-- `authenticated` role needs. They ended up with only REFERENCES/TRIGGER/
-- TRUNCATE — no SELECT, INSERT, UPDATE or DELETE.
--
-- Symptom: creating a client worked (create_client_with_owner is SECURITY
-- DEFINER, so it runs as the function owner and never needs the caller's
-- privileges), but reading it back returned "permission denied" — the client
-- was invisible in the app despite correct RLS policies and a correct
-- client_members row.
--
-- GRANT and RLS are two independent layers:
--   GRANT -> may this role touch the table at all?
--   RLS   -> which rows of it may this role see or change?
-- Both must pass. Perfect policies are useless without the grant.
--
-- NOTE: because auto-expose stays off, every future table needs its grants
-- added here explicitly. That is the intended trade-off: tables start closed.
-- =============================================================================

grant usage on schema public to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Strip privileges the API roles should never hold.
--    TRUNCATE in particular bypasses RLS entirely.
--    `anon` keeps nothing: this is an internal tool, every route requires auth.
-- ---------------------------------------------------------------------------
revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. roles — fixed catalog, read-only
-- ---------------------------------------------------------------------------
grant select on public.roles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. profiles — a user reads and updates only their own row (RLS enforces it)
-- ---------------------------------------------------------------------------
grant select, update on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 4. clients — INSERT is deliberately NOT granted.
--    Client creation goes exclusively through create_client_with_owner()
--    (migration 003), which is SECURITY DEFINER and therefore does not need
--    this grant. Withholding INSERT makes an orphan client — one with no
--    members, invisible to everyone — impossible to create by any other path.
-- ---------------------------------------------------------------------------
grant select, update, delete on public.clients to authenticated;

-- ---------------------------------------------------------------------------
-- 5. client_members — owners manage membership; the bootstrap policy also
--    lives here (see migration 002)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.client_members to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The client -> project -> design -> asset hierarchy.
--    RLS restricts writes to owner/editor; viewers get reads only.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.designs  to authenticated;
grant select, insert, update, delete on public.assets   to authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type)
-- from information_schema.role_table_grants
-- where table_schema = 'public' and grantee in ('anon', 'authenticated')
-- group by table_name, grantee
-- order by table_name, grantee;
--
-- Expected: `authenticated` has SELECT (+ the writes listed above) on all seven
-- tables; `clients` shows no INSERT; `anon` shows no rows at all.
