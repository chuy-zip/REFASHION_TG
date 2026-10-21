import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { addMemberSchema } from "@/lib/validation";
import { jsonError, readJsonBody, translateDbError, unauthorized } from "@/lib/api";
import { listClientMembers } from "@/lib/members";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/clients/:id/members — the roster, as far as the caller may see it.
 *
 * Owner, editor and admin get every member; a viewer gets only their own row.
 * No check here because the RLS already cuts the list (migración 022): this
 * route returns whatever the caller's own session can read.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const supabase = await createSupabaseClient();
  const { members, error } = await listClientMembers(supabase, id);

  if (error) {
    return jsonError("No se pudieron cargar los miembros del cliente.", 500);
  }

  return NextResponse.json(members);
}

/**
 * POST /api/clients/:id/members — grant a user access. Owner (or admin) only;
 * RLS enforces that, and the handler translates the rejection to a clear error.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("client_members")
    .insert({
      client_id: id,
      user_id: parsed.data.user_id,
      role: parsed.data.role,
    })
    .select("user_id, role")
    .maybeSingle();

  if (error) {
    // 23505 = already a member; give a friendlier message than the generic one.
    if (error.code === "23505") {
      return jsonError("Ese usuario ya es miembro del cliente.", 409);
    }
    return translateDbError(error);
  }

  return NextResponse.json(data, { status: 201 });
}
