import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { createProjectSchema } from "@/lib/validation";
import {
  jsonError,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import { listClientProjects } from "@/lib/projects";
import type { Project } from "@/lib/types";

/** GET /api/projects?client_id=... — projects of a client (RLS filters). */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const clientId = new URL(request.url).searchParams.get("client_id");
  if (!clientId) {
    return jsonError("Falta el parámetro client_id.", 400);
  }

  const supabase = await createSupabaseClient();
  const { projects, error } = await listClientProjects(supabase, clientId);

  if (error) return jsonError("No se pudieron cargar los proyectos.", 500);

  return NextResponse.json(projects);
}

/**
 * POST /api/projects — create a project on a client.
 * RLS requires owner/editor of the parent client (can_edit_client); a rejection
 * comes back as 42501, translated to 403.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const { client_id, name, description, status } = parsed.data;
  const supabase = await createSupabaseClient();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      client_id,
      name,
      description: description ?? null,
      // Let the column default to 'draft' when the caller omits status.
      ...(status ? { status } : {}),
    })
    .select()
    .single();

  if (error) return translateDbError(error);

  return NextResponse.json(data as Project, { status: 201 });
}
