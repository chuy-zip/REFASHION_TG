-- =============================================================================
-- Refashion IA Initial schema
-- Migration 001 - run in Supabase SQL Editor
-- All table/column names in English. Frontend labels are in Spanish (app layer).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ROLES
--    Lookup table for user roles. Start with one role ("admin"), add more
--    as the product evolves (e.g. "designer", "viewer").
-- ---------------------------------------------------------------------------
create table public.roles (
  id          smallint primary key generated always as identity,
  name        text      not null unique,          -- 'admin', 'designer', etc.
  description text
);

insert into public.roles (name, description)
values ('admin', 'Full access to all clients and projects');

-- ---------------------------------------------------------------------------
-- 2. PROFILES
--    Extends Supabase Auth (auth.users) with app-specific fields.
--    One profile per auth user, linked by user id.
--    Supabase Auth handles password hashing, sessions and JWT issuance -
--    we never store raw passwords here.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid      primary key references auth.users(id) on delete cascade,
  first_name  text      not null,
  last_name   text      not null,
  role_id     smallint  not null references public.roles(id) default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Automatically create a profile row when a new auth user signs up.
-- Trigger runs as SECURITY DEFINER so it can write to public.profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name',  '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. CLIENTS
--    One client = one business entity that orders uniforms.
--    No owner_id here - membership is managed via client_members.
--    Each client maps to a prefix in the R2 bucket:
--      clients/{client_id}/...
-- ---------------------------------------------------------------------------
create table public.clients (
  id          uuid      primary key default gen_random_uuid(),
  name        text      not null,
  nit         text,                              -- tax ID (Guatemala: NIT)
  address     text,
  city        text,
  country     text      default 'Guatemala',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3b. CLIENT_MEMBERS
--    Junction table: which users have access to which clients, and with
--    what role. Allows multiple users per client without schema changes.
--
--    Roles:
--      'owner'  - created the client; full control including deleting it
--      'editor' - can create/edit projects and designs, upload assets
--      'viewer' - read-only access 
--
--    When a client is created, the creating user is inserted here as 'owner'.
--    Adding a second user = one INSERT into this table, nothing else changes.
-- ---------------------------------------------------------------------------
create table public.client_members (
  client_id   uuid      not null references public.clients(id) on delete cascade,
  user_id     uuid      not null references auth.users(id)     on delete cascade,
  role        text      not null default 'owner',
  created_at  timestamptz not null default now(),
  primary key (client_id, user_id),
  constraint client_members_role_check
    check (role in ('owner', 'editor', 'viewer'))
);

-- ---------------------------------------------------------------------------
-- 4. PROJECTS
--    One project = one purchase order / uniform campaign.
--    Example: "Uniformes junio 2026 - Tienda XYZ"
--    Intentionally lean for now; fields will be added as the product grows.
-- ---------------------------------------------------------------------------
create table public.projects (
  id          uuid      primary key default gen_random_uuid(),
  client_id   uuid      not null references public.clients(id) on delete cascade,
  name        text      not null,
  description text,
  status      text      not null default 'draft',  -- draft | active | closed
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint projects_status_check
    check (status in ('draft', 'active', 'closed'))
);

-- ---------------------------------------------------------------------------
-- 5. DESIGNS
--    One design = one garment type within a project (e.g. "Camisa polo azul").
--    In this graduation project scope: shirts/playeras only.
--    Future: caps, pants, jackets, etc. can be added here.
-- ---------------------------------------------------------------------------
create table public.designs (
  id           uuid      primary key default gen_random_uuid(),
  project_id   uuid      not null references public.projects(id) on delete cascade,
  name         text      not null,
  garment_type text      not null default 'shirt',  -- shirt | polo | hoodie | ...
  version      smallint  not null default 1,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. ASSETS
--    Every image in the system: uploaded files and AI-generated results.
--    The actual binary lives in R2; this table stores only metadata + the key.
--
--    Asset types:
--      Client-level (no project/design):
--        'logo'          - client logo file
--        'base_garment'  - flat garment reference photo
--        'model_photo'   - human model photo supplied by client
--        'tech_drawing'  - technical garment drawing
--
--      Design-level (linked to a design):
--        'mask'          - inpainting mask drawn by the user
--        'composition'   - result of logo placement (Module 1)
--        'inpainting'    - result of zone editing (Module 2)
--        'vton'          - virtual try-on result (Module 3)
--        'ai_model'      - AI-generated model image
--        'export_flat'   - final export: flat garment
--        'export_model'  - final export: garment on model photo
--        'export_ai'     - final export: garment on AI model
--
--    Lineage: parent_asset_id traces the iteration chain.
--    Cost: recorded per AI-generated asset (from Runware includeCost).
-- ---------------------------------------------------------------------------
create table public.assets (
  id                uuid    primary key default gen_random_uuid(),

  -- Ownership - at least one of these must be set
  client_id         uuid    references public.clients(id) on delete cascade,
  design_id         uuid    references public.designs(id) on delete cascade,

  asset_type        text    not null,
  r2_key            text    not null unique,  -- full object key in R2 bucket
  mime_type         text    not null default 'image/png',
  file_size_bytes   bigint,

  -- AI generation metadata (null for uploaded assets)
  origin            text    not null default 'upload',  -- upload | generated
  runware_task_id   uuid,
  cost_usd          numeric(10, 6),
  generation_prompt text,

  -- Iteration lineage
  parent_asset_id   uuid    references public.assets(id) on delete set null,

  created_at        timestamptz not null default now(),

  -- Every asset must belong to a client (directly or via design→project→client)
  constraint assets_owner_check
    check (client_id is not null or design_id is not null),

  constraint assets_origin_check
    check (origin in ('upload', 'generated')),

  constraint assets_type_check
    check (asset_type in (
      'logo', 'base_garment', 'model_photo', 'tech_drawing',
      'mask', 'composition', 'inpainting', 'vton', 'ai_model',
      'export_flat', 'export_model', 'export_ai'
    ))
);

-- ---------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS)
--    Access chain: asset → design → project → client → client_members → user
--    A user can access a resource if they have any membership on its client.
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.clients       enable row level security;
alter table public.client_members enable row level security;
alter table public.projects      enable row level security;
alter table public.designs       enable row level security;
alter table public.assets        enable row level security;

-- Profiles: users can only read/update their own profile
create policy "profiles: own row" on public.profiles
  for all using (id = auth.uid());

-- Client members: visible to all members of that client
create policy "client_members: visible to members" on public.client_members
  for select using (
    exists (
      select 1 from public.client_members m
      where m.client_id = client_members.client_id
        and m.user_id = auth.uid()
    )
  );

-- Only owners can add/remove members
create policy "client_members: owners can manage" on public.client_members
  for all using (
    exists (
      select 1 from public.client_members m
      where m.client_id = client_members.client_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- Clients: accessible if the user has any membership
create policy "clients: members can access" on public.clients
  for all using (
    exists (
      select 1 from public.client_members m
      where m.client_id = clients.id
        and m.user_id = auth.uid()
    )
  );

-- Projects: accessible if the user is a member of the parent client
create policy "projects: members can access" on public.projects
  for all using (
    exists (
      select 1 from public.client_members m
      where m.client_id = projects.client_id
        and m.user_id = auth.uid()
    )
  );

-- Designs: accessible if the user is a member of the project's client
create policy "designs: members can access" on public.designs
  for all using (
    exists (
      select 1
      from public.projects     p
      join public.client_members m on m.client_id = p.client_id
      where p.id = designs.project_id
        and m.user_id = auth.uid()
    )
  );

-- Assets: accessible if the user is a member of the relevant client
create policy "assets: members can access" on public.assets
  for all using (
    -- direct client-level asset
    (
      client_id is not null and exists (
        select 1 from public.client_members m
        where m.client_id = assets.client_id
          and m.user_id = auth.uid()
      )
    )
    or
    -- design-level asset (trace up to client via project)
    (
      design_id is not null and exists (
        select 1
        from public.designs      d
        join public.projects     p  on p.id  = d.project_id
        join public.client_members m on m.client_id = p.client_id
        where d.id = assets.design_id
          and m.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 8. HELPER FUNCTION: updated_at auto-refresh
--    Single function, one trigger per table that has updated_at.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger set_updated_at_clients
  before update on public.clients
  for each row execute procedure public.set_updated_at();

create trigger set_updated_at_projects
  before update on public.projects
  for each row execute procedure public.set_updated_at();

create trigger set_updated_at_designs
  before update on public.designs
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. USEFUL INDEXES
-- ---------------------------------------------------------------------------
create index on public.client_members (client_id);
create index on public.client_members (user_id);
create index on public.projects       (client_id);
create index on public.designs        (project_id);
create index on public.assets         (client_id);
create index on public.assets         (design_id);
create index on public.assets         (parent_asset_id);
create index on public.assets         (r2_key);

-- ---------------------------------------------------------------------------
-- R2 KEY CONVENTION (enforced by the app layer, not the DB)
--
-- owner_id is no longer part of the key since clients are now shared.
-- The client UUID provides enough namespace isolation.
--
-- Client-level assets:
--   clients/{client_id}/catalog/{asset_id}.{ext}
--
-- Design-level assets:
--   clients/{client_id}/projects/{project_id}/designs/{design_id}/{asset_id}.{ext}
--
-- The asset UUID is always used as the filename to avoid collisions.
-- ---------------------------------------------------------------------------

alter table public.roles enable row level security;

create policy "roles: anyone authenticated can read"
  on public.roles
  for select
  using (auth.role() = 'authenticated');