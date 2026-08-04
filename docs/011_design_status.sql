-- =============================================================================
-- Refashion IA · Migration 011
-- Add designs.status so a session can be resumed where it was left.
--
-- WHY: the design row is created when the editing session starts (it has to —
-- /designs/:id/edit needs an id, and generated assets need a design_id to hang
-- off). That makes "created" and "worked on" indistinguishable: a design
-- abandoned right after the wizard looks exactly like one in progress.
--
--   draft     -> just created, nothing done to it yet
--   active    -> being worked on
--   completed -> the user considers it finished
--
-- Unlike `version` (migration 010), this is NOT derived. It could almost be
-- inferred from the design's assets (none = draft, composition = active,
-- export_* = completed), but status encodes user *intent* — "I consider this
-- done" or "I gave up on it" — which no asset can tell us. Stored on purpose.
--
-- Mirrors projects.status in shape (text + check constraint, not an enum type,
-- so adding a value later is one migration and no type juggling). The values
-- differ: 'completed' rather than 'closed', since a garment prototype is
-- finished, not closed.
-- =============================================================================

alter table public.designs
  add column status text not null default 'draft',
  add constraint designs_status_check
    check (status in ('draft', 'active', 'completed'));

create index on public.designs (status);

-- No RLS/GRANT changes needed: a new column on an already-covered table
-- (RLS from 002, GRANT for authenticated/service_role from 004/007 apply to
-- the whole row, not per-column).
