import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { createDesignSchema } from "@/lib/validation";
import {
  jsonError,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import { listProjectDesigns, resolveDesignImageAssetId } from "@/lib/designs";
import type { Design } from "@/lib/types";

/** GET /api/designs?project_id=... — designs of a project (RLS filters). */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const projectId = new URL(request.url).searchParams.get("project_id");
  if (!projectId) {
    return jsonError("Falta el parámetro project_id.", 400);
  }

  const supabase = await createSupabaseClient();
  const { designs, error } = await listProjectDesigns(supabase, projectId);

  if (error) return jsonError("No se pudieron cargar los diseños.", 500);

  return NextResponse.json(designs);
}

/**
 * POST /api/designs — create a design on a project.
 * RLS requires owner/editor of the parent client (can_edit_client via
 * client_id_of_project); a rejection comes back as 42501, translated to 403.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = createDesignSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const { project_id, name, garment_type, base_asset_id, parent_design_id, notes } =
    parsed.data;
  const supabase = await createSupabaseClient();

  let version = 1;
  let startingAssetId = base_asset_id ?? null;

  if (parent_design_id) {
    // An iteration inherits its version and starting image from its parent, so
    // the client never gets to set either. Reading the parent goes through RLS:
    // no row means no access, and the request is rejected rather than silently
    // producing an orphan v1.
    const { data: parentData, error: parentError } = await supabase
      .from("designs")
      .select("*")
      .eq("id", parent_design_id)
      .maybeSingle();

    if (parentError) return translateDbError(parentError);
    if (!parentData) {
      return jsonError(
        "El diseño del que quieres iterar no existe o no tienes acceso.",
        403
      );
    }

    const parent = parentData as Design;
    if (parent.project_id !== project_id) {
      return jsonError(
        "Solo se puede iterar un diseño del mismo proyecto.",
        400
      );
    }

    version = parent.version + 1;
    startingAssetId = resolveDesignImageAssetId(parent);
  } else if (startingAssetId) {
    // Foreign keys are enforced below RLS, so the FK alone would happily accept
    // an asset id belonging to another client. Verify the asset is both visible
    // to this user (RLS) and part of this project's client before storing it.
    const { data: assetData, error: assetError } = await supabase
      .from("assets")
      .select("id, client_id")
      .eq("id", startingAssetId)
      .maybeSingle();

    if (assetError) return translateDbError(assetError);

    const { data: projectData } = await supabase
      .from("projects")
      .select("client_id")
      .eq("id", project_id)
      .maybeSingle();

    const assetClientId = (assetData as { client_id: string | null } | null)
      ?.client_id;
    const projectClientId = (projectData as { client_id: string } | null)
      ?.client_id;

    if (!assetData || !projectClientId || assetClientId !== projectClientId) {
      return jsonError(
        "La imagen elegida no pertenece al catálogo de este cliente.",
        400
      );
    }
  }

  const { data, error } = await supabase
    .from("designs")
    .insert({
      project_id,
      name,
      version,
      base_asset_id: startingAssetId,
      parent_design_id: parent_design_id ?? null,
      notes: notes ?? null,
      // Let the column default to 'shirt' when the caller omits it.
      ...(garment_type ? { garment_type } : {}),
    })
    .select()
    .single();

  if (error) return translateDbError(error);

  return NextResponse.json(data as Design, { status: 201 });
}
