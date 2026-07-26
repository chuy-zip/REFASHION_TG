import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, ClientRole } from "@/lib/types";

/**
 * A user's effective access to one client, derived from their membership role
 * plus the global-admin bypass. Mirrors the RLS helpers can_edit_client /
 * is_client_owner, so the UI offers exactly what the database will allow.
 *
 * Used by the client and project detail pages to decide which actions to show.
 */
export interface ClientAccess {
  role: ClientRole | null;
  isAdmin: boolean;
  /** owner/editor (or admin): create, edit and delete projects/designs; edit client. */
  canEdit: boolean;
  /** owner (or admin): delete the client, manage its members. */
  canManage: boolean;
}

export async function getClientAccess(
  supabase: SupabaseClient,
  clientId: string,
  userId: string
): Promise<ClientAccess> {
  const [membershipResult, adminResult] = await Promise.all([
    supabase
      .from("client_members")
      .select("role")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.rpc("is_global_admin"),
  ]);

  const role = (membershipResult.data?.role ?? null) as ClientRole | null;
  const isAdmin = adminResult.data === true;

  return {
    role,
    isAdmin,
    canEdit: isAdmin || role === "owner" || role === "editor",
    canManage: isAdmin || role === "owner",
  };
}

type ClientOption = Pick<Client, "id" | "name">;

interface ClientMembershipRow {
  clients: ClientOption | null;
}

/**
 * Clients the user may create projects/designs on: every client for an admin
 * (superuser bypass), or those where they hold owner/editor for anyone else.
 * Feeds the sidebar's "+ Nuevo diseño" shortcut, which needs to know up front
 * whether there is anywhere to create into.
 */
export async function listEditableClients(
  supabase: SupabaseClient,
  userId: string,
  isAdmin: boolean
): Promise<ClientOption[]> {
  if (isAdmin) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) return [];
    return data as ClientOption[];
  }

  const { data, error } = await supabase
    .from("client_members")
    .select("clients(id, name)")
    .eq("user_id", userId)
    .in("role", ["owner", "editor"]);

  if (error) return [];

  return (data as unknown as ClientMembershipRow[])
    .map((row) => row.clients)
    .filter((client): client is ClientOption => client !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}
