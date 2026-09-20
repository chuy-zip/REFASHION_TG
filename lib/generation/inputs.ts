import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  snapToInferenceSize,
  snapToKontextSize,
  type Size,
} from "@/lib/generation/dimensions";
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
 * belong here.
 *
 * **The two are not held to the same rule, and that was the bug.** The first
 * version asked both to be design-level assets of this exact design, reasoning
 * that it was stricter than "belongs to the client". Stricter is right for the
 * mask — a mask is meaningless outside the image it was painted on, and letting
 * one design consume another's would produce a plausible-looking result from
 * the wrong geometry. It is **wrong for the image**: a design that has not
 * edited anything yet is working on the client's catalogue garment, whose
 * `design_id` is null. `null !== designId`, so every untouched design got a 403
 * — which is every new design.
 *
 * So the image has two legal homes and the mask has one:
 *
 *   - **image**: a design-level asset of this design, **or** a catalogue asset
 *     of the client that owns this design;
 *   - **mask**: a design-level asset of this design, always.
 *
 * The "or the client's catalogue" half is still a membership check, not a
 * loosening: `clientId` comes from resolving the design server-side, never from
 * the browser.
 */
export async function resolveGenerationInputs(
  supabase: SupabaseClient,
  designId: string,
  clientId: string,
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

  // La máscara, siempre de este diseño.
  if (mask.design_id !== designId) {
    return {
      ok: false,
      error: "La máscara no pertenece a este diseño.",
      status: 403,
    };
  }

  // La imagen: de este diseño, o del catálogo del cliente dueño del diseño.
  const imagenEsDelDiseno = image.design_id === designId;
  const imagenEsDelCatalogo =
    image.design_id === null && image.client_id === clientId;

  if (!imagenEsDelDiseno && !imagenEsDelCatalogo) {
    return {
      ok: false,
      error: "La imagen no pertenece a este diseño.",
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

  // **La máscara mide como su imagen, y el servidor lo comprueba.**
  //
  // Antes la máscara se rasterizaba directamente al tamaño encajado y la imagen
  // iba a su tamaño natural, así que las dos llegaban midiendo distinto. Si el
  // proveedor estiraba la imagen al lienzo pedido, quedaban alineadas de
  // casualidad; si no, la máscara caía corrida. Nadie podía decir cuál de las
  // dos cosas pasaba, y una deformación nuestra se le habría atribuido al
  // modelo.
  //
  // Ahora coinciden por construcción, y esto es la comprobación de que así es:
  // una regla que solo vive en el navegador es una regla que el servidor no
  // tiene.
  if (
    mask.width_px !== image.width_px ||
    mask.height_px !== image.height_px
  ) {
    return {
      ok: false,
      error:
        "La máscara no mide lo mismo que la imagen. Vuelve a pintarla sobre esta prenda.",
      status: 409,
    };
  }

  return {
    ok: true,
    inputs: {
      image,
      mask,
      // El lienzo que se le pide al modelo. NO es el tamaño de las imágenes:
      // FLUX solo genera en múltiplos de 64 (`multipleOf: 64` en su esquema), y
      // 731×419 no lo es. Las dos entran a su tamaño real y el proveedor las
      // lleva a este lienzo — a las dos por igual, que es lo que garantiza la
      // alineación.
      size: snapToInferenceSize({
        width: image.width_px,
        height: image.height_px,
      }),
    },
  };
}


/**
 * The image an instruction edit is allowed to read.
 *
 * **The same ownership rule as `resolveGenerationInputs`, minus the mask**, and
 * it lives here for the reason that one does: a rule written inside a handler
 * protects that handler only, and this is the second route that needs it. It is
 * the eighth application of "foreign keys are verified below RLS"
 * (`APRENDIZAJES` §2.5b).
 *
 * The image has the same two legal homes as before: a design-level asset of
 * this design, or a catalogue asset of the client that owns it. A design that
 * has not edited anything yet is working on the client's garment, whose
 * `design_id` is null, and refusing that would refuse every new design.
 *
 * What differs is the size. This model takes **only the sizes on its own list**
 * (`snapToKontextSize`), not every multiple of 64, so the two paths must not
 * share a snapper even though they share everything else.
 */
export interface EditInput {
  image: Asset;
  /** One of `KONTEXT_SIZES`. */
  size: Size;
}

export type EditInputResult =
  | { ok: true; input: EditInput }
  | { ok: false; error: string; status: number };

export async function resolveEditInput(
  supabase: SupabaseClient,
  designId: string,
  clientId: string,
  imageAssetId: string
): Promise<EditInputResult> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("id", imageAssetId)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[generation] resolveEditInput:", error.message);
    }
    return {
      ok: false,
      error: "No se pudo leer la imagen de la generación.",
      status: 500,
    };
  }

  const image = data as Asset | null;

  // RLS already hid anything the caller cannot see, so "not found" and "not
  // yours" arrive identically here, which is also the right answer to give
  // back: telling them apart would confirm that an id exists.
  if (!image) {
    return { ok: false, error: "La imagen no existe.", status: 404 };
  }

  const esDelDiseno = image.design_id === designId;
  const esDelCatalogo = image.design_id === null && image.client_id === clientId;

  if (!esDelDiseno && !esDelCatalogo) {
    return {
      ok: false,
      error: "La imagen no pertenece a este diseño.",
      status: 403,
    };
  }

  // Migration 016 made these columns exist and left older rows null. Without
  // them there is no ratio to match against the model's list, and measuring the
  // object here would mean downloading it on the hot path of a paid call, which
  // is the thing that migration exists to avoid.
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
    input: {
      image,
      size: snapToKontextSize({
        width: image.width_px,
        height: image.height_px,
      }),
    },
  };
}
