-- =============================================================================
-- Refashion IA · Migration 016
-- Give an asset its own dimensions.
--
-- WHY: the Módulo 2 (inpainting) API needs them, and not as a nicety.
--
--   1. FLUX.1 Fill [dev] (`runware:102@1`) requires `width` and `height` on
--      every request, constrained to 128..2048 **in increments of 64**. A
--      catalogue photo is never a multiple of 64 by accident, so the request
--      has to snap the image to the nearest valid size — which cannot be done
--      without knowing the original size.
--
--   2. The mask MUST match the seed image pixel for pixel. Painting it at the
--      right size in the browser means knowing that size before the image
--      loads, or the canvas is built twice.
--
-- Without these columns the only way to answer "how big is this image?" on the
-- server is to DOWNLOAD it and measure it, on every single generation. That is
-- the same shape of shortcut this project already rejected once (fetch
-- everything, then filter), and here it would also cost R2 egress and latency
-- on the hot path of a paid operation.
--
-- The browser already knows the dimensions at upload time — it has the decoded
-- image in hand to build the preview. Today that number is thrown away. This
-- migration is mostly about stopping that.
--
-- NULLABLE ON PURPOSE, no backfill. Same reasoning as current_asset_id in 013:
--   - Rows created before this migration legitimately do not know their size.
--   - A backfill would mean downloading and measuring every existing object,
--     which is the very thing this exists to avoid.
--   - The app treats null as "not measured yet" and can fill it in the first
--     time an asset is actually used for generation.
-- An asset with unknown dimensions is still perfectly usable for everything
-- built so far (catalogue, canvas, composition): only inference needs them.
--
-- Integers, not numeric: pixels are counted, never fractional.
--
-- No RLS/GRANT changes: new columns on an already-covered table. The policies
-- from 002 and the grants from 004/007 apply to the whole row, not per column.
-- =============================================================================

alter table public.assets
  add column width_px  integer,
  add column height_px integer;

-- A dimension is either unknown (null) or a positive number of pixels. Zero or
-- negative would silently produce an invalid inference request instead of
-- failing here, where the cause is obvious.
alter table public.assets
  add constraint assets_width_px_positive
    check (width_px is null or width_px > 0),
  add constraint assets_height_px_positive
    check (height_px is null or height_px > 0);

comment on column public.assets.width_px is
  'Pixel width of the stored object. Null when never measured (rows predating '
  'migration 016). Needed by image inference, which requires explicit width and '
  'height in multiples of 64.';

comment on column public.assets.height_px is
  'Pixel height of the stored object. See width_px.';

-- -----------------------------------------------------------------------------
-- Verification
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name = 'assets'
--     and column_name in ('width_px', 'height_px');
--
-- Expected: two rows, integer, YES.
--
--   select count(*) filter (where width_px is null) as sin_medir,
--          count(*)                                  as total
--   from public.assets;
--
-- Expected right after running: sin_medir = total. The number drops as new
-- uploads arrive with their dimensions.
-- -----------------------------------------------------------------------------
