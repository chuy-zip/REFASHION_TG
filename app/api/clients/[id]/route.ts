import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { updateClientSchema } from "@/lib/validation";
import {
  jsonError,
  notFound,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import type { Client } from "@/lib/types";

/** In Next 16 dynamic route params arrive as a Promise. */
type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/clients/:id */
export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const supabase = await createSupabaseClient();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return translateDbError(error);
  // RLS filters out clients the user cannot see, so "no row" covers both
  // "does not exist" and "no access" — deliberately indistinguishable.
  if (!data) return notFound("El cliente");

  return NextResponse.json(data as Client);
}

/** PATCH /api/clients/:id — owner or editor (enforced by RLS). */
export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = updateClientSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return translateDbError(error);
  // A viewer passes the read policy but not the update one: the UPDATE matches
  // zero rows instead of erroring.
  if (!data) {
    return jsonError(
      "No se pudo actualizar el cliente. No existe o no tienes permisos.",
      403
    );
  }

  return NextResponse.json(data as Client);
}

/** DELETE /api/clients/:id — owner only (enforced by RLS). */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const supabase = await createSupabaseClient();

  // .select() is required to learn how many rows the policy actually matched.
  const { data, error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .select();

  if (error) return translateDbError(error);
  if (!data || data.length === 0) {
    return jsonError(
      "No se pudo eliminar el cliente. Solo el owner puede hacerlo.",
      403
    );
  }

  return new NextResponse(null, { status: 204 });
}
