import type { InpaintIntent } from "@/lib/generation/types";

/**
 * What gets sent to the model, and where the user can see it.
 *
 * **This file used to wrap what the user typed inside a hidden frame.** Twelve
 * words went in and thirty-five came out, and the extra twenty-three were
 * invisible: nobody could read what had actually been asked, which made a bad
 * result impossible to diagnose. Was it the model, the user's words, or the
 * frame nobody could see?
 *
 * Now there is no frame. **What the user reads in the box is exactly what
 * leaves.** The wording that a frame used to impose is offered instead as
 * suggestions they can insert and then edit, which keeps the quality without
 * keeping the secret.
 *
 * The academic reason is the same one that put this in its own file: a report
 * has to be able to say what was asked for. "The user typed a description" is
 * not a method. A text anyone can read on screen, and reproduce, is.
 */

/**
 * Both languages, offered rather than chosen.
 *
 * The first experiment measured English beating Spanish on the same request
 * with one variable changed (−0.8 against +7.0). That was the colour task,
 * which was later abandoned for unrelated reasons, so the result does not
 * transfer to the others without measuring again.
 *
 * Rather than guess, both are on the table: the user picks, and the choice
 * becomes something that can be compared instead of a default nobody sees.
 */
export type PromptLanguage = "es" | "en";

export const PROMPT_LANGUAGE_COPY: Record<PromptLanguage, string> = {
  es: "Español",
  en: "Inglés",
};

/**
 * The wording that was measured to work, as a template anyone can start from.
 *
 * **Every one of these names the same ten properties**, and that is the part
 * worth copying rather than the words. The prompt that came back with zero
 * artefacts and a texture matching the surrounding cloth to within 2% named:
 * material, finish, weave, thread direction, folds, shading, tone, thread
 * scale, ambient lighting, edge sharpness and depth of field. The frame this
 * file used to apply named five of them
 * (`herramientas/docs/EXPERIMENTO_3_quitar_y_agregar.md`).
 *
 * **And none of them enumerates what it does not want.** That is not a style
 * preference: this model has no negative channel — sending `negativePrompt`
 * produced a byte-for-byte identical image — so words like "sin logotipo" land
 * in the positive conditioning and act as magnets. Measured: the same edit with
 * a list of negatives left 542 stray pixels, and without it left zero, and the
 * artefact it left was a small embroidered badge after a prompt asking for no
 * badge.
 *
 * **They describe the masked zone and nothing else.** The model already sees
 * what surrounds the hole; mentioning the background or the rest of the garment
 * describes something it must not paint.
 */
export const PROMPT_SUGGESTIONS: Record<
  InpaintIntent,
  Record<PromptLanguage, string[]>
> = {
  clean: {
    es: [
      "Tela de punto negra lisa, una extensión continua de tejido sin interrupciones. Trama fina y pareja con una dirección constante, pliegues suaves y sombreado gradual, que concuerden con el tono, el acabado mate, la escala del hilo, la luz de ambiente, la nitidez del borde y la profundidad de campo de la tela que la rodea.",
      "Tela de algodón blanca lisa, una superficie continua sin marcas. Tejido fino y uniforme, pliegues naturales y un sombreado que sigue la caída de la prenda, con el mismo acabado mate, la misma escala de hilo y la misma iluminación que el resto de la tela.",
    ],
    en: [
      "Plain black knit fabric, a smooth uninterrupted expanse of cloth. Fine even weave with a consistent thread direction, soft natural folds and gradual shading, matching the tone, matte finish, thread scale, ambient lighting, edge sharpness and depth of field of the surrounding cloth.",
      "Plain white cotton fabric, a continuous unmarked surface. Fine uniform weave, natural folds and shading that follows the drape of the garment, with the same matte finish, thread scale and lighting as the rest of the cloth.",
    ],
  },
  shape: {
    es: [
      "Un cuello tipo polo con dos botones, en la misma tela de punto que el resto de la prenda. Trama fina con la misma dirección, borde acanalado limpio, pliegues suaves donde la tela cae, y el mismo tono, acabado mate, escala del hilo, luz de ambiente y nitidez de borde que la tela que lo rodea.",
      "Una manga larga de la misma tela, que baja por el brazo hasta la muñeca y termina en un puño acanalado. Cae con volumen propio, separada del brazo, con pliegues naturales que se juntan en el codo y el mismo tono, trama e iluminación que el hombro.",
    ],
    en: [
      "A polo collar with two buttons, in the same knit fabric as the rest of the garment. Fine weave running in the same direction, a clean ribbed edge, soft folds where the cloth falls, and the same tone, matte finish, thread scale, ambient lighting and edge sharpness as the cloth around it.",
      "A long sleeve of the same fabric, continuing down the arm to the wrist and ending in a ribbed cuff. Hanging with realistic volume away from the arm, with natural folds gathering at the elbow and the same tone, weave and lighting as the shoulder.",
    ],
  },
  texture: {
    es: [
      "Tela de rayas finas verticales azul marino y blanco, de algodón. Las rayas siguen la caída de la prenda y se curvan con los pliegues, con trama fina, acabado mate, y el mismo sombreado, luz de ambiente y nitidez de borde que la tela que la rodea.",
      "Tela de punto piqué, con su relieve menudo y regular visible de cerca. Trama de dirección constante, pliegues suaves y sombreado gradual, conservando el tono, la escala del hilo y la iluminación de la prenda.",
    ],
    en: [
      "Fine vertical navy and white striped cotton fabric. The stripes follow the drape of the garment and curve with the folds, with a fine weave, a matte finish, and the same shading, ambient lighting and edge sharpness as the cloth around it.",
      "Pique knit fabric, its small regular texture visible up close. Weave running in a consistent direction, soft folds and gradual shading, keeping the tone, thread scale and lighting of the garment.",
    ],
  },
};

/**
 * What the model receives.
 *
 * Deliberately the user's own text, untouched beyond trimming. It stays a
 * function, and the route still calls it, because "what was actually sent" has
 * to have exactly one answer and one place that decides it — if that ever stops
 * being the identity, this is where it will be visible.
 */
export function composePrompt(
  _intent: InpaintIntent,
  description: string
): string {
  return description.trim();
}

/**
 * What the user is invited to type, per intent.
 *
 * Short on purpose now that full examples live one button away: a placeholder
 * teaches the shape of an answer, and the suggestions teach its depth.
 */
export const PROMPT_PLACEHOLDER: Record<InpaintIntent, string> = {
  clean: "tela negra lisa, sin marcas…",
  shape: "un cuello tipo polo con dos botones…",
  texture: "tela de rayas finas azul marino y blanco…",
};

/** What each intent is for, shown beside its suggestions. */
export const INTENT_COPY: Record<
  InpaintIntent,
  { label: string; hint: string }
> = {
  clean: {
    label: "Limpiar",
    hint: "Quitar algo de la prenda y dejar tela continua en su lugar. Es lo que mejor funciona.",
  },
  shape: {
    label: "Forma",
    hint: "Cambiar un detalle de confección: un cuello, una manga, un bolsillo.",
  },
  texture: {
    label: "Textura",
    hint: "Cambiar el tejido conservando el corte y los pliegues.",
  },
};
