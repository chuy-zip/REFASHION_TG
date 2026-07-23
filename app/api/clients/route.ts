import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { createClientSchema } from "@/lib/validation";
import {
  jsonError,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import type { Client } from "@/lib/types";

/** GET /api/clients — clients the signed-in user is a member of (RLS filters). */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name", { ascending: true });

  if (error) return translateDbError(error);

  return NextResponse.json(data as Client[]);
}

/** POST /api/clients — creates the client and makes the caller its owner. */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = createClientSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const { name, nit, address, city, country, notes } = parsed.data;
  const supabase = await createSupabaseClient();

  // One RPC = one transaction: inserts the client AND the owner membership.
  // If either insert fails the whole call rolls back, so an orphan client
  // (one with no members, invisible to everyone) cannot happen. See
  // docs/003_create_client_with_owner.sql.
  const { data, error } = await supabase
    .rpc("create_client_with_owner", {
      p_name: name,
      p_nit: nit ?? null,
      p_address: address ?? null,
      p_city: city ?? null,
      p_country: country ?? null,
      p_notes: notes ?? null,
    })
    .single();

  if (error) return translateDbError(error);

  return NextResponse.json(data as Client, { status: 201 });
}
