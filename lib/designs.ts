import type { SupabaseClient } from "@supabase/supabase-js";
import type { Design } from "@/lib/types";

/**
 * Curated subset of garment_type for the UI. The column itself is free text
 * (no DB constraint) so future types can be added here without a migration.
 */
export type GarmentType = "shirt" | "polo" | "hoodie";

export const GARMENT_TYPE_COPY: Record<GarmentType, { label: string }> = {
  shirt: { label: "Camisa" },
  polo: { label: "Polo" },
  hoodie: { label: "Hoodie" },
};

export function garmentTypeLabel(garmentType: string): string {
  return (
    GARMENT_TYPE_COPY[garmentType as GarmentType]?.label ?? garmentType
  );
}

/** Designs of a project, newest first. RLS returns only what the user may see. */
export async function listProjectDesigns(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ designs: Design[]; error: string | null }> {
  const { data, error } = await supabase
    .from("designs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) return { designs: [], error: error.message };
  return { designs: (data ?? []) as Design[], error: null };
}
