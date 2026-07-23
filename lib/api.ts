import { NextResponse } from "next/server";

/**
 * Shared helpers for Route Handlers: consistent JSON errors and translation of
 * raw Postgres failures into messages a user can act on.
 */

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export const unauthorized = () => jsonError("No autorizado.", 401);

export const notFound = (what = "El recurso") =>
  jsonError(`${what} no existe o no tienes acceso.`, 404);

/** Parses a JSON body, returning null when it is absent or malformed. */
export async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

interface DbError {
  code?: string;
  message?: string;
}

/**
 * Maps Postgres error codes to HTTP responses.
 *
 * RLS rejections surface as 42501; a query the policy filters out simply returns
 * zero rows, which the handlers translate to 404 themselves.
 */
export function translateDbError(error: DbError) {
  switch (error.code) {
    case "42501": // insufficient_privilege — blocked by RLS
      return jsonError("No tienes permisos para realizar esta acción.", 403);
    case "23505": // unique_violation
      return jsonError("Ya existe un registro con esos datos.", 409);
    case "23503": // foreign_key_violation
      return jsonError("El registro relacionado no existe.", 400);
    case "23514": // check_violation
      return jsonError("Los datos no cumplen las reglas de validación.", 400);
    case "28000": // raised by create_client_with_owner when there is no JWT
      return unauthorized();
    default:
      return jsonError("No se pudo completar la operación.", 500);
  }
}
