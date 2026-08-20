import type { SupabaseClient } from "@supabase/supabase-js";
import type { BadgeTone } from "@/components/ui/Badge/Badge";
import type { Project, ProjectStatus } from "@/lib/types";

/** User-facing Spanish copy for project statuses (code/DB keep English). */
export const PROJECT_STATUS_COPY: Record<
  ProjectStatus,
  { label: string; tone: BadgeTone }
> = {
  draft: { label: "Borrador", tone: "neutral" },
  active: { label: "Activo", tone: "success" },
  closed: { label: "Cerrado", tone: "muted" },
};

export function projectStatusLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_COPY[status]?.label ?? status;
}

/**
 * How many projects a client screen shows at a time.
 *
 * Six, and the number is doing real work: each project card carries up to four
 * design thumbnails, so this is what makes the images on that screen a fixed
 * `6 × 4 = 24` instead of "four per project that exists". A cap that grows with
 * the data is not a cap.
 */
export const PROJECTS_PAGE_SIZE = 6;

export interface ProjectListOptions {
  /** 1-based. Omit both to get every project. */
  page?: number;
  pageSize?: number;
}

/**
 * Projects of a client, newest first, optionally paged. RLS returns only what
 * the user may see. `total` is the count before paging, for the pager.
 */
export async function listClientProjects(
  supabase: SupabaseClient,
  clientId: string,
  options: ProjectListOptions = {}
): Promise<{ projects: Project[]; total: number; error: string | null }> {
  let request = supabase
    .from("projects")
    .select("*", { count: "exact" })
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (options.page && options.pageSize) {
    const from = (options.page - 1) * options.pageSize;
    request = request.range(from, from + options.pageSize - 1);
  }

  const { data, error, count } = await request;

  if (error) return { projects: [], total: 0, error: error.message };
  return {
    projects: (data ?? []) as Project[],
    total: count ?? 0,
    error: null,
  };
}
