import type { InpaintMode } from "@/lib/generation/types";

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
/**
 * Dos oficios distintos, y por eso dos largos distintos.
 *
 * **Las de `fill` nombran diez propiedades a propósito.** El prompt que volvió
 * con cero artefactos y textura al 102% de la tela vecina nombraba material,
 * acabado, trama, dirección del hilo, pliegues, sombreado, tono, escala del
 * hilo, luz de ambiente, nitidez del borde y profundidad de campo
 * (`EXPERIMENTO_3`). Ahí describir sirve, porque el modelo completa lo que ve
 * y hay que decirle con qué.
 *
 * **Las de `draw` son cortas, y eso está medido.** Entre un prompt completo de
 * 50 palabras y uno de 10, el bolsillo salió igual de bueno: menos de cinco
 * unidades de color de diferencia (`EXPERIMENTO_6`). Este modelo deriva el
 * material y la iluminación de lo que rodea a la máscara, así que describirlos
 * es repetirle lo que ya está viendo. Pedirle al usuario un párrafo sería
 * cobrarle esfuerzo por nada.
 *
 * **Y ninguna de `fill` nombra un color, a propósito.** Las celdas j y k del
 * experimento 6 eran el mismo pedido con la única diferencia de nombrar el
 * color, y el resultado se movió **cuatro unidades sobre 255**: en este modo el
 * color lo decide lo que está pintado debajo de la máscara, no el texto. Decían
 * "negra" y "blanca", y sobre una camiseta amarilla eso no era neutral: era un
 * imán tirando hacia un color que nadie pidió. Tampoco se usa un hueco tipo
 * `<color>`, porque el día que alguien no lo reemplace entra literal al prompt.
 *
 * **Y ninguna enumera lo que no quiere.** Este modelo no tiene canal negativo,
 * así que esas palabras caen en el condicionamiento positivo y actúan de imán:
 * medido, la misma edición con una lista de negativos dejó 542 píxeles de
 * artefacto y sin ella dejó cero.
 */
export const PROMPT_SUGGESTIONS: Record<
  InpaintMode,
  Record<PromptLanguage, string[]>
> = {
  fill: {
    es: [
      "Tela de punto lisa, una extensión continua de tejido sin interrupciones. Trama fina y pareja con una dirección constante, pliegues suaves y sombreado gradual, que concuerden con el tono, el acabado mate, la escala del hilo, la luz de ambiente, la nitidez del borde y la profundidad de campo de la tela que la rodea.",
      "Tela de algodón lisa, una superficie continua sin marcas. Tejido fino y uniforme, pliegues naturales y un sombreado que sigue la caída de la prenda, con el mismo acabado mate, la misma escala de hilo y la misma iluminación que el resto de la tela.",
      "Tejido de lana suave con fibras visibles de cerca, con pliegues naturales donde la tela cae sobre sí misma y la misma luz de ambiente y nitidez de borde que la tela que la rodea.",
    ],
    en: [
      "Plain knit fabric, a smooth uninterrupted expanse of cloth. Fine even weave with a consistent thread direction, soft natural folds and gradual shading, matching the tone, matte finish, thread scale, ambient lighting, edge sharpness and depth of field of the surrounding cloth.",
      "Plain cotton fabric, a continuous unmarked surface. Fine uniform weave, natural folds and shading that follows the drape of the garment, with the same matte finish, thread scale and lighting as the rest of the cloth.",
      "Soft wool knit with fibres visible up close, natural folds where the cloth drapes over itself, and the same ambient lighting and edge sharpness as the cloth around it.",
    ],
  },
  draw: {
    es: [
      "Un bolsillo de parche negro en el pecho de la camisa.",
      "Un cuello tipo mao, una banda parada alrededor del cuello.",
      "Tela de rayas finas verticales azul marino y blanco.",
    ],
    en: [
      "A black patch pocket on the chest of the shirt.",
      "A mandarin collar, a narrow upright band around the neck.",
      "Fine vertical navy and white striped cotton fabric.",
    ],
  },
};

/**
 * The instruction path's own suggestions, and they are a different craft.
 *
 * **An instruction is an order, not a description.** The mask suggestions above
 * describe what should exist inside a hole; these tell the model what to change
 * in a picture it can see in full. Mixing the two produces the classic failure
 * of this model: a beautiful rendering of something nobody asked to touch.
 *
 * **None of them lists what to preserve, and getting there took two steps.**
 *
 * They began as the measured text from `probar_kontext.py`, which named "the
 * collar, the buttons and the gold embroidered emblems on the chest" among the
 * things to keep. On that photograph those existed and it kept them. Reused on
 * a garment whose emblem had just been removed by inpainting, **the same clause
 * put a gold embroidered emblem back**: the model cannot tell "keep the emblem"
 * from "there is an emblem", both being the word `emblem` in the conditioning,
 * exactly as `no logo` was the word `logo`.
 *
 * The clause was then narrowed to things no edit could remove — the person, the
 * pose, the background, the light — and **run against a version without it. The
 * two came back materially the same**: the short order preserved the face, the
 * pose and the background on its own. So the clause is gone, because a sentence
 * that changes nothing still has to be read, and a user copying these examples
 * would learn a ritual instead of a rule.
 *
 * Which leaves one rule for both models, and it is the same one: **do not
 * enumerate.** Fill's winning prompt described only the masked zone and listed
 * nothing, neither to avoid nor to keep. This one is a plain order. Anything a
 * prompt names, a diffusion model hears as something that should be there.
 *
 * > The comparison was two calls in the app, with no fixed seed, so it is weaker
 * > than the ladder that measured Fill. It is enough to drop a clause that was
 * > never measured to help in the first place; it would not be enough to claim
 * > the clause is harmful.
 *
 * **The last one in each list is a test, not a measured text.** It asks for a
 * studio product photograph of "the garment" and describes only the picture it
 * wants, so it works on a flat photo and on one with a person wearing it, and
 * it needs no slot for the garment type. It lists nothing to keep, on purpose,
 * for the reason above; if the logos or the fabric come back changed, the
 * comparison to run is this same order with the clause added, on the same
 * photo.
 */
export const INSTRUCTION_SUGGESTIONS: Record<PromptLanguage, string[]> = {
  es: [
    "Convierte la camisa de manga corta en una de manga larga, con la misma tela continuando por los dos brazos hasta las muñecas y terminando en puño acanalado.",
    "Cambia el cuello redondo de la camiseta por un cuello tipo polo con cartera de tres botones, en la misma tela y del mismo color.",
    "Agrega un bolsillo de parche en el pecho izquierdo, de la misma tela y con costura al tono.",
    "Muestra solo la prenda de esta foto, como fotografía de producto de estudio, extendida y centrada sobre un fondo continuo gris claro y liso, con luz pareja de frente y la prenda completa a la vista.",
  ],
  en: [
    "Change the short-sleeve shirt into a long-sleeve one, with the same fabric continuing down both arms to the wrists and ending in a ribbed cuff.",
    "Change the t-shirt's crew neck into a polo collar with a three-button placket, in the same fabric and the same colour.",
    "Add a patch pocket on the left chest, in the same fabric with tonal stitching.",
    "Show only the garment from this photo, as a studio product photograph, laid flat and centered on a plain light grey seamless background, evenly lit from the front, with the whole garment in view.",
  ],
};

/**
 * Descriptions that produce a model photo this pipeline can use.
 *
 * **The long half of each one is not decoration.** The try-on measured three
 * conditions on its person photo: a plain uncluttered background, a full or
 * three-quarter view without a tight crop, and close-fitting plain clothing.
 * Every suggestion asks for exactly those, in the wording that produced them.
 *
 * **They stop at the ankles on purpose.** A frame that runs to the floor spends
 * its detail on footwear, which the garment never touches and the client never
 * looks at; cutting above it puts the same pixels into the face and the torso,
 * which are the two things a try-on is judged on.
 *
 * **The English ones are the measured ones**, and the difference is not style.
 * Paired generations, same people and same seeds, asked for a "plain light
 * grey" backdrop in both languages: the English ones came back at a border luma
 * of 172 to 193 and the Spanish ones at 76 to 104, roughly half the brightness
 * asked for, in six of six. The Spanish versions are offered because a seller
 * writing in Spanish should be able to start from something readable, and they
 * are literal translations so the difference stays attributable to the language
 * rather than to a better-written prompt (`herramientas/probar_modelos.py`).
 */
export const MODEL_SUGGESTIONS: Record<PromptLanguage, string[]> = {
  en: [
    "A man in his thirties with short dark hair and a trimmed beard. Studio photograph against a plain light grey seamless backdrop lit evenly from the front with no visible shadow behind the person. Standing upright in a frontal view, shoulders square to the camera, face fully visible and looking straight into the lens, arms relaxed at the sides. Wearing a plain close-fitting t-shirt and plain trousers in solid colours with no prints or patterns. Framed from the top of the head down to the ankles. Sharp focus, natural skin texture, photorealistic.",
    "A woman in her thirties with shoulder-length dark hair. Studio photograph against a plain light grey seamless backdrop lit evenly from the front with no visible shadow behind the person. Standing upright in a frontal view, shoulders square to the camera, face fully visible and looking straight into the lens, arms relaxed at the sides. Wearing a plain close-fitting t-shirt and plain trousers in solid colours with no prints or patterns. Framed from the top of the head down to the ankles. Sharp focus, natural skin texture, photorealistic.",
    "A man in his fifties with grey hair, glasses and a slim build. Studio photograph against a plain light grey seamless backdrop lit evenly from the front with no visible shadow behind the person. Standing upright in a frontal view, shoulders square to the camera, face fully visible and looking straight into the lens, arms relaxed at the sides. Wearing a plain close-fitting t-shirt and plain trousers in solid colours with no prints or patterns. Framed from the top of the head down to the ankles. Sharp focus, natural skin texture, photorealistic.",
  ],
  es: [
    "Un hombre de unos treinta años, con el pelo oscuro y corto y la barba recortada. Fotografía de estudio sobre un fondo continuo gris claro y liso, iluminado de frente de manera pareja y sin sombra visible detrás de la persona. De pie y erguido, en vista frontal, con los hombros paralelos a la cámara, la cara completamente visible y mirando directamente al lente, los brazos relajados a los costados. Lleva una camiseta lisa y ajustada y pantalón liso, en colores planos y sin estampados ni patrones. Encuadrado desde la coronilla hasta los tobillos. Enfoque nítido, textura de piel natural, fotorrealista.",
    "Una mujer de unos treinta años, con el pelo oscuro hasta los hombros. Fotografía de estudio sobre un fondo continuo gris claro y liso, iluminado de frente de manera pareja y sin sombra visible detrás de la persona. De pie y erguida, en vista frontal, con los hombros paralelos a la cámara, la cara completamente visible y mirando directamente al lente, los brazos relajados a los costados. Lleva una camiseta lisa y ajustada y pantalón liso, en colores planos y sin estampados ni patrones. Encuadrada desde la coronilla hasta los tobillos. Enfoque nítido, textura de piel natural, fotorrealista.",
    "Una mujer joven de unos veinte años, con el pelo largo y rizado. Fotografía de estudio sobre un fondo continuo gris claro y liso, iluminado de frente de manera pareja y sin sombra visible detrás de la persona. De pie y erguida, en vista frontal, con los hombros paralelos a la cámara, la cara completamente visible y mirando directamente al lente, los brazos relajados a los costados. Lleva una camiseta lisa y ajustada y pantalón liso, en colores planos y sin estampados ni patrones. Encuadrada desde la coronilla hasta los tobillos. Enfoque nítido, textura de piel natural, fotorrealista.",
  ],
};

/** What the user is invited to type when describing a model. */
export const MODEL_PLACEHOLDER =
  "mujer de unos treinta años, de pie, fondo gris claro…";

/** What the user is invited to type on the instruction path. */
export const INSTRUCTION_PLACEHOLDER =
  "haz las mangas largas, con puño de punto…";

/**
 * What the model receives.
 *
 * Deliberately the user's own text, untouched beyond trimming. It stays a
 * function, and the route still calls it, because "what was actually sent" has
 * to have exactly one answer and one place that decides it — if that ever stops
 * being the identity, this is where it will be visible.
 */
export function composePrompt(description: string): string {
  return description.trim();
}

/**
 * What the user is invited to type, per intent.
 *
 * Short on purpose now that full examples live one button away: a placeholder
 * teaches the shape of an answer, and the suggestions teach its depth.
 */
export const PROMPT_PLACEHOLDER: Record<InpaintMode, string> = {
  fill: "tela de punto lisa, sin marcas…",
  draw: "un bolsillo de parche negro en el pecho…",
};

/**
 * Qué hace cada modo, dicho donde se elige.
 *
 * Los nombres describen el verbo y no la intención, que es la corrección que
 * trajo el experimento 6: "Limpiar", "Forma" y "Textura" sonaban a tres cosas
 * distintas y eran el mismo pedido al mismo modelo. Estos dos son dos modelos.
 */
export const MODE_COPY: Record<InpaintMode, { label: string; hint: string }> = {
  fill: {
    label: "Completar la zona",
    hint: "Quita algo, o convierte en tela lo que pintaste. Describe el tejido, no el color: el color sale de lo que ya está ahí.",
  },
  draw: {
    label: "Dibujar algo nuevo",
    hint: "Escribe corto; la zona se agranda sola y la ves marcada en la prenda.",
  },
};