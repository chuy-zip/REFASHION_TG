-- =============================================================================
-- Refashion IA · Migration 014
-- Three read-only views so the list screens stop bringing rows they discard.
--
-- All three answer one of two questions that PostgREST cannot ask on its own:
--
--   "how many children does each parent have"      → client_work_counts
--   "the N most recent children of each parent"    → project_design_samples
--   "the newest child of each parent, by kind"     → design_activity
--
-- The application was answering them by fetching everything and reducing in
-- JavaScript. That works while the data is small and stops working exactly when
-- the product succeeds: showing "3 proyectos · 12 diseños" for forty clients
-- meant loading every project and every design those clients own.
--
-- WHY VIEWS AND NOT RPC FUNCTIONS: a view composes with PostgREST filters, so
-- the caller still writes `.in('project_id', ids).lte('position', 4)` and the
-- limit is applied by Postgres. A function would have to take the ids and the
-- limit as arguments and would freeze the shape of every future query.
--
-- SECURITY — read this before adding a fourth view:
--   A view runs with the privileges of its OWNER by default, which would let it
--   return rows the caller's RLS forbids. `security_invoker = on` (Postgres 15+)
--   makes the underlying policies apply to whoever is querying. Every view here
--   sets it, and none of them adds a WHERE for access: the RLS on clients,
--   projects, designs and assets is what filters them, exactly as it filters the
--   tables themselves.
--   And, as always in this project: RLS is not enough by itself, the GRANT has
--   to be there too ("auto-expose new tables" is OFF).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. client_work_counts — how much work each client holds
--
-- Feeds the "3 proyectos · 12 diseños" line on the client card. Two correlated
-- subqueries rather than two joins with GROUP BY: a client with no projects
-- still has to produce a row saying zero, and an inner join would drop it.
-- ---------------------------------------------------------------------------
create view public.client_work_counts
with (security_invoker = on) as
select
  c.id as client_id,
  (
    select count(*)
    from public.projects p
    where p.client_id = c.id
  ) as project_count,
  (
    select count(*)
    from public.designs d
    join public.projects p on p.id = d.project_id
    where p.client_id = c.id
  ) as design_count
from public.clients c;

comment on view public.client_work_counts is
  'Project and design counts per client, for the client list. security_invoker: RLS of the caller applies.';

-- ---------------------------------------------------------------------------
-- 2. project_design_samples — the designs of a project, numbered by recency
--
-- Feeds "la muestra": the strip of up to four thumbnails on a project card.
-- The view does not decide the four; it publishes a `position` so the caller
-- filters `position <= 4` and Postgres discards the rest before sending them.
--
-- WHY the number is not baked in: the same view answers "the newest one" for a
-- compact strip and "the newest four" for a card, and a view cannot take an
-- argument anyway. The cap stays a decision of the screen, applied in the query.
--
-- `design_count` is the total for the whole project, and it survives the
-- caller's `position <= 4` because a window function is computed over the
-- partition BEFORE an outer predicate that is not on the partition key. That is
-- what lets one card say "5 diseños" while showing four of them, with a single
-- query and no second count.
--
-- The asset pointers travel along so the caller can resolve each sample's image
-- without fetching the design rows again. They are the two columns
-- `resolveDesignImageAssetId()` reads, and that rule stays in one place.
-- ---------------------------------------------------------------------------
create view public.project_design_samples
with (security_invoker = on) as
select
  d.project_id,
  d.id as design_id,
  d.name,
  d.base_asset_id,
  d.current_asset_id,
  row_number() over (
    partition by d.project_id
    order by d.created_at desc, d.id desc
  ) as position,
  count(*) over (partition by d.project_id) as design_count
from public.designs d;

comment on view public.project_design_samples is
  'Designs numbered by recency within their project, plus the project total, so a caller can take the first N per project in SQL.';

-- ---------------------------------------------------------------------------
-- 3. design_activity — what a design looks like, and when it last moved
--
-- Two questions with one row per design, replacing a query that pulled every
-- asset of every design on screen to keep the first of each.
--
--   latest_composition_key — the image the design list shows. A composition,
--     because what a design *looks like* includes its logos (FASE_1_5 §7.7).
--   last_asset_at — when the design last produced ANYTHING. Deliberately not
--     restricted to compositions: a mask or an inpainting is activity too, and
--     filtering them out would make the date wrong the day Módulo 2 lands.
--
-- The date shown to the user is the later of this and designs.updated_at, and
-- that combination is computed in the application, not here: updated_at is a
-- column of another table and joining it in would make this view about designs
-- rather than about their assets.
--
-- Still not the whole truth: moving a logo writes to design_layers, which
-- neither column watches. Closing that gap needs a third source and was left
-- out on purpose.
-- ---------------------------------------------------------------------------
create view public.design_activity
with (security_invoker = on) as
select
  d.id as design_id,
  (
    select a.r2_key
    from public.assets a
    where a.design_id = d.id
      and a.asset_type = 'composition'
    order by a.created_at desc
    limit 1
  ) as latest_composition_key,
  (
    select max(a.created_at)
    from public.assets a
    where a.design_id = d.id
  ) as last_asset_at
from public.designs d;

comment on view public.design_activity is
  'Latest composition key and last asset date per design. security_invoker: RLS of the caller applies.';

-- ---------------------------------------------------------------------------
-- 4. Grants
--
-- RLS decides WHICH rows; the grant decides whether the role may look at all.
-- Both are required, every time (see 004_data_api_grants.sql).
-- Read-only by design: nothing writes to a view here, and no grant says it may.
-- ---------------------------------------------------------------------------
grant select on public.client_work_counts     to authenticated;
grant select on public.project_design_samples to authenticated;
grant select on public.design_activity        to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Supporting indexes
--
-- The subqueries and the window function all group by a foreign key. These are
-- the lookups they do; without them each view degrades into a sequential scan
-- as soon as the tables stop being small.
-- ---------------------------------------------------------------------------
create index if not exists projects_client_id_idx
  on public.projects (client_id);

create index if not exists designs_project_id_created_at_idx
  on public.designs (project_id, created_at desc);

create index if not exists assets_design_id_created_at_idx
  on public.assets (design_id, created_at desc);
