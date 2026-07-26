import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { updateMemberRoleSchema } from "@/lib/validation";
import { jsonError, readJsonBody, translateDbError, unauthorized } from "@/lib/api";
import { countOwners } from "@/lib/members";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/**
 * PATCH /api/clients/:id/members/:userId — change a member's role. Owner only.
 *
 * Guards the "at least one owner" invariant: demoting the last owner is refused
 * before the write, so a client can never be left unmanageable.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id, userId } = await params;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = updateMemberRoleSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const supabase = await createSupabaseClient();

  // Demoting an owner to a non-owner role could remove the last owner.
  if (parsed.data.role !== "owner") {
    const { data: current } = await supabase
      .from("client_members")
      .select("role")
      .eq("client_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (current?.role === "owner" && (await countOwners(supabase, id)) <= 1) {
      return jsonError(
        "No puedes quitar el último owner del cliente. Asigna otro owner primero.",
        409
      );
    }
  }

  const { data, error } = await supabase
    .from("client_members")
    .update({ role: parsed.data.role })
    .eq("client_id", id)
    .eq("user_id", userId)
    .select("user_id, role")
    .maybeSingle();

  if (error) return translateDbError(error);
  if (!data) {
    return jsonError(
      "No se pudo cambiar el rol. No existe el miembro o no tienes permisos.",
      403
    );
  }

  return NextResponse.json(data);
}

/**
 * DELETE /api/clients/:id/members/:userId — revoke access. Owner only.
 * Same invariant: the last owner cannot be removed.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id, userId } = await params;
  const supabase = await createSupabaseClient();

  const { data: current } = await supabase
    .from("client_members")
    .select("role")
    .eq("client_id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (current?.role === "owner" && (await countOwners(supabase, id)) <= 1) {
    return jsonError(
      "No puedes quitar el último owner del cliente. Asigna otro owner primero.",
      409
    );
  }

  const { data, error } = await supabase
    .from("client_members")
    .delete()
    .eq("client_id", id)
    .eq("user_id", userId)
    .select("user_id");

  if (error) return translateDbError(error);
  if (!data || data.length === 0) {
    return jsonError(
      "No se pudo quitar el miembro. No existe o no tienes permisos.",
      403
    );
  }

  return new NextResponse(null, { status: 204 });
}
