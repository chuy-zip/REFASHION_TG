-- =============================================================================
-- Refashion IA · Migration 008
-- Add assets.original_filename.
--
-- WHY: the upload flow (presign-upload -> PUT to R2 -> confirm) never
-- captured the file name the user picked — only mime_type and
-- file_size_bytes. The object's key in R2 is a UUID (assets.id), chosen on
-- purpose to guarantee uniqueness without a name-collision check; it was
-- never meant to be human-readable. Without a separate column there was no
-- way to show or search assets by their original name in the Recursos tab.
--
-- Nullable: existing rows (already-uploaded assets) have no original name to
-- backfill. New uploads populate it via /api/assets/confirm.
-- =============================================================================

alter table public.assets
  add column original_filename text;

-- No RLS/GRANT changes needed: this is a new column on an already-covered
-- table (RLS from 002, GRANT for authenticated/service_role from 004/007
-- apply to the whole row, not per-column).
