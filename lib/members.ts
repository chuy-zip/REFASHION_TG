import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientRole } from "@/lib/types";

/**
 * Readers and invariants for client membership, shared by Route Handlers and
 * Server Components.
 *
 * The core invariant everything here protects: a client must never be left with
 * zero owners. It is checked before any removal or demotion.
 */

export interface ClientMemberView {
  user_id: string;
  role: ClientRole;
  email: string | null;
  first_name: string;
  last_name: string;
}

/**
 * Members of a client with their profile info.
 *
 * Two queries instead of a PostgREST embed: client_members.user_id and
 * profiles.id both point at auth.users, but there is no direct FK between the
 * two tables to embed across.
 */
export async function listClientMembers(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ members: ClientMemberView[]; error: string | null }> {
  const { data: rows, error } = await supabase
    .from("client_members")
    .select("user_id, role")
    .eq("client_id", clientId);

  if (error) return { members: [], error: error.message };
  if (!rows || rows.length === 0) return { members: [], error: null };

  const userIds = rows.map((row) => row.user_id);
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name")
    .in("id", userIds);

  if (profilesError) return { members: [], error: profilesError.message };

  const byId = new Map(
    (profiles ?? []).map((p) => [p.id as string, p])
  );

  const members = rows
    .map((row) => {
      const profile = byId.get(row.user_id);
      return {
        user_id: row.user_id as string,
        role: row.role as ClientRole,
        email: profile?.email ?? null,
        first_name: profile?.first_name ?? "",
        last_name: profile?.last_name ?? "",
      };
    })
    // Owners first, then alphabetical by name.
    .sort((a, b) => {
      if (a.role === "owner" && b.role !== "owner") return -1;
      if (b.role === "owner" && a.role !== "owner") return 1;
      return `${a.first_name} ${a.last_name}`.localeCompare(
        `${b.first_name} ${b.last_name}`
      );
    });

  return { members, error: null };
}

/** Number of owners a client currently has. */
export async function countOwners(
  supabase: SupabaseClient,
  clientId: string
): Promise<number> {
  const { count } = await supabase
    .from("client_members")
    .select("user_id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("role", "owner");

  return count ?? 0;
}
