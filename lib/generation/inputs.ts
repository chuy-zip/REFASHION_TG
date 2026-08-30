import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { snapToInferenceSize, type Size } from "@/lib/generation/dimensions";
import type { Asset } from "@/lib/types";

/**
 * Which images a generation is allowed to read, and how big they are.
 *
 * This is a **security rule**, so it lives in `lib/` and not inside the route
 * handler: a rule written in a handler only protects that handler, and there
 * will be a second generation route (VTON) that needs the same one.
 *
 * The rule itself is the seventh application of the same lesson: **foreign keys
 * are verified below RLS** (APRENDIZAJES §2.5b). RLS will happily let an editor
 * of client A insert a row that *references* an asset of client B, because the
 * policy looks at the row being written, not at what it points to. So every
 * asset id that arrives from the browser gets resolved and checked here.
 */

export interface GenerationInputs {
  image: Asset;
  mask: Asset;
  /** Snapped to the inference grid; both images are sent at this size. */
  size: Size;
}

export type GenerationInputsResult =
  | { ok: true; inputs: GenerationInputs }
  | { ok: false; error: string; status: number };

/**
 * Resolves the working image and the mask, refusing anything that does not
 * belong to this design.
 *
 * Both must be **design-level** assets of this exact design. That is stricter
 * than "belongs to the client" on purpose: a mask is meaningless outside the
 * image it was painted on, and letting one design consume another's mask would
 * produce a plausible-looking result from the wrong geometry.
 */
export async function resolveGenerationInputs(
  supabase: SupabaseClient,
  designId: string,
  imageAssetId: string,
  maskAssetId: string
): Promise<GenerationInputsResult> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .in("id", [imageAssetId, maskAssetId]);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[generation] resolveGenerationInputs:", error.message);
    }
    return {
      ok: false,
      error: "No se pudieron leer las imágenes de la generación.",
      status: 500,
    };
  }

  const assets = (data ?? []) as Asset[];
  const image = assets.find((asset) => asset.id === imageAssetId);
  const mask = assets.find((asset) => asset.id === maskAssetId);

  // RLS already hid anything the caller cannot see, so "not found" and "not
  // yours" arrive identically here — which is the correct answer to give back
  // too, since distinguishing them would confirm that an id exists.
  if (!image || !mask) {
    return { ok: false, error: "La imagen o la máscara no existen.", status: 404 };
  }

  if (image.design_id !== designId || mask.design_id !== designId) {
    return {
      ok: false,
      error: "La imagen o la máscara no pertenecen a este diseño.",
      status: 403,
    };
  }

  if (mask.asset_type !== "mask") {
    return { ok: false, error: "La máscara no es una máscara.", status: 400 };
  }

  // Migration 016 made these columns exist; rows created before it are null,
  // and a generation cannot be built without them. Saying so plainly beats
  // silently downloading the object to measure it on the hot path of a paid
  // call — which is exactly what the migration exists to avoid.
  if (!image.width_px || !image.height_px) {
    return {
      ok: false,
      error:
        "No se conocen las dimensiones de esta imagen. Vuelve a subirla para poder editarla con IA.",
      status: 409,
    };
  }

  return {
    ok: true,
    inputs: {
      image,
      mask,
      size: snapToInferenceSize({
        width: image.width_px,
        height: image.height_px,
      }),
    },
  };
}
