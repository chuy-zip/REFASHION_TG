import type { InpaintIntent } from "@/lib/generation/types";

/**
 * What actually gets sent to the model, and who wrote which part of it.
 *
 * A file of its own, and not a template buried in the route, for two reasons.
 *
 * The practical one: prompt wording is the single biggest lever on the quality
 * of an inpainting, and tuning it means changing it often. Scattered across
 * call sites it drifts, and nobody can answer "what did we actually ask for?"
 *
 * The academic one: this project has to be able to **report** its method. "The
 * user typed a description" is not a method; the exact text, and which half of
 * it the system contributed, is. Anyone reading the report can reproduce a
 * result only if this is written down somewhere legible.
 *
 * **The user's words are never rewritten.** They are placed inside a frame that
 * says what the finished zone is made of. That distinction matters: a system
 * that silently edits what someone asked for makes a bad result impossible to
 * diagnose — neither the user nor the developer knows whether the model or the
 * rewrite is at fault.
 */

/**
 * Two rules, both measured, that every frame below obeys.
 *
 * **1. Never enumerate what you do not want.** The frames used to end in "No
 * cambies el resto de la prenda ni el fondo", a pattern copied from Runware's
 * own documented example. It backfires: FLUX Fill has **no negative channel**
 * (sending `negativePrompt` produced a byte-for-byte identical image, so it is
 * ignored), which means those words land in the *positive* conditioning and
 * work as magnets. An ablation with a fixed seed measured it — the same edit
 * with the list of negatives left **542 stray pixels, and without it left zero**
 * — and the artefact it left was a small embroidered badge, after a prompt that
 * had asked for no badge.
 *
 * **2. Describe the masked zone, not the picture.** The model already sees what
 * surrounds the hole. Mentioning the background or the rest of the garment
 * describes something it must not paint, and the instruction competes with what
 * its own eyes tell it.
 *
 * Both in `herramientas/docs/EXPERIMENTO_3_quitar_y_agregar.md`.
 */
const TEJIDO =
  "en el mismo tejido, color e iluminación que el resto de la prenda, con los pliegues y las sombras propios de esa tela";

/**
 * Prompts are in Spanish because the interface is, and the user's words go in
 * verbatim.
 *
 * **This is now a known-suboptimal choice and the decision is open.** The first
 * experiment compared the same request in both languages with one variable
 * changed, and English won: Spanish scored −0.8 and English +7.0 on the metric
 * of the day. What that experiment measured was the *colour* task, which was
 * later abandoned for other reasons, so the result does not transfer to shape
 * and texture without measuring again.
 *
 * Translating behind the user's back is exactly the silent rewrite this file
 * exists to avoid, so the honest options are to leave it, or to ask in English
 * in the interface and say so. Not decided yet, deliberately.
 *
 * It does not block the first job either way: removing an element from the
 * garment carries **no user text at all**, so that prompt is system-written and
 * can be in English without anyone reading Spanish seeing a difference.
 */
const FRAME: Record<InpaintIntent, (description: string) => string> = {
  // Offered alongside the deterministic recolour (`lib/recolor.ts`), not
  // instead of it: this is the arm of the `FASE_2_INPAINTING` §2.3 comparison
  // that a model answers. The description reaching here is usually a hex,
  // because measuring whether the model honours the exact code is the point.
  //
  // Measured outcome, so nobody re-runs it hoping: the model does not honour it.
  // The best of five paid attempts reached 38% of the requested colour change,
  // and the manufacturer's own showcase example fails the same way.
  color: (description) =>
    `Esta zona de la prenda en ${description}, conservando los pliegues, las sombras y la textura del tejido.`,

  shape: (description) => `Esta zona de la prenda como ${description}, ${TEJIDO}.`,

  texture: (description) =>
    `Esta zona de la prenda en ${description}, conservando la forma, los pliegues y la iluminación que ya tiene.`,
};

/** The text the model receives, from what the user asked for. */
export function composePrompt(
  intent: InpaintIntent,
  description: string
): string {
  return FRAME[intent](description.trim());
}

/**
 * What the user is invited to type, per intent.
 *
 * Examples and not instructions: a placeholder showing a real answer teaches
 * the shape of a good one far faster than a sentence explaining it.
 */
export const PROMPT_PLACEHOLDER: Record<InpaintIntent, string> = {
  color: "#1E2A5A o azul marino…",
  shape: "un cuello tipo polo con dos botones…",
  texture: "tela de rayas finas azul marino y blanco…",
};
