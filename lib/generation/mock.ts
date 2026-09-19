import "server-only";
import { renderMockResult } from "@/lib/generation/mock-image";
import type {
  GenerationOutcome,
  GenerationProvider,
  InpaintRequest,
} from "@/lib/generation/types";

/**
 * The provider that costs nothing.
 *
 * It exists so the whole Módulo 2 — painting a mask, snapping the size,
 * building the request, storing the result, moving the cursor along the strip —
 * can be built and used before a single paid call. That order matters here more
 * than in most projects: every real generation is money out of a student's
 * account, and the interface is what needs the iterations, not the model.
 *
 * **It simulates the three things the UI has to survive, not just success.**
 * A mock that always returns instantly and always works produces an interface
 * with no loading state, no cost display and nowhere to put an error — and the
 * day the real provider answers, all three are missing at once.
 *
 *   - **Latency**: a real inpainting takes 5–20 s. If the screen does not feel
 *     that now, it will not be designed for it.
 *   - **Cost**: a plausible number lands in `assets.cost_usd`, so the running
 *     total in the strip has something to add up.
 *   - **Failure**: one call in `FAILURE_RATE` fails, so the error path is
 *     exercised by accident rather than by remembering to test it.
 */

/** Slow enough to need a real loading state, fast enough to iterate. */
const LATENCY_MS = { min: 2200, max: 5200 } as const;

/**
 * Roughly what FLUX.1 Fill [dev] costs at ~1 MP: it is serverless, so the real
 * number varies with resolution and steps. Only the shape matters here — the
 * real one arrives with `includeCost` and is never estimated by us.
 */
const COST_PER_MEGAPIXEL_USD = 0.011;

/** One in twelve. Often enough to meet it while building, rare enough to work. */
const FAILURE_RATE = 1 / 12;

/**
 * What the simulator claims it ran with.
 *
 * Named after the real thing rather than left blank: everything downstream —
 * the strip, the lineage, the columns added in migration 018 — has to behave
 * exactly as it will with a real provider, and a null model id would exercise a
 * path that the real one never takes. `mock:` makes it unmistakable in the
 * database that no model was involved.
 */
const MOCK_MODEL = "mock:flux-fill";

/** The value every measured run used. See `EXPERIMENTO_3_*` in herramientas. */
const STEPS = 28;

function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export const mockProvider: GenerationProvider = {
  name: "mock",
  billable: false,

  async inpaint(request: InpaintRequest): Promise<GenerationOutcome> {
    const started = Date.now();

    await new Promise((resolve) =>
      setTimeout(resolve, between(LATENCY_MS.min, LATENCY_MS.max))
    );

    if (Math.random() < FAILURE_RATE) {
      // Worded like a real provider failure: transient, retryable, and it says
      // what to do. A failed generation is never charged, and saying so is what
      // stops the user wondering whether it was.
      return {
        ok: false,
        error:
          "El servicio de generación no respondió. No se te cobró; puedes intentar de nuevo.",
      };
    }

    const megapixels = (request.size.width * request.size.height) / 1_000_000;

    return {
      ok: true,
      data: {
        image: renderMockResult(
          request.size.width,
          request.size.height,
          request.prompt
        ),
        // Rounded to six decimals to match `assets.cost_usd`'s numeric(10,6):
        // a value the column cannot hold would round on the way in and stop
        // matching what the UI showed.
        costUsd:
          Math.round(megapixels * COST_PER_MEGAPIXEL_USD * 1_000_000) / 1_000_000,
        taskId: crypto.randomUUID(),
        // Echoed unchanged. A real provider may substitute one; this one never
        // does, and saying so here is cheaper than a caller guessing.
        seed: request.seed,
        model: MOCK_MODEL,
        steps: STEPS,
        latencyMs: Date.now() - started,
      },
    };
  },
};
