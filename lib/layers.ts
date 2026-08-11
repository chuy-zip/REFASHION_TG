import type { SupabaseClient } from "@supabase/supabase-js";
import type { DesignLayer } from "@/lib/types";

/**
 * The logo stack of a design (migration 013).
 *
 * Geometry is stored as ratios of the working image, so a layer survives the
 * working image changing size along the pipeline. The canvas converts to and
 * from pixels; nothing outside it should deal in pixels.
 */

/** A layer paired with the signed URL of its logo, ready to draw. */
export interface LayerWithUrl extends DesignLayer {
  url: string;
  /** For alt text and the layer list. */
  name: string;
}

/** Layers of a design, bottom to top. RLS returns only what the user may see. */
export async function listDesignLayers(
  supabase: SupabaseClient,
  designId: string
): Promise<{ layers: DesignLayer[]; error: string | null }> {
  const { data, error } = await supabase
    .from("design_layers")
    .select("*")
    .eq("design_id", designId)
    .order("z_index", { ascending: true });

  if (error) return { layers: [], error: error.message };
  return { layers: (data ?? []) as DesignLayer[], error: null };
}

/**
 * Whether an asset may be placed as a layer on this design.
 *
 * Two conditions, and both matter. It has to be a `logo` — a base garment or a
 * model photo is not something you composite *onto* a garment — and it has to
 * belong to the same client, because the foreign key is verified below RLS and
 * would happily accept a logo from another client (APRENDIZAJES §2.5b).
 */
export async function assetIsUsableAsLayer(
  supabase: SupabaseClient,
  assetId: string,
  clientId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("assets")
    .select("asset_type, client_id")
    .eq("id", assetId)
    .maybeSingle();

  const asset = data as {
    asset_type: string;
    client_id: string | null;
  } | null;

  return asset?.asset_type === "logo" && asset.client_id === clientId;
}

/**
 * Copies a design's logo stack onto a new design, for iterations (v1 -> v2).
 *
 * WHY it happens at all: "me gusta el diseño, pero que la manga sea corta" means
 * everything else stays, logos included. Without the copy the new version
 * arrives with the right garment and a bare chest, the logo gets re-placed by
 * hand, and it lands a few pixels off — so comparing v1 with v2 shows something
 * moving that nobody asked to move, which is exactly what versions exist to
 * avoid.
 *
 * **A snapshot, not a link.** The rows are independent from that moment on:
 * moving a logo in v2 leaves v1 untouched. A version is a separate proposal,
 * and its value is being able to put both side by side; linked geometry would
 * rewrite the proposal the client already saw. Same criterion as
 * `parent_design_id` itself — lineage records where something came from, it
 * does not keep the two in sync.
 *
 * Nothing is copied in R2: a layer is four numbers and a reference to a logo
 * that already lives in the client's catalog.
 *
 * Returns how many layers were copied, or null if the copy failed. Callers
 * decide what to do about it; see POST /api/designs for why it does not undo
 * the design.
 */
export async function copyDesignLayers(
  supabase: SupabaseClient,
  fromDesignId: string,
  toDesignId: string
): Promise<number | null> {
  const { layers, error } = await listDesignLayers(supabase, fromDesignId);
  if (error) return null;
  if (layers.length === 0) return 0;

  const { error: insertError } = await supabase.from("design_layers").insert(
    layers.map((layer) => ({
      design_id: toDesignId,
      asset_id: layer.asset_id,
      x_ratio: layer.x_ratio,
      y_ratio: layer.y_ratio,
      width_ratio: layer.width_ratio,
      rotation_deg: layer.rotation_deg,
      z_index: layer.z_index,
    }))
  );

  return insertError ? null : layers.length;
}

/**
 * Next free z_index for a design, so a new layer lands on top of the stack
 * rather than fighting an existing one for the same position.
 */
export async function nextLayerZIndex(
  supabase: SupabaseClient,
  designId: string
): Promise<number> {
  const { data } = await supabase
    .from("design_layers")
    .select("z_index")
    .eq("design_id", designId)
    .order("z_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const top = (data as { z_index: number } | null)?.z_index;
  return top === undefined || top === null ? 0 : top + 1;
}
