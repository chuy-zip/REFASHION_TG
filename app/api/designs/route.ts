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
import { listProjectDesigns } from "@/lib/designs";
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

  const { project_id, name, garment_type, version, notes } = parsed.data;
  const supabase = await createSupabaseClient();

  const { data, error } = await supabase
    .from("designs")
    .insert({
      project_id,
      name,
      notes: notes ?? null,
      // Let the columns default (garment_type='shirt', version=1) when omitted.
      ...(garment_type ? { garment_type } : {}),
      ...(version ? { version } : {}),
    })
    .select()
    .single();

  if (error) return translateDbError(error);

  return NextResponse.json(data as Design, { status: 201 });
}
