import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { deleteObject } from "@/lib/r2";
import { jsonError, translateDbError, unauthorized } from "@/lib/api";
import type { Asset } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/assets/:id — owner/editor of the parent client (RLS).
 * Deletes the DB row first: if the R2 delete below fails, the result is an
 * orphaned blob (invisible, cleaned up later), not a broken DB reference to a
 * file that no longer exists. The R2 failure is swallowed on purpose: from the
 * user's point of view the resource is already gone (the DB delete — the part
 * that succeeded — is what the rest of the app checks), so a transient R2
 * hiccup must not turn a successful delete into a 500.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const supabase = await createSupabaseClient();

  const { data, error } = await supabase
    .from("assets")
    .delete()
    .eq("id", id)
    .select();

  if (error) return translateDbError(error);
  if (!data || data.length === 0) {
    return jsonError(
      "No se pudo eliminar el recurso. No existe o no tienes permisos.",
      403
    );
  }

  try {
    await deleteObject((data[0] as Asset).r2_key);
  } catch {
    // Orphaned blob in R2, invisible to the user. Logged so it can be swept
    // later; not surfaced as an error since the DB delete already succeeded.
    console.error(
      `Failed to delete R2 object for asset ${id}: ${(data[0] as Asset).r2_key}`
    );
  }

  return new NextResponse(null, { status: 204 });
}
