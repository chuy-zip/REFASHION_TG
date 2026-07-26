import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { updateDesignSchema } from "@/lib/validation";
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

/** DELETE /api/designs/:id — owner/editor of the parent client (RLS). */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const supabase = await createSupabaseClient();

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

  return new NextResponse(null, { status: 204 });
}
