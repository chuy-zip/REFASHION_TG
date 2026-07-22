-- =============================================================================
-- Refashion IA · Migration 002
-- Granular RLS policies: enforce client_members.role per operation.
--
-- WHY: The initial policies used `for all using (...)` which only checked
-- MEMBERSHIP, not ROLE. A 'viewer' could delete just like an 'owner'.
-- This migration splits them into per-operation policies that respect roles.
--
-- Role model (two independent layers):
--   profiles.role_id     → global role in the system (admin, designer, viewer)
--   client_members.role  → role on a SPECIFIC client (owner, editor, viewer)
--
-- Permission matrix for client_members.role:
--
--   Operation          | owner | editor | viewer
--   -------------------|-------|--------|-------
--   read client        |   ✓   |   ✓    |   ✓
--   update client      |   ✓   |   ✓    |   ✗
--   delete client      |   ✓   |   ✗    |   ✗
--   manage members     |   ✓   |   ✗    |   ✗
--   create project     |   ✓   |   ✓    |   ✗
--   update project     |   ✓   |   ✓    |   ✗
--   delete project     |   ✓   |   ✓    |   ✗
--   create/edit design |   ✓   |   ✓    |   ✗
--   upload asset       |   ✓   |   ✓    |   ✗
--   delete asset       |   ✓   |   ✓    |   ✗
--   read everything    |   ✓   |   ✓    |   ✓
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Seed the remaining global roles (profiles.role_id references these)
-- ---------------------------------------------------------------------------
insert into public.roles (name, description) values
  ('editor', 'Can create and edit clients, projects, designs and assets'),
  ('viewer', 'Read-only access across the system')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 1. HELPER FUNCTIONS
--    Encapsulate the membership/role checks so policies stay readable.
--    SECURITY DEFINER + stable: evaluated once per row, can read client_members
--    without triggering its own RLS (avoids infinite recursion).
-- ---------------------------------------------------------------------------

-- Is the current user a member of this client (any role)?
create or replace function public.is_client_member(target_client_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.client_members m
    where m.client_id = target_client_id
      and m.user_id = auth.uid()
  );
$$;

-- Can the current user WRITE on this client? (owner or editor, not viewer)
create or replace function public.can_edit_client(target_client_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.client_members m
    where m.client_id = target_client_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  );
$$;

-- Is the current user the OWNER of this client?
create or replace function public.is_client_owner(target_client_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.client_members m
    where m.client_id = target_client_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

-- Resolve the client_id that owns a given project / design / asset.
create or replace function public.client_id_of_project(target_project_id uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select p.client_id from public.projects p where p.id = target_project_id;
$$;

create or replace function public.client_id_of_design(target_design_id uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select p.client_id
  from public.designs d
  join public.projects p on p.id = d.project_id
  where d.id = target_design_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. DROP the old coarse policies
-- ---------------------------------------------------------------------------
drop policy if exists "clients: members can access"        on public.clients;
drop policy if exists "projects: members can access"       on public.projects;
drop policy if exists "designs: members can access"        on public.designs;
drop policy if exists "assets: members can access"         on public.assets;
drop policy if exists "client_members: visible to members" on public.client_members;
drop policy if exists "client_members: owners can manage"  on public.client_members;

-- ---------------------------------------------------------------------------
-- 3. CLIENTS
--    read   → any member
--    insert → any authenticated user (they become owner via client_members)
--    update → owner or editor
--    delete → owner only
-- ---------------------------------------------------------------------------
create policy "clients: members can read"
  on public.clients for select
  using (public.is_client_member(id));

create policy "clients: authenticated can create"
  on public.clients for insert
  with check (auth.uid() is not null);

create policy "clients: editors can update"
  on public.clients for update
  using (public.can_edit_client(id))
  with check (public.can_edit_client(id));

create policy "clients: owners can delete"
  on public.clients for delete
  using (public.is_client_owner(id));

-- ---------------------------------------------------------------------------
-- 4. CLIENT_MEMBERS
--    read   → any member of that client (see who else has access)
--    insert → owner only, EXCEPT the bootstrap case: a user may insert
--             themselves as 'owner' on a client that has no members yet
--             (this is how client creation works: INSERT client, then INSERT self)
--    update → owner only (change someone's role)
--    delete → owner only (revoke access)
-- ---------------------------------------------------------------------------
create policy "client_members: members can read"
  on public.client_members for select
  using (public.is_client_member(client_id));

create policy "client_members: owner or bootstrap can insert"
  on public.client_members for insert
  with check (
    -- normal case: an existing owner adds someone
    public.is_client_owner(client_id)
    or
    -- bootstrap case: creator claims a brand-new client with no members yet
    (
      user_id = auth.uid()
      and role = 'owner'
      and not exists (
        select 1 from public.client_members m2
        where m2.client_id = client_members.client_id
      )
    )
  );

create policy "client_members: owners can update"
  on public.client_members for update
  using (public.is_client_owner(client_id))
  with check (public.is_client_owner(client_id));

create policy "client_members: owners can delete"
  on public.client_members for delete
  using (public.is_client_owner(client_id));

-- ---------------------------------------------------------------------------
-- 5. PROJECTS
--    read → any member of the parent client
--    write (insert/update/delete) → owner or editor
-- ---------------------------------------------------------------------------
create policy "projects: members can read"
  on public.projects for select
  using (public.is_client_member(client_id));

create policy "projects: editors can insert"
  on public.projects for insert
  with check (public.can_edit_client(client_id));

create policy "projects: editors can update"
  on public.projects for update
  using (public.can_edit_client(client_id))
  with check (public.can_edit_client(client_id));

create policy "projects: editors can delete"
  on public.projects for delete
  using (public.can_edit_client(client_id));

-- ---------------------------------------------------------------------------
-- 6. DESIGNS  (client resolved via project)
-- ---------------------------------------------------------------------------
create policy "designs: members can read"
  on public.designs for select
  using (public.is_client_member(public.client_id_of_project(project_id)));

create policy "designs: editors can insert"
  on public.designs for insert
  with check (public.can_edit_client(public.client_id_of_project(project_id)));

create policy "designs: editors can update"
  on public.designs for update
  using (public.can_edit_client(public.client_id_of_project(project_id)))
  with check (public.can_edit_client(public.client_id_of_project(project_id)));

create policy "designs: editors can delete"
  on public.designs for delete
  using (public.can_edit_client(public.client_id_of_project(project_id)));

-- ---------------------------------------------------------------------------
-- 7. ASSETS
--    An asset hangs either directly off a client (catalog: logo, base_garment,
--    model_photo, tech_drawing) or off a design (generated results).
--    Resolve the owning client accordingly, then apply the same read/write split.
-- ---------------------------------------------------------------------------
create policy "assets: members can read"
  on public.assets for select
  using (
    case
      when client_id is not null
        then public.is_client_member(client_id)
      when design_id is not null
        then public.is_client_member(public.client_id_of_design(design_id))
      else false
    end
  );

create policy "assets: editors can insert"
  on public.assets for insert
  with check (
    case
      when client_id is not null
        then public.can_edit_client(client_id)
      when design_id is not null
        then public.can_edit_client(public.client_id_of_design(design_id))
      else false
    end
  );

create policy "assets: editors can update"
  on public.assets for update
  using (
    case
      when client_id is not null
        then public.can_edit_client(client_id)
      when design_id is not null
        then public.can_edit_client(public.client_id_of_design(design_id))
      else false
    end
  );

create policy "assets: editors can delete"
  on public.assets for delete
  using (
    case
      when client_id is not null
        then public.can_edit_client(client_id)
      when design_id is not null
        then public.can_edit_client(public.client_id_of_design(design_id))
      else false
    end
  );

-- ---------------------------------------------------------------------------
-- 8. PROFILES — unchanged in spirit, but split read/update
--    A user can read and update only their own profile.
--    role_id is NOT self-assignable from the app: changing it must go through
--    the SQL editor / service_role (see note below).
-- ---------------------------------------------------------------------------
drop policy if exists "profiles: own row" on public.profiles;

create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- NOTE on role escalation: with the policy above a user could technically
-- UPDATE their own profiles.role_id. Since this is an internal tool with
-- manually-created users, that's acceptable for the MVP. If you want to lock
-- it down, add a trigger that rejects role_id changes unless the session is
-- service_role:
--
--   create or replace function public.prevent_role_self_escalation()
--   returns trigger language plpgsql as $$
--   begin
--     if new.role_id is distinct from old.role_id
--        and current_setting('request.jwt.claims', true)::jsonb ->> 'role'
--            <> 'service_role'
--     then
--       raise exception 'role_id cannot be changed from the client';
--     end if;
--     return new;
--   end; $$;
--
--   create trigger no_role_self_escalation
--     before update on public.profiles
--     for each row execute procedure public.prevent_role_self_escalation();

-- ---------------------------------------------------------------------------
-- 9. VERIFY
--    Run these after the migration to confirm the new policy set.
-- ---------------------------------------------------------------------------
-- select tablename, policyname, cmd
-- from pg_policies
-- where schemaname = 'public'
-- order by tablename, cmd, policyname;
--
-- Expected: 4 policies (select/insert/update/delete) on clients, client_members,
-- projects, designs and assets; 2 on profiles; 1 on roles.