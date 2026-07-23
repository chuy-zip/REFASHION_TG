-- =============================================================================
-- Refashion IA · Migration 003
-- Atomic client creation: create the client AND claim ownership in one call.
--
-- WHY: creating a client needs two INSERTs (clients, then client_members with
-- role 'owner'). supabase-js cannot run a multi-statement transaction — each
-- .from().insert() is a separate PostgREST request — so the two could diverge.
--
-- The documented remedy ("if the second INSERT fails, DELETE the client") does
-- not work: the delete policy is `is_client_owner(id)`, and if the second INSERT
-- failed the creator is NOT an owner. The rollback would silently delete 0 rows
-- and leave an orphan client that nobody can see or remove.
--
-- A plpgsql function runs inside a single implicit transaction, so if either
-- INSERT fails the whole thing rolls back. No orphans, no bootstrap window.
-- =============================================================================

create or replace function public.create_client_with_owner(
  p_name    text,
  p_nit     text default null,
  p_address text default null,
  p_city    text default null,
  p_country text default null,
  p_notes   text default null
)
returns public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_client  public.clients;
begin
  -- SECURITY DEFINER bypasses RLS, so authentication must be checked here.
  -- auth.uid() still resolves to the CALLING user: SECURITY DEFINER changes the
  -- role, not the request's JWT claims.
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.clients (name, nit, address, city, country, notes)
  values (
    p_name,
    p_nit,
    p_address,
    p_city,
    -- Passing NULL explicitly would override the column default, so restore it.
    coalesce(p_country, 'Guatemala'),
    p_notes
  )
  returning * into v_client;

  -- The creator becomes owner. user_id is taken from the JWT, never from a
  -- parameter, so a caller cannot make someone else the owner.
  insert into public.client_members (client_id, user_id, role)
  values (v_client.id, v_user_id, 'owner');

  return v_client;
end;
$$;

-- Only signed-in users may call it.
revoke all on function public.create_client_with_owner(text, text, text, text, text, text) from public;
grant execute on function public.create_client_with_owner(text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Force every client creation through the function above.
--
-- Migration 002 allowed any authenticated user to INSERT into clients directly,
-- which is exactly how an orphan client (one with no members) gets created.
-- Removing that policy makes the atomic RPC the only way in.
--
-- Note: this does not restrict the SQL editor or any secret-key/service_role
-- connection — those bypass RLS entirely.
--
-- To revert: recreate the policy from migration 002:
--   create policy "clients: authenticated can create"
--     on public.clients for insert with check (auth.uid() is not null);
-- ---------------------------------------------------------------------------
drop policy if exists "clients: authenticated can create" on public.clients;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- select routine_name from information_schema.routines
-- where routine_schema = 'public' and routine_name = 'create_client_with_owner';
--
-- Expected on public.clients after this migration: 3 policies
-- (select, update, delete) — the insert policy is intentionally gone.
-- select policyname, cmd from pg_policies
-- where schemaname = 'public' and tablename = 'clients' order by cmd;
