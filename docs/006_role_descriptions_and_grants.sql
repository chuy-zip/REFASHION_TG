-- =============================================================================
-- Refashion IA · Migration 006
-- Housekeeping after 005: make the role catalog tell the truth, and grant
-- EXECUTE on the global-role helpers so the API can call them.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The seeded descriptions described a model that was never implemented.
--    'viewer' in particular claimed "read-only access across the system", but
--    the global role does NOT restrict what you do inside a client — that is
--    decided by client_members.role. A global viewer invited to a client as
--    'editor' can edit that client, by design.
-- ---------------------------------------------------------------------------
update public.roles
set description = 'Full access: sees and manages every client, and manages users'
where name = 'admin';

update public.roles
set description = 'Can create clients (becomes owner of them); works on any client where invited'
where name = 'editor';

update public.roles
set description = 'Cannot create clients; access is granted per client via client_members'
where name = 'viewer';

-- ---------------------------------------------------------------------------
-- 2. The API calls is_global_admin() through PostgREST to gate /api/admin/*.
--    Granting EXECUTE explicitly removes any doubt, since this project has
--    "Automatically expose new tables" turned off.
-- ---------------------------------------------------------------------------
grant execute on function public.is_global_admin() to authenticated;
grant execute on function public.can_create_clients() to authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- select name, description from public.roles order by id;
