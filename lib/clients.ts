import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "@/lib/types";

/**
 * A client plus how much work it holds. The list shows these two numbers
 * instead of a thumbnail: a client is not an image, and borrowing pictures
 * from two levels down duplicated what its own Proyectos tab shows better.
 */
export interface ClientWithCounts extends Client {
  project_count: number;
  design_count: number;
}

/**
 * Clients the caller may see, alphabetically, each with its project and design
 * counts.
 *
 * **Two queries, and each returns one row per client.** The counts are computed
 * by `client_work_counts` (migration 014), not in JavaScript. The first version
 * of this function fetched every project and every design of every visible
 * client to produce two numbers, which is the shape of bug that only shows up
 * once the product is used: correct output, cost proportional to the whole
 * database.
 *
 * The view runs with `security_invoker`, so a user counts only the work their
 * own RLS lets them see.
 *
 * No image is signed here, by design (see `REFACTOR_VISUAL` §7): this is the
 * only one of the three list levels that costs nothing to render.
 */
export async function listClientsWithCounts(
  supabase: SupabaseClient
): Promise<{ clients: ClientWithCounts[]; error: string | null }> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name", { ascending: true });

  if (error) return { clients: [], error: error.message };

  const clients = (data ?? []) as Client[];
  if (clients.length === 0) return { clients: [], error: null };

  const { data: countRows } = await supabase
    .from("client_work_counts")
    .select("client_id, project_count, design_count")
    .in(
      "client_id",
      clients.map((client) => client.id)
    );

  const countsByClient = new Map<
    string,
    { project_count: number; design_count: number }
  >();

  for (const row of (countRows ?? []) as {
    client_id: string;
    project_count: number;
    design_count: number;
  }[]) {
    countsByClient.set(row.client_id, {
      project_count: row.project_count,
      design_count: row.design_count,
    });
  }

  return {
    clients: clients.map((client) => ({
      ...client,
      project_count: countsByClient.get(client.id)?.project_count ?? 0,
      design_count: countsByClient.get(client.id)?.design_count ?? 0,
    })),
    error: null,
  };
}

/** "3 proyectos · 12 diseños", or what to say when there is nothing yet. */
export function clientWorkSummary(client: ClientWithCounts): string {
  if (client.project_count === 0) return "Sin proyectos aún";

  const projects =
    client.project_count === 1 ? "1 proyecto" : `${client.project_count} proyectos`;

  const designs =
    client.design_count === 0
      ? "sin diseños"
      : client.design_count === 1
        ? "1 diseño"
        : `${client.design_count} diseños`;

  return `${projects} · ${designs}`;
}

/** "Ciudad de Guatemala, Guatemala" from whichever of the two exists. */
export function clientLocation(client: Client): string | null {
  const parts = [client.city, client.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
