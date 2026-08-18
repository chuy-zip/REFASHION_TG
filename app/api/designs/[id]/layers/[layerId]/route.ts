import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { resolveDesignPath } from "@/lib/designs";
import { assetIsUsableAsLayer } from "@/lib/layers";
import { updateLayerSchema } from "@/lib/validation";
import {
  jsonError,
  notFound,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import type { DesignLayer } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string; layerId: string }> };

/**
 * PATCH /api/designs/:id/layers/:layerId — move, scale, rotate a layer, or
 * point it at a different image of the same logo (see `updateLayerSchema`).
 *
 * The `design_id` filter is not redundant with RLS — it keeps a layer id from
 * another design from being edited through this design's URL.
 *
 * The geometry path is what the canvas calls on every `dragend` /
 * `transformend`, so it stays one round trip: the extra lookups below only run
 * when a swap is actually requested.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id, layerId } = await params;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = updateLayerSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const supabase = await createSupabaseClient();

  // Same check the POST does, for the same reason: the foreign key would
  // happily accept a logo from another client, and it is verified below RLS.
  if (parsed.data.asset_id) {
    const path = await resolveDesignPath(supabase, id);
    if (!path) return notFound("El diseño");

    const usable = await assetIsUsableAsLayer(
      supabase,
      parsed.data.asset_id,
      path.clientId
    );
    if (!usable) {
      return jsonError(
        "Solo puedes colocar logotipos del catálogo de este cliente.",
        400
      );
    }
  }

  const { data, error } = await supabase
    .from("design_layers")
    .update(parsed.data)
    .eq("id", layerId)
    .eq("design_id", id)
    .select()
    .maybeSingle();

  if (error) return translateDbError(error);
  if (!data) {
    return jsonError(
      "No se pudo actualizar la capa. No existe o no tienes permisos.",
      403
    );
  }

  return NextResponse.json(data as DesignLayer);
}

/** DELETE /api/designs/:id/layers/:layerId — take the logo off the design. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id, layerId } = await params;
  const supabase = await createSupabaseClient();

  // No R2 cleanup here, on purpose: the logo belongs to the client's catalog
  // and may be placed on other designs. Removing a layer removes a placement,
  // not an image.
  const { data, error } = await supabase
    .from("design_layers")
    .delete()
    .eq("id", layerId)
    .eq("design_id", id)
    .select();

  if (error) return translateDbError(error);
  if (!data || data.length === 0) {
    return jsonError(
      "No se pudo eliminar la capa. No existe o no tienes permisos.",
      403
    );
  }

  return new NextResponse(null, { status: 204 });
}
