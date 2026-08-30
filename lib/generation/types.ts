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
export type InpaintIntent = "color" | "shape" | "texture";

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
   * 0..1. Low values nudge, high values replace. It is the parameter that
   * separates "adjust this tone" from "put a collar here", and the reason
   * FLUX Fill [dev] was chosen over [pro] — [pro] does not expose it.
   */
  strength: number;
  /** Repeats a previous result exactly. Absent means a new one each time. */
  seed?: number;
}

export interface InpaintResult {
  /** The generated image, ready to be stored like any other design asset. */
  image: Blob;
  /**
   * USD actually spent, as the provider reported it — never estimated here.
   * Goes straight to `assets.cost_usd`, which is what makes H-18 and H-37
   * possible ("¿cuánto se gastó en este diseño?").
   */
  costUsd: number;
  /** The provider's own id for the task, stored in `assets.runware_task_id`. */
  taskId: string;
  /** Wall clock, for deciding whether this can stay synchronous. */
  latencyMs: number;
}

/**
 * Failure is a value, not an exception — same discriminated shape as
 * `lib/api-client.ts`, so callers branch instead of catching.
 */
export type GenerationOutcome =
  | { ok: true; data: InpaintResult }
  | { ok: false; error: string };

export interface GenerationProvider {
  /** Shown in logs and in dev, so it is obvious which one answered. */
  readonly name: string;
  /** True when calls cost real money. The UI warns differently. */
  readonly billable: boolean;
  inpaint(request: InpaintRequest): Promise<GenerationOutcome>;
}
