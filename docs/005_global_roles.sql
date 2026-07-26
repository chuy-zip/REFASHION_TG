-- =============================================================================
-- Refashion IA · Migration 005
-- Make the global role (profiles.role_id) actually mean something.
--
-- Until now the app had TWO role systems but only enforced one:
--   profiles.role_id    (admin | editor | viewer)  -> decorative, read by nobody
--   client_members.role (owner | editor | viewer)  -> enforced by RLS
--
-- Model adopted:
--   admin  -> superuser: sees and edits every client, manages users
--   editor -> may create clients (becomes their owner); works where invited
--   viewer -> creates nothing; works only where invited, per client_members
--
-- Two security holes are closed here as well; neither was optional:
--   1. profiles.role_id defaulted to 1 = admin, so EVERY new user was born an
--      administrator unless someone remembered to change it by hand.
--   2. "profiles: update own" let any user run
--      UPDATE profiles SET role_id = 1 on their own row — trivial privilege
--      escalation the moment roles start granting anything.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Denormalise the email into profiles.
--
--    Emails live in auth.users, which the app cannot read with the publishable
--    key. Without a copy here, letting a client owner search a colleague to add
--    them as a member would require the SECRET key in a non-admin flow — i.e.
--    superuser credentials in an everyday feature. Copying the column keeps
--    that search under normal RLS.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

create index if not exists profiles_email_idx on public.profiles (email);

-- Populate it for new users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name',  '')
  );
  return new;
end;
$$;

-- Keep it in sync if the user later changes their email.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute procedure public.sync_profile_email();

-- ---------------------------------------------------------------------------
-- 2. New users start as 'viewer', not 'admin'.
--    Looked up by name because role ids are identity-generated and must not be
--    assumed.
-- ---------------------------------------------------------------------------
do $$
declare
  v_viewer_id smallint;
begin
  select id into strict v_viewer_id from public.roles where name = 'viewer';
  execute format(
    'alter table public.profiles alter column role_id set default %s',
    v_viewer_id
  );
end $$;

-- ---------------------------------------------------------------------------
-- 3. Global-role helpers.
--    SECURITY DEFINER so they can read profiles without tripping its own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_global_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
      and r.name = 'admin'
  );
$$;

create or replace function public.can_create_clients()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
      and r.name in ('admin', 'editor')
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Give the admin its superuser bypass.
--
--    The twenty RLS policies written in migration 002 never query a table
--    directly — they all call these three helpers. Adding the bypass INSIDE the
--    helpers means every policy inherits it without a single policy changing.
--    This is exactly the payoff the helper indirection was introduced for.
-- ---------------------------------------------------------------------------
create or replace function public.is_client_member(target_client_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_global_admin() or exists (
    select 1 from public.client_members m
    where m.client_id = target_client_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_client(target_client_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_global_admin() or exists (
    select 1 from public.client_members m
    where m.client_id = target_client_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_client_owner(target_client_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_global_admin() or exists (
    select 1 from public.client_members m
    where m.client_id = target_client_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Block privilege escalation.
--
--    role_id may only change through a service-role connection, which in
--    practice means the /api/admin/* routes (they use the secret key). Not even
--    an admin can change roles from the ordinary browser session.
--
--    A direct SQL connection (SQL Editor, migrations) carries no JWT claims, so
--    the comparison yields NULL and the change is allowed — the DBA escape
--    hatch stays open.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.role_id is distinct from old.role_id
     and nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
         <> 'service_role'
  then
    raise exception 'role_id can only be changed through the admin API'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists no_role_self_escalation on public.profiles;
create trigger no_role_self_escalation
  before update on public.profiles
  for each row execute procedure public.prevent_role_self_escalation();

-- ---------------------------------------------------------------------------
-- 6. The user directory.
--
--    Was "read your own row only", which makes a member picker impossible.
--    Internal tool: colleagues may see each other. Writes stay restricted to
--    your own row by the untouched update policy (plus the trigger above).
-- ---------------------------------------------------------------------------
drop policy if exists "profiles: read own" on public.profiles;

create policy "profiles: readable by authenticated"
  on public.profiles for select
  using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- 7. Only admin and editor may create clients.
--    Same function as migration 003, with the role gate added.
-- ---------------------------------------------------------------------------
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
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- SECURITY DEFINER bypasses RLS, so the role check has to live here.
  if not public.can_create_clients() then
    raise exception 'only admin or editor may create clients'
      using errcode = '42501';
  end if;

  insert into public.clients (name, nit, address, city, country, notes)
  values (
    p_name,
    p_nit,
    p_address,
    p_city,
    coalesce(p_country, 'Guatemala'),
    p_notes
  )
  returning * into v_client;

  -- The creator becomes owner. user_id comes from the JWT, never a parameter.
  insert into public.client_members (client_id, user_id, role)
  values (v_client.id, v_user_id, 'owner');

  return v_client;
end;
$$;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- Your own account must still be admin (role_id was set before this migration):
--   select p.email, r.name from public.profiles p
--   join public.roles r on r.id = p.role_id;
--
-- New users must now default to viewer:
--   select column_default from information_schema.columns
--   where table_schema='public' and table_name='profiles' and column_name='role_id';
--
-- Escalation must fail from the app (this succeeds in the SQL Editor by design):
--   -- as a signed-in user: update profiles set role_id = 1 where id = auth.uid();
--   -- expected: ERROR role_id can only be changed through the admin API
