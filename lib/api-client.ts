/**
 * Thin client for calling the app's own /api/* routes from client components.
 *
 * Centralizes the two things every mutation repeated by hand: turning a non-OK
 * response into a readable message, and surviving a network failure. Handlers
 * always answer errors as { error: string }, so that is what we read.
 *
 * Returns a discriminated result instead of throwing, so callers branch on
 * `result.ok` without a try/catch.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const JSON_HEADERS = { "Content-Type": "application/json" };

async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    return {
      ok: false,
      error: "No se pudo conectar con el servidor. Revisa tu conexión.",
    };
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error =
      payload && typeof payload.error === "string"
        ? payload.error
        : "No se pudo completar la operación.";
    return { ok: false, error };
  }

  // 204 No Content (e.g. DELETE) has no body to parse.
  if (response.status === 204) {
    return { ok: true, data: undefined as T };
  }

  const data = await response.json().catch(() => undefined);
  return { ok: true, data: data as T };
}

export function apiGet<T = unknown>(url: string) {
  return apiFetch<T>(url, { method: "GET" });
}

export function apiPost<T = unknown>(url: string, body: unknown) {
  return apiFetch<T>(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export function apiPatch<T = unknown>(url: string, body: unknown) {
  return apiFetch<T>(url, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export function apiDelete<T = unknown>(url: string) {
  return apiFetch<T>(url, { method: "DELETE" });
}
