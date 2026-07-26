import type { SupabaseClient } from "@supabase/supabase-js";
import type { GlobalRole, Role, UserSummary } from "@/lib/types";

/**
 * Shared readers for the user directory, used by both Route Handlers and
 * Server Components so the shape is defined once.
 *
 * profiles is readable by every authenticated user (migration 005), which is
 * what makes the member picker possible without the secret key.
 */

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  role_id: number;
  roles: { name: GlobalRole } | null;
};

export async function listUsers(
  supabase: SupabaseClient
): Promise<{ users: UserSummary[]; error: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, role_id, roles(name)")
    .order("first_name", { ascending: true });

  if (error) return { users: [], error: error.message };

  const users = (data as unknown as ProfileRow[]).map((row) => ({
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    role_id: row.role_id,
    role_name: row.roles?.name ?? "viewer",
  }));

  return { users, error: null };
}

export async function listRoles(
  supabase: SupabaseClient
): Promise<{ roles: Role[]; error: string | null }> {
  const { data, error } = await supabase
    .from("roles")
    .select("id, name, description")
    .order("id", { ascending: true });

  if (error) return { roles: [], error: error.message };
  return { roles: data as Role[], error: null };
}

/** "Nombre Apellido", falling back to the email when the profile is bare. */
export function displayName(user: UserSummary): string {
  const full = `${user.first_name} ${user.last_name}`.trim();
  return full.length > 0 ? full : (user.email ?? "Usuario sin nombre");
}
