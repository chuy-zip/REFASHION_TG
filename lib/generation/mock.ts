import "server-only";
import { renderMockResult } from "@/lib/generation/mock-image";
import { MODEL_COST_USD, TRY_ON_COST_USD } from "@/lib/generation/pricing";
import type {
  EditRequest,
  GenerationOutcome,
  GenerationProvider,
  InpaintRequest,
  ModelRequest,
  TryOnRequest,
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

/**
 * How much dearer the instruction path is than the mask path.
 *
 * Measured: $0.0130 against $0.0038 on the same image. Kept here so the
 * running total of a simulated design has the same shape as a real one.
 */
const EDIT_COST_FACTOR = 3.4;

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

/**
 * What the simulator claims answered an instruction edit.
 *
 * A second name and not the same one, because the strip and the report both
 * group by `generation_model`: if both paths claimed the same id, a simulated
 * session would be indistinguishable in the database from one where every
 * edit went through the mask.
 */
const MOCK_EDIT_MODEL = "mock:flux-kontext";

/** Same reasoning as the other two: the database has to say which path ran. */
const MOCK_TRY_ON_MODEL = "mock:p-image-try-on";

/** The canvas the simulator invents for a try-on, since none is requested. */
const TRY_ON_SIZE = { width: 832, height: 1248 } as const;

/** What a generated model claims to be, and the canvas it uses. */
const MOCK_MODEL_MODEL = "mock:flux-dev";
const MODEL_SIZE = { width: 832, height: 1216 } as const;

/** The value every measured run used. See `EXPERIMENTO_3_*` in herramientas. */
const STEPS = 28;

/**
 * Lo que el simulador hace en lugar de devolver bytes: escribir en el destino.
 *
 * **Tiene que subir de verdad**, porque si no las rutas se comportarían distinto
 * con y sin llave, y entonces probar con el simulador dejaría de probar nada.
 * Sube de forma **síncrona**, a diferencia del proveedor real: el reintento de
 * `store.ts` encuentra el objeto en el primer intento y sigue de largo.
 *
 * Devuelve la imagen como data URI para que el camino de respaldo también sea
 * recorrible en desarrollo. `fetch` acepta `data:` desde Node 18.
 */
async function entregar(blob: Blob, uploadTo: string): Promise<string> {
  await fetch(uploadTo, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: blob,
  });

  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  return `data:image/png;base64,${base64}`;
}

function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export const mockProvider: GenerationProvider = {
  name: "mock",
  /**
   * PNG, y se queda así.
   *
   * Arma la imagen byte a byte con un codificador propio (`mock-image.ts`), y
   * escribir uno de WEBP para un simulador no tiene ningún sentido. Que los dos
   * formatos convivan es además una prueba viva: si el medidor de tamaños se
   * rompiera para PNG, el simulador lo delataría sin gastar un centavo.
   */
  format: { mime: "image/png", extension: "png" },
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
        imageUrl: await entregar(
          renderMockResult(request.size.width, request.size.height, request.prompt),
          request.uploadTo
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

  /**
   * The maskless path, simulated with the same three hazards.
   *
   * It costs more than the mask path here because it costs more in reality:
   * Kontext was measured at about 3.4 times FLUX Fill. A simulator that made
   * the expensive path look cheap would teach the wrong habit during exactly
   * the sessions where the habit forms.
   */
  async edit(request: EditRequest): Promise<GenerationOutcome> {
    const started = Date.now();

    await new Promise((resolve) =>
      setTimeout(resolve, between(LATENCY_MS.min, LATENCY_MS.max))
    );

    if (Math.random() < FAILURE_RATE) {
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
        imageUrl: await entregar(
          renderMockResult(
            request.size.width,
            request.size.height,
            request.instruction
          ),
          request.uploadTo
        ),
        costUsd:
          Math.round(
            megapixels * COST_PER_MEGAPIXEL_USD * EDIT_COST_FACTOR * 1_000_000
          ) / 1_000_000,
        taskId: crypto.randomUUID(),
        seed: request.seed,
        model: MOCK_EDIT_MODEL,
        steps: STEPS,
        latencyMs: Date.now() - started,
      },
    };
  },

  /**
   * The try-on, simulated at its real flat price.
   *
   * It invents a portrait canvas because the request carries no size: the real
   * model follows the person photo, and this one has no photo to follow.
   */
  async tryOn(request: TryOnRequest): Promise<GenerationOutcome> {
    const started = Date.now();

    await new Promise((resolve) =>
      setTimeout(resolve, between(LATENCY_MS.min, LATENCY_MS.max))
    );

    if (Math.random() < FAILURE_RATE) {
      return {
        ok: false,
        error:
          "El servicio de generación no respondió. No se te cobró; puedes intentar de nuevo.",
      };
    }

    return {
      ok: true,
      data: {
        imageUrl: await entregar(
          renderMockResult(TRY_ON_SIZE.width, TRY_ON_SIZE.height, "prueba virtual"),
          request.uploadTo
        ),
        costUsd: TRY_ON_COST_USD,
        taskId: crypto.randomUUID(),
        seed: request.seed,
        model: MOCK_TRY_ON_MODEL,
        // Null, like the real one: this model declares no step count, and a
        // borrowed constant here would be a number nobody could defend.
        steps: null,
        latencyMs: Date.now() - started,
      },
    };
  },

  /** A person, simulated at the price the real one was measured to charge. */
  async generateModel(request: ModelRequest): Promise<GenerationOutcome> {
    const started = Date.now();

    await new Promise((resolve) =>
      setTimeout(resolve, between(LATENCY_MS.min, LATENCY_MS.max))
    );

    if (Math.random() < FAILURE_RATE) {
      return {
        ok: false,
        error:
          "El servicio de generación no respondió. No se te cobró; puedes intentar de nuevo.",
      };
    }

    return {
      ok: true,
      data: {
        imageUrl: await entregar(
          renderMockResult(MODEL_SIZE.width, MODEL_SIZE.height, request.description),
          request.uploadTo
        ),
        costUsd: MODEL_COST_USD,
        taskId: crypto.randomUUID(),
        seed: request.seed,
        model: MOCK_MODEL_MODEL,
        steps: STEPS,
        latencyMs: Date.now() - started,
      },
    };
  },
};
