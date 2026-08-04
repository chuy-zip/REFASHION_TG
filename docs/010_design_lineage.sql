-- =============================================================================
-- Refashion IA · Migration 010
-- Give a design a memory: what it started from, and which design it iterates.
--
-- WHY (base_asset_id): the editing scaffold passed the chosen base garment as a
-- `?base=` query param only — it was never persisted. Reloading
-- /designs/:id/edit without the param silently lost the starting image. A
-- design has to remember its own starting point.
--
-- WHY (parent_design_id): `designs.version` was decorative — a number typed by
-- hand with no relationship to anything, so "Camisa polo azul v1" and "v2" were
-- unrelated rows and nothing stopped a v7 appearing out of nowhere. Same class
-- of problem as profiles.role_id before migration 005. With a parent link the
-- version becomes derived (parent.version + 1) and the iteration chain is
-- queryable.
--
-- This is NOT redundant with assets.parent_asset_id: that one traces
-- image -> image (base_garment -> composition -> export), this one traces
-- design -> design (v1 -> v2). Different granularity, both needed.
--
-- Both are `on delete set null`, matching the criterion already used for
-- parent_asset_id: deleting the parent must not delete the children, only
-- break the link.
-- =============================================================================

alter table public.designs
  add column base_asset_id   uuid references public.assets(id)  on delete set null,
  add column parent_design_id uuid references public.designs(id) on delete set null;

create index on public.designs (base_asset_id);
create index on public.designs (parent_design_id);

-- No RLS/GRANT changes needed: new columns on an already-covered table
-- (RLS from 002, GRANT for authenticated/service_role from 004/007 apply to
-- the whole row, not per-column).
