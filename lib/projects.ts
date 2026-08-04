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

/** Projects of a client, newest first. RLS returns only what the user may see. */
export async function listClientProjects(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ projects: Project[]; error: string | null }> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) return { projects: [], error: error.message };
  return { projects: (data ?? []) as Project[], error: null };
}
