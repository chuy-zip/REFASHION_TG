import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { deleteObject } from "@/lib/r2";
import { listR2KeysUnderProject } from "@/lib/assets-server";
import { updateProjectSchema } from "@/lib/validation";
import {
  jsonError,
  notFound,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import type { Project } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/:id */
export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const supabase = await createSupabaseClient();

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return translateDbError(error);
  if (!data) return notFound("El proyecto");

  return NextResponse.json(data as Project);
}

/** PATCH /api/projects/:id — owner/editor of the parent client (RLS). */
export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return translateDbError(error);
  if (!data) {
    return jsonError(
      "No se pudo actualizar el proyecto. No existe o no tienes permisos.",
      403
    );
  }

  return NextResponse.json(data as Project);
}

/**
 * DELETE /api/projects/:id — owner/editor of the parent client (RLS).
 *
 * Same shape as DELETE /api/clients/:id: the cascade reaches designs and their
 * assets inside Postgres, so the R2 keys have to be read *before* the delete or
 * the blobs are orphaned with nothing left pointing at them.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const supabase = await createSupabaseClient();

  const keysToClean = await listR2KeysUnderProject(supabase, id);

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .select();

  if (error) return translateDbError(error);
  if (!data || data.length === 0) {
    return jsonError(
      "No se pudo eliminar el proyecto. No existe o no tienes permisos.",
      403
    );
  }

  // Best-effort: the project is already gone from the user's point of view, so
  // a failed R2 delete is an invisible orphan, not an error to surface.
  const results = await Promise.allSettled(
    keysToClean.map((key) => deleteObject(key))
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(
        `Failed to delete R2 object while deleting project ${id}:`,
        result.reason
      );
    }
  }

  return new NextResponse(null, { status: 204 });
}
