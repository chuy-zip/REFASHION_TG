-- =============================================================================
-- Refashion IA · Migration 013
-- The two things Módulo 1 needs from the database:
--   1. designs.current_asset_id — which image the design is working on now
--   2. design_layers            — the logo stack that sits on top of it
--
-- Both come from the decision in FASE_1_5 §7.1: the logo is a LAYER applied at
-- the end of the pipeline, never flattened into the working image. A design is
-- therefore two separate things — one working image that advances through
-- parent_asset_id as the generative modules run, and a stack of layers above
-- it — and they are not stored the same way.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. designs.current_asset_id — the working-image pointer
--
-- WHY a column instead of "the most recent asset": the two agree only while the
-- history is a straight line, and they diverge exactly at the feature that
-- motivated the history in the first place. Generate A, B, C; go back to B to
-- resume from there; reload the page. "Most recent" answers C. The user's
-- position is lost, and the use case was "the connection dropped and I need to
-- pick up where I was".
--
-- Nullable, with no backfill: the app reads `current_asset_id ?? base_asset_id`,
-- so a design that never moved needs no row written, and a design with no base
-- garment at all stays legitimately empty. Setting it eagerly would mean
-- inventing a value for every existing row to say something they already say.
--
-- `on delete set null` matches base_asset_id and parent_asset_id: deleting an
-- image breaks the link, it does not delete what pointed at it.
-- ---------------------------------------------------------------------------
alter table public.designs
  add column current_asset_id uuid references public.assets(id) on delete set null;

create index on public.designs (current_asset_id);

-- ---------------------------------------------------------------------------
-- 2. design_layers — the logo stack
--
-- WHY a table and not a jsonb column on designs: referential integrity. The
-- foreign key to assets makes "which designs use this logo?" a one-line query,
-- which is exactly what the delete warning needs (§7.3). Inside a jsonb
-- document the asset id is just text, and nothing notices when the logo it
-- names disappears. Same reasoning already validated with client_members:
-- a join table instead of a column, so multiplicity is only data. Several logos
-- per design come for free — several rows ordered by z_index.
--
-- COORDINATES ARE RATIOS, NOT PIXELS. This deviates from the sketch in §7.2
-- ("x, y, scale") on purpose. The layer is re-applied over whatever the working
-- image happens to be, and that image changes size along the pipeline (an
-- inpainting result or a VTON output need not match the base garment's
-- resolution). Absolute pixels would silently move the logo every time the
-- working image changed dimensions — the failure mode being that a logo placed
-- perfectly on the mockup lands off-centre on the final export.
--
--   x_ratio, y_ratio  centre of the layer, as a fraction of image width/height
--   width_ratio       layer width, as a fraction of the image width
--   rotation_deg      degrees, clockwise
--
-- The centre is the anchor (not the top-left corner) so that rotating and
-- scaling keep the logo where the user put it.
-- Height needs no column: it follows from width and the logo's own aspect
-- ratio, which the image already carries. Storing it would let it contradict
-- the image.
-- ---------------------------------------------------------------------------
create table public.design_layers (
  id           uuid primary key default gen_random_uuid(),

  design_id    uuid not null references public.designs(id) on delete cascade,

  -- The logo. `cascade` and not `set null`: a layer without its image is not a
  -- degraded layer, it is nothing. §7.3 accepts that deleting a logo costs the
  -- ability to re-render past compositions; the exported PNG stays as the
  -- durable artifact.
  asset_id     uuid not null references public.assets(id) on delete cascade,

  x_ratio      double precision not null default 0.5,
  y_ratio      double precision not null default 0.5,
  width_ratio  double precision not null default 0.25,
  rotation_deg double precision not null default 0,
  z_index      integer          not null default 0,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint design_layers_width_check check (width_ratio > 0)
);

-- Ordered read of a design's stack.
create index on public.design_layers (design_id, z_index);
-- "Which designs use this logo?" — the delete warning of §7.3.
create index on public.design_layers (asset_id);

create trigger set_updated_at_design_layers
  before update on public.design_layers
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS — same shape as the design branch of the assets policies (002).
--     A layer belongs to a design, so the owning client is resolved with
--     client_id_of_design() and the read/write split is the usual one:
--     any member reads, only owner/editor writes.
-- ---------------------------------------------------------------------------
alter table public.design_layers enable row level security;

create policy "design_layers: members can read"
  on public.design_layers for select
  using (public.is_client_member(public.client_id_of_design(design_id)));

create policy "design_layers: editors can insert"
  on public.design_layers for insert
  with check (public.can_edit_client(public.client_id_of_design(design_id)));

create policy "design_layers: editors can update"
  on public.design_layers for update
  using (public.can_edit_client(public.client_id_of_design(design_id)))
  with check (public.can_edit_client(public.client_id_of_design(design_id)));

create policy "design_layers: editors can delete"
  on public.design_layers for delete
  using (public.can_edit_client(public.client_id_of_design(design_id)));

-- ---------------------------------------------------------------------------
-- 4. GRANT — the step that is easy to forget and impossible to debug.
--     "Automatically expose new tables" is OFF, so this table was born with no
--     privileges for the Data API roles: perfect policies would still return
--     "permission denied" (see migration 004 and APRENDIZAJES §2.4).
--     `service_role` needs nothing here — migration 007 set default privileges.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.design_layers to authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- select column_name, data_type from information_schema.columns
-- where table_name = 'design_layers' order by ordinal_position;
--
-- select polname from pg_policy
-- where polrelid = 'public.design_layers'::regclass;   -- expect 4
--
-- select grantee, string_agg(privilege_type, ', ' order by privilege_type)
-- from information_schema.role_table_grants
-- where table_name = 'design_layers' group by grantee;
--   -- expect authenticated: DELETE, INSERT, SELECT, UPDATE  (and no `anon` row)
--
-- select column_name from information_schema.columns
-- where table_name = 'designs' and column_name = 'current_asset_id';
