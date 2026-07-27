-- =============================================================================
-- Refashion IA · Migration 009
-- Add clients.phone and clients.email — one of each, both optional.
--
-- WHY: considered a client_phones join table first (like client_members) for
-- multiple numbers per client, but the actual need turned out to be simpler:
-- one phone, one email, both optional. Plain columns, no join table — no
-- reason to model multiplicity that was never asked for.
-- =============================================================================

alter table public.clients
  add column phone text,
  add column email text;

-- No RLS/GRANT changes needed: new columns on an already-covered table
-- (RLS from 002, GRANT for authenticated/service_role from 004/007 apply to
-- the whole row, not per-column).
