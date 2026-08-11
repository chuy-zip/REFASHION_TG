import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { resolveDesignPath } from "@/lib/designs";
import {
  assetIsUsableAsLayer,
  listDesignLayers,
  nextLayerZIndex,
} from "@/lib/layers";
import { createLayerSchema } from "@/lib/validation";
import {
  jsonError,
  notFound,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import type { DesignLayer } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/designs/:id/layers — the design's logo stack, bottom to top. */
export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const supabase = await createSupabaseClient();
  const { layers, error } = await listDesignLayers(supabase, id);

  if (error) return jsonError("No se pudieron cargar las capas.", 500);

  return NextResponse.json(layers);
}

/**
 * POST /api/designs/:id/layers — place a logo on the design.
 *
 * RLS enforces owner/editor through client_id_of_design (migration 013). What
 * RLS cannot check is whether the *referenced* logo is one this design may use:
 * foreign keys are verified below it, so that goes through assetIsUsableAsLayer.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = createLayerSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const supabase = await createSupabaseClient();

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

  const { asset_id, ...geometry } = parsed.data;

  const { data, error } = await supabase
    .from("design_layers")
    .insert({
      design_id: id,
      asset_id,
      // Lands on top of the stack unless the caller says otherwise.
      z_index: geometry.z_index ?? (await nextLayerZIndex(supabase, id)),
      ...geometry,
    })
    .select()
    .single();

  if (error) return translateDbError(error);

  return NextResponse.json(data as DesignLayer, { status: 201 });
}
