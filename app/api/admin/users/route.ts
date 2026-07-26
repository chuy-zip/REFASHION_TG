import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserSchema } from "@/lib/validation";
import { jsonError, readJsonBody } from "@/lib/api";

/**
 * POST /api/admin/users — creates a user. Admin only.
 *
 * Uses the Auth Admin API, never supabase.auth.signUp(): signUp would sign the
 * new user in and replace the admin's own session.
 *
 * Listing lives at GET /api/users, which every signed-in user may call.
 */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const { email, password, first_name, last_name, role_id } = parsed.data;
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    // Without this the account cannot sign in until the email is confirmed.
    email_confirm: true,
    // handle_new_user() reads these to fill the profile row.
    user_metadata: { first_name, last_name },
  });

  if (error || !data.user) {
    const alreadyExists =
      error?.status === 422 || /already/i.test(error?.message ?? "");
    return jsonError(
      alreadyExists
        ? "Ya existe un usuario con ese correo electrónico."
        : "No se pudo crear el usuario.",
      alreadyExists ? 409 : 500
    );
  }

  // The trigger created the profile with the default role (viewer). Apply the
  // requested one — only the service role may touch role_id (migration 005).
  const { error: roleError } = await admin
    .from("profiles")
    .update({ role_id })
    .eq("id", data.user.id);

  if (roleError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[admin/users POST] role update failed:", {
        message: roleError.message,
        code: roleError.code,
        details: roleError.details,
        hint: roleError.hint,
      });
    }
    // The account exists but has the wrong role; removing it keeps the two
    // stores consistent instead of leaving a half-created user behind.
    const { error: deleteError } = await admin.auth.admin.deleteUser(
      data.user.id
    );
    if (deleteError && process.env.NODE_ENV === "development") {
      console.error(
        "[admin/users POST] cleanup deleteUser also failed:",
        deleteError.message
      );
    }
    return jsonError("No se pudo asignar el rol. El usuario no se creó.", 500);
  }

  return NextResponse.json({ id: data.user.id, email }, { status: 201 });
}
