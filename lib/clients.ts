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
 * **Two extra queries for the whole page, not two per client.** The counts are
 * grouped in memory because the alternative (an aggregate per row) multiplies
 * round trips by the number of clients. RLS filters every query, so a user only
 * ever counts work they can already see.
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

  const { data: projectRows } = await supabase
    .from("projects")
    .select("id, client_id")
    .in(
      "client_id",
      clients.map((client) => client.id)
    );

  const projects = (projectRows ?? []) as { id: string; client_id: string }[];

  const projectCount = new Map<string, number>();
  const clientOfProject = new Map<string, string>();
  for (const project of projects) {
    projectCount.set(
      project.client_id,
      (projectCount.get(project.client_id) ?? 0) + 1
    );
    clientOfProject.set(project.id, project.client_id);
  }

  const designCount = new Map<string, number>();
  if (projects.length > 0) {
    const { data: designRows } = await supabase
      .from("designs")
      .select("id, project_id")
      .in(
        "project_id",
        projects.map((project) => project.id)
      );

    for (const design of (designRows ?? []) as { project_id: string }[]) {
      const clientId = clientOfProject.get(design.project_id);
      if (!clientId) continue;
      designCount.set(clientId, (designCount.get(clientId) ?? 0) + 1);
    }
  }

  return {
    clients: clients.map((client) => ({
      ...client,
      project_count: projectCount.get(client.id) ?? 0,
      design_count: designCount.get(client.id) ?? 0,
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
