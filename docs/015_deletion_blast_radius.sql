-- =============================================================================
-- Refashion IA · Migration 015
-- What each delete confirmation needs to say out loud: how much disappears.
--
-- The four delete dialogs all warned with the same sentence in the abstract
-- plural — "se eliminarán también sus proyectos, diseños e imágenes" — so a
-- client with nothing and a client with forty projects showed the identical
-- screen. The user cannot estimate the damage, which is exactly when a
-- confirmation dialog stops working.
--
-- The counts are the cheap half of the fix and the one that changes the
-- decision rather than just delaying it. (The other half, typing the name to
-- confirm, lives in the UI and only guards the two deepest cascades.)
--
-- Everything here follows migration 014: read-only views, `security_invoker`
-- so the caller's RLS applies, and an explicit grant because RLS alone is
-- never enough in this project.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. client_work_counts gains image_count
--
-- Deleting a client cascades to its projects, their designs, and BOTH kinds of
-- asset: the catalogue it owns directly (assets.client_id) and everything its
-- designs produced (assets.design_id). The count has to cover both or it
-- understates the loss, which is worse than not showing a number at all.
--
-- `create or replace view` can only append columns, never change the ones that
-- exist — which is why image_count goes last.
-- ---------------------------------------------------------------------------
create or replace view public.client_work_counts
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
  ) as design_count,
  (
    select count(*)
    from public.assets a
    where a.client_id = c.id
       or a.design_id in (
            select d2.id
            from public.designs d2
            join public.projects p3 on p3.id = d2.project_id
            where p3.client_id = c.id
          )
  ) as image_count
from public.clients c;

-- ---------------------------------------------------------------------------
-- 2. project_work_counts — the same question one level down
-- ---------------------------------------------------------------------------
create view public.project_work_counts
with (security_invoker = on) as
select
  p.id as project_id,
  (
    select count(*)
    from public.designs d
    where d.project_id = p.id
  ) as design_count,
  (
    select count(*)
    from public.assets a
    where a.design_id in (
      select d2.id from public.designs d2 where d2.project_id = p.id
    )
  ) as image_count
from public.projects p;

comment on view public.project_work_counts is
  'Design and image counts per project, for its delete confirmation. security_invoker: RLS of the caller applies.';

grant select on public.project_work_counts to authenticated;

-- ---------------------------------------------------------------------------
-- 3. design_activity gains asset_count
--
-- The design list already reads this view once per screen, so the number a
-- design's delete dialog needs rides along instead of costing its own query
-- when the dialog opens.
-- ---------------------------------------------------------------------------
create or replace view public.design_activity
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
  ) as last_asset_at,
  (
    select count(*)
    from public.assets a
    where a.design_id = d.id
  ) as asset_count
from public.designs d;
