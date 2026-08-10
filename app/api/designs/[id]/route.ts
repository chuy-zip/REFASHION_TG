import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { deleteObject } from "@/lib/r2";
import { listR2KeysUnderDesign } from "@/lib/assets-server";
import { updateDesignSchema } from "@/lib/validation";
import { assetBelongsToProjectClient } from "@/lib/designs";
import {
  jsonError,
  notFound,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import type { Design } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/designs/:id */
export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const supabase = await createSupabaseClient();

  const { data, error } = await supabase
    .from("designs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return translateDbError(error);
  if (!data) return notFound("El diseño");

  return NextResponse.json(data as Design);
}

/** PATCH /api/designs/:id — owner/editor of the parent client (RLS). */
export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = updateDesignSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const supabase = await createSupabaseClient();

  // Assigning a base garment from the editing screen sends this. The FK is
  // verified below RLS (APRENDIZAJES §2.5b), so without this check it would
  // accept an asset from another client — the same guard POST /api/designs
  // already applies on create.
  if (parsed.data.base_asset_id) {
    const { data: designData } = await supabase
      .from("designs")
      .select("project_id")
      .eq("id", id)
      .maybeSingle();

    const projectId = (designData as { project_id: string } | null)?.project_id;
    if (!projectId) return notFound("El diseño");

    const belongs = await assetBelongsToProjectClient(
      supabase,
      parsed.data.base_asset_id,
      projectId
    );

    if (!belongs) {
      return jsonError(
        "La imagen elegida no pertenece al catálogo de este cliente.",
        400
      );
    }
  }

  const { data, error } = await supabase
    .from("designs")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return translateDbError(error);
  if (!data) {
    return jsonError(
      "No se pudo actualizar el diseño. No existe o no tienes permisos.",
      403
    );
  }

  return NextResponse.json(data as Design);
}

/**
 * DELETE /api/designs/:id — owner/editor of the parent client (RLS).
 *
 * The design's own assets cascade inside Postgres, so their R2 keys are read
 * first. The design's *base garment* is deliberately untouched: it belongs to
 * the client's catalog and may be shared with other designs.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const supabase = await createSupabaseClient();

  const keysToClean = await listR2KeysUnderDesign(supabase, id);

  const { data, error } = await supabase
    .from("designs")
    .delete()
    .eq("id", id)
    .select();

  if (error) return translateDbError(error);
  if (!data || data.length === 0) {
    return jsonError(
      "No se pudo eliminar el diseño. No existe o no tienes permisos.",
      403
    );
  }

  // Best-effort: the design is already gone from the user's point of view.
  const results = await Promise.allSettled(
    keysToClean.map((key) => deleteObject(key))
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(
        `Failed to delete R2 object while deleting design ${id}:`,
        result.reason
      );
    }
  }

  return new NextResponse(null, { status: 204 });
}
