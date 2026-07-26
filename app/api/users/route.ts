import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { jsonError } from "@/lib/api";
import { listUsers } from "@/lib/users";

/**
 * GET /api/users — the user directory.
 *
 * Available to any signed-in user, not just admins: a client owner needs it to
 * find a colleague by email before inviting them. Exposes name, email and
 * global role, nothing sensitive.
 */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const supabase = await createSupabaseClient();
  const { users, error } = await listUsers(supabase);

  if (error) {
    return jsonError("No se pudo cargar el directorio de usuarios.", 500);
  }

  return NextResponse.json(users);
}
