import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { canCurrentUserManageMembers, requireUser } from "@/lib/authz";
import { jsonError } from "@/lib/api";
import { listUsers } from "@/lib/users";

/**
 * GET /api/users — the user directory.
 *
 * For whoever may add members: a global admin, or the owner of at least one
 * client, who needs it to find a colleague by email before inviting them.
 *
 * It used to be open to any signed-in user, on the grounds that name and email
 * are nothing sensitive. That made every account a way to list every other
 * one, including a shared read-only demo account (migración 022). The check
 * here is for a clear 403; the `profiles` RLS enforces the same rule anyway,
 * because the browser holds the public key and could ask the table directly.
 */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  if (!(await canCurrentUserManageMembers())) {
    return jsonError("No tienes permisos para ver el directorio de usuarios.", 403);
  }

  const supabase = await createSupabaseClient();
  const { users, error } = await listUsers(supabase);

  if (error) {
    return jsonError("No se pudo cargar el directorio de usuarios.", 500);
  }

  return NextResponse.json(users);
}
