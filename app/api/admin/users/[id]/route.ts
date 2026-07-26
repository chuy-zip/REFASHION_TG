import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateUserRoleSchema } from "@/lib/validation";
import { jsonError, notFound, readJsonBody } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/users/:id — changes a user's global role. Admin only.
 *
 * Goes through the admin client because the escalation trigger from migration
 * 005 only lets the service role modify role_id.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  // Blocking self-edits is what guarantees the system always keeps at least one
  // admin: an admin can demote others but never themselves.
  if (id === guard.user.id) {
    return jsonError(
      "No puedes cambiar tu propio rol. Pídeselo a otro administrador.",
      403
    );
  }

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = updateUserRoleSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ role_id: parsed.data.role_id })
    .eq("id", id)
    .select("id, role_id")
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[admin/users PATCH] update failed:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
    }
    return jsonError("No se pudo actualizar el rol.", 500);
  }
  if (!data) return notFound("El usuario");

  return NextResponse.json(data);
}

/**
 * DELETE /api/admin/users/:id — removes a user. Admin only.
 *
 * Refuses when the user is the only owner of a client: client_members cascades
 * on auth.users, so deleting them would strip that client of its last owner and
 * leave it unmanageable.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  if (id === guard.user.id) {
    return jsonError("No puedes eliminar tu propia cuenta.", 403);
  }

  const admin = createAdminClient();

  const { data: ownerships, error: ownershipError } = await admin
    .from("client_members")
    .select("client_id")
    .eq("user_id", id)
    .eq("role", "owner");

  if (ownershipError) {
    return jsonError("No se pudo verificar la propiedad de clientes.", 500);
  }

  const ownedClientIds = (ownerships ?? []).map((row) => row.client_id);

  if (ownedClientIds.length > 0) {
    // Every owner row for the clients this user owns, to spot the ones where
    // they are the only one.
    const { data: allOwners, error: ownersError } = await admin
      .from("client_members")
      .select("client_id")
      .in("client_id", ownedClientIds)
      .eq("role", "owner");

    if (ownersError) {
      return jsonError("No se pudo verificar la propiedad de clientes.", 500);
    }

    const ownerCount = new Map<string, number>();
    for (const row of allOwners ?? []) {
      ownerCount.set(row.client_id, (ownerCount.get(row.client_id) ?? 0) + 1);
    }

    const soleOwned = ownedClientIds.filter(
      (clientId) => ownerCount.get(clientId) === 1
    );

    if (soleOwned.length > 0) {
      const { data: clients } = await admin
        .from("clients")
        .select("name")
        .in("id", soleOwned);

      const names = (clients ?? []).map((c) => c.name).join(", ");
      return jsonError(
        `No se puede eliminar: es el único owner de ${names}. Asigna otro owner antes de continuar.`,
        409
      );
    }
  }

  // Cascades to profiles and client_members via their FKs on auth.users.
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return jsonError("No se pudo eliminar el usuario.", 500);

  return new NextResponse(null, { status: 204 });
}
