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
 * says what must not change. That distinction matters: a system that silently
 * edits what someone asked for makes a bad result impossible to diagnose —
 * neither the user nor the developer knows whether the model or the rewrite is
 * at fault.
 */

/**
 * The instruction every edit carries, whatever it is about.
 *
 * Inpainting models fill the masked region with what the prompt describes, and
 * a bare description ("cuello tipo polo") invites a *generic* collar in a
 * *generic* fabric. Naming the constraints is what keeps the result attached to
 * the garment already on screen — which is the whole point of editing by zones
 * rather than generating a new image.
 */
const KEEP = "manteniendo el mismo tejido, color e iluminación de la prenda";

/**
 * Prompts are in Spanish because the interface is, and the user's words go in
 * verbatim. FLUX handles Spanish, and translating would be exactly the silent
 * rewrite this file exists to avoid. **Worth measuring** during the first
 * experiment: if Spanish underperforms noticeably, the honest fix is to ask in
 * English and say so in the interface, not to translate behind the user's back.
 */
const FRAME: Record<InpaintIntent, (description: string) => string> = {
  // Offered alongside the deterministic recolour (`lib/recolor.ts`), not
  // instead of it: this is the arm of the `FASE_2_INPAINTING` §2.3 comparison
  // that a model answers. The description reaching here is usually a hex,
  // because measuring whether the model honours the exact code is the point.
  color: (description) =>
    `Cambia únicamente el color de esta zona de la prenda a ${description}, conservando los pliegues, las sombras y la textura del tejido.`,

  shape: (description) =>
    `Modifica esta zona de la prenda para que sea ${description}, ${KEEP}. No cambies el resto de la prenda ni el fondo.`,

  texture: (description) =>
    `Cambia el tejido de esta zona de la prenda a ${description}, conservando la forma, los pliegues y la iluminación. No cambies el corte de la prenda ni el fondo.`,
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
