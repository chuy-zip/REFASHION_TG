import type { Size } from "@/lib/generation/dimensions";

/**
 * What the app asks for when it wants an image edited, said without naming a
 * provider.
 *
 * This shape is the whole point of the folder. Two facts made it worth the
 * indirection before a single real call exists:
 *
 *   - Runware and fal.ai spell the same operation differently (`seedImage` /
 *     `image_url`, `maskImage` / `mask_url`, `ipAdapters` / `ip_adapters`).
 *     Whichever wins, the screens must not learn its vocabulary.
 *   - Every call costs money, so the whole interface has to be buildable
 *     against a provider that costs nothing. That is `mock`, and it is the one
 *     running today.
 *
 * No component imports a provider. They ask `/api/generate/inpainting`, which
 * asks this.
 */

/** What kind of edit the user asked for. Decides the prompt, not the plumbing. */
/**
 * What kind of edit the user asked for. Decides the suggestions, not the
 * plumbing.
 *
 * **`color` was removed, and the reason is measured.** It existed as the
 * generative arm of the `FASE_2_INPAINTING` §2.3 comparison, to test whether a
 * model honours an exact colour code. It does not: the best of five paid
 * attempts reached 38% of the requested change, and the manufacturer's own
 * showcase example for that model fails the same way. Keeping a path the
 * project has measured to not work would be offering a user a worse version of
 * the exact recolour sitting one panel above it.
 *
 * `shape` and `texture` stay. Neither has been measured — but neither has been
 * disproven, and they ask for the kind of edit this model class is built for.
 *
 * `clean` is new and is the one with evidence behind it: removing an element
 * and leaving continuous fabric came back with zero artefacts and a texture
 * matching the surrounding cloth to within 2%.
 */
export type InpaintIntent = "clean" | "shape" | "texture";

export interface InpaintRequest {
  /** Public URL of the clean garment. Presigned R2 URLs qualify. */
  imageUrl: string;
  /** Public URL of the mask. White = edit, black = keep. Same size as the image. */
  maskUrl: string;
  /** Already snapped (`snapToInferenceSize`); providers reject anything else. */
  size: Size;
  prompt: string;
  intent: InpaintIntent;
  /**
   * There is deliberately no `strength` here, and the note is worth keeping
   * because the field existed and was wrong.
   *
   * It was documented as the knob that separates "adjust this tone" from "put a
   * collar here", and as the reason FLUX Fill [dev] was picked over [pro]. Both
   * claims turned out to be false. The model's own documentation says Fill
   * *"does not use the strength parameter"*, and this project's billing data
   * agrees in a more telling way: a request at 0.45 cost 46% of one at 0.85,
   * which is what happens when the value is quietly multiplied into the step
   * count. So it changed the compute, not the edit.
   *
   * Steps stay at the value every measured run used. If a reason to expose them
   * ever appears, the field to add is `steps`, named after what it does.
   */
  /**
   * Which noise the diffusion starts from, and therefore whether this request
   * can ever be run again with the same answer.
   *
   * **Required, not optional.** It used to be optional and nothing ever set it,
   * which meant every generation was unrepeatable — a client who approves a
   * design and comes back later would get a near miss, and no experiment could
   * attribute a difference to the thing it changed. The server now always picks
   * one (`lib/generation/seed.ts`) and hands it back in the result.
   */
  seed: number;
}

export interface GenerationResult {
  /** The generated image, ready to be stored like any other design asset. */
  image: Blob;
  /**
   * USD actually spent, as the provider reported it — never estimated here.
   * Goes straight to `assets.cost_usd`, which is what makes H-18 and H-37
   * possible ("¿cuánto se gastó en este diseño?").
   *
   * **Null when the provider did not say**, which is not the same as free. A
   * zero in that case would add itself to the running total of the design as if
   * the generation had cost nothing, and a total that is quietly wrong is worse
   * than one with a visible gap. The column has always been nullable; this type
   * used to be the one place that pretended otherwise.
   */
  costUsd: number | null;
  /** The provider's own id for the task, stored in `assets.runware_task_id`. */
  taskId: string;
  /**
   * The model that produced this, as its provider spells it (`runware:102@1`).
   *
   * Reported by the provider rather than assumed by the caller, for the same
   * reason `costUsd` is: the caller knows what it asked for, not what answered.
   * There is more than one model in play now — FLUX Fill on a mask and FLUX
   * Kontext by instruction — so a row that does not say which one made it
   * cannot be compared against another or defended in the report.
   */
  model: string;
  /**
   * Denoising iterations actually run, or **null when the model does not have
   * the concept**.
   *
   * A constant inside each provider for the two diffusion paths. Stored anyway,
   * because a constant that changes leaves every earlier row without an
   * explanation.
   *
   * **Null and never zero.** The try-on model declares no step count, and zero
   * would be a different claim: "it ran no iterations" instead of "it does not
   * work that way". The database agrees and says so out loud —
   * `assets_generation_steps_positive` from migration 018 accepts null or a
   * positive number, and rejected the zero this field used to carry.
   */
  steps: number | null;
  /**
   * The seed this result actually came from.
   *
   * Echoed back rather than assumed from the request, because a provider is
   * free to substitute one, and a seed nobody can verify is worth nothing.
   *
   * Persisted since migration 018 in `assets.generation_seed`, which is what
   * makes a result reproducible months later.
   */
  seed: number;
  /** Wall clock, for deciding whether this can stay synchronous. */
  latencyMs: number;
}

/**
 * Failure is a value, not an exception — same discriminated shape as
 * `lib/api-client.ts`, so callers branch instead of catching.
 */
export type GenerationOutcome =
  | { ok: true; data: GenerationResult }
  | { ok: false; error: string };

/**
 * An edit asked for in words, with no mask at all.
 *
 * **The absence of `maskUrl` is the whole difference**, and it is not a
 * convenience: the two paths answer different questions. An inpainting is told
 * *where* and asked *what goes there*; this one is told *what to change* and
 * decides where by itself. That is why the text reads as an order ("make the
 * sleeves long") and not as a description of a region.
 *
 * It exists because the measurements said the mask path cannot do everything.
 * Turning a short sleeve into a long one failed with a mask, on a mask that was
 * verified correct, and succeeded by instruction on the same photograph
 * (`herramientas/docs/EXPERIMENTO_3_quitar_y_agregar.md`).
 */
export interface EditRequest {
  /** Public URL of the image to edit. Presigned R2 URLs qualify. */
  imageUrl: string;
  /**
   * Already snapped, and **not with `snapToInferenceSize`**. This model accepts
   * only a fixed list of sizes, not every multiple of 64, so the caller uses
   * `snapToKontextSize`. Sending anything else is rejected before any work
   * happens, which costs a round trip but no money.
   */
  size: Size;
  /** What to change, in the user's own words. */
  instruction: string;
  /** Same contract as `InpaintRequest.seed`: always set, never optional. */
  seed: number;
}

/**
 * A virtual try-on: a person, a garment, and nothing else.
 *
 * **There is no `size` here, and that absence is the model's.** Fill takes a
 * canvas of multiples of 64, Kontext takes one of a closed list, and this one
 * takes none at all: the output follows the person photo, because
 * `preserveInputSize` is on by default and that is the behaviour the product
 * wants. Inventing a size to send would be inventing a parameter.
 *
 * **And there is no prompt.** The chosen model's schema describes
 * `positivePrompt` as *"experimental guidance for non-flatlay garment images"*,
 * so it exists to disambiguate a reference showing several garments. Ours are
 * single flat-lays, so sending one would be adding an untested variable to the
 * one path that was measured without it
 * (`herramientas/docs/EXPERIMENTO_4_vton.md`).
 */
export interface TryOnRequest {
  /** Public URL of the person. The output follows this image's size. */
  personUrl: string;
  /** Public URL of the garment: the composition, or the clean garment. */
  garmentUrl: string;
  /** Same contract as everywhere else: always set, never optional. */
  seed: number;
}

export interface GenerationProvider {
  /** Shown in logs and in dev, so it is obvious which one answered. */
  readonly name: string;
  /** True when calls cost real money. The UI warns differently. */
  readonly billable: boolean;
  /** Edit inside a painted region. */
  inpaint(request: InpaintRequest): Promise<GenerationOutcome>;
  /** Edit by instruction, no region. */
  edit(request: EditRequest): Promise<GenerationOutcome>;
  /** Put the garment on a person. */
  tryOn(request: TryOnRequest): Promise<GenerationOutcome>;
}
