import type { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { jsonError, unauthorized } from "@/lib/api";

/**
 * Authorization guards for Route Handlers.
 *
 * These are the explicit, readable half of the permission model; RLS is the
 * backstop underneath. Checking here produces a clear 401/403 instead of the
 * "zero rows affected" a policy rejection would return.
 */

export type Guard =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

export async function requireUser(): Promise<Guard> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, response: unauthorized() };
  return { ok: true, user };
}

/** True when the signed-in user holds the global `admin` role. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createSupabaseClient();
  // Reuses the same function the RLS policies call, so there is one definition
  // of "admin" for the whole system.
  const { data, error } = await supabase.rpc("is_global_admin");
  if (error) return false;
  return data === true;
}

export async function requireAdmin(): Promise<Guard> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, response: unauthorized() };

  if (!(await isCurrentUserAdmin())) {
    return {
      ok: false,
      response: jsonError("Se requieren permisos de administrador.", 403),
    };
  }

  return { ok: true, user };
}
