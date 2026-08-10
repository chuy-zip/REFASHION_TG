-- =============================================================================
-- Refashion IA · Migration 012
-- Add a third value to assets.origin: 'derived'.
--
--   upload    -> a person uploaded the binary
--   derived   -> the app produced it deterministically in the browser (Canvas)
--   generated -> an external model produced it (Runware)
--
-- WHY: `origin` was written as a two-value column (upload | generated) before
-- any image existed that was neither. Five of the twelve asset_types are
-- produced by Módulo 1 in the browser with Canvas, with no AI and no cost:
-- composition, mask, export_flat, export_model, export_ai. Nobody uploaded
-- them, and calling them 'generated' asserts something false.
--
-- The decisive argument is the protocol's own wording. Módulo 1 is defined as
-- "visión por computadora / composición clásica, NO generativo". If every
-- composition is stored as 'generated', the data contradicts the claim the
-- thesis has to defend. The schema should not undermine its own document.
--
-- 'derived' pairs with parent_asset_id on purpose: these are exactly the assets
-- obtained from another one by a reproducible transformation. That is the
-- property that separates them from both neighbours.
--
-- Consequence worth keeping: origin = 'generated' now means "cost money and
-- came from a model", so summing cost_usd per project has no exceptions.
--
-- NOT added yet, on purpose: a constraint tying 'generated' to a non-null
-- runware_task_id. It should hold, but nothing writes a generated asset until
-- Módulo 2, and a constraint written before the first real call is a guess.
-- Revisit when the inpainting endpoint lands.
--
-- No data migration needed: every existing asset is a catalog upload sitting on
-- the column default ('upload'), so no row changes meaning. This migration runs
-- BEFORE the first design-level asset is ever written, which is the only moment
-- where the change is free.
-- =============================================================================

alter table public.assets
  drop constraint assets_origin_check;

alter table public.assets
  add constraint assets_origin_check
    check (origin in ('upload', 'derived', 'generated'));

-- No RLS/GRANT changes needed: this only widens a check constraint on a table
-- already covered by policies (002) and grants (004/007). The design_id branch
-- of the assets policies has existed since 002 and needs nothing new either.
