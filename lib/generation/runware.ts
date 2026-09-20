import "server-only";
import type {
  GenerationOutcome,
  GenerationProvider,
  InpaintRequest,
} from "@/lib/generation/types";

/**
 * The provider that costs money: FLUX.1 Fill [dev] on Runware.
 *
 * **The payload is not designed here. It is copied from the run that was
 * measured.** Every field below is one that a paid experiment either needed or
 * proved harmless, and the fields that are missing are missing for reasons this
 * project paid to learn (`herramientas/docs/EXPERIMENTO_1..3`). Writing a
 * "reasonable" request from the API reference would have quietly undone three
 * experiments, so the reference was used to confirm the shape and the
 * experiments decided the contents.
 *
 * What is deliberately NOT sent, and why:
 *
 *   - **`negativePrompt`**: this model ignores it. Two requests differing only
 *     in that field came back byte for byte identical. Worse than useless: the
 *     words end up in the positive conditioning, so a list of things to avoid
 *     acts as a magnet. The same edit left 542 stray pixels with a list of
 *     negatives and zero without one.
 *   - **`strength`**: the model's own documentation says Fill does not use it,
 *     and Runware's billing agrees in a more telling way. A request at 0.45
 *     cost 46% of one at 0.85, which is what happens when the value is
 *     multiplied into the step count. It changed the compute, not the edit.
 *   - **`CFGScale`**: measured, and it moves something but nothing useful
 *     (+3.6 at 2 against +5.1 at 10, both far from the goal). Every run that
 *     came back with zero artefacts omitted it, so omitting it is what is
 *     reproducible.
 *   - **`maskMargin`**: it crops to the masked area plus a margin and generates
 *     there. This app already controls the canvas exactly (`dimensions.ts`) and
 *     verifies that the mask measures what the image measures
 *     (`inputs.ts`), so a second, hidden reframing would break the one
 *     guarantee that keeps the mask aligned.
 *
 * **The seed image is sent as it is.** The experiments also showed that
 * erasing the structure under the mask before sending is what removes the
 * relief ghost, but that preparation is a deliberate act of the user now: the
 * flat brush and the eyedropper do it on screen, where it can be seen before it
 * is paid for (`FASE_2_INPAINTING` §4n). Doing it again in here would edit an
 * image the user already approved.
 */

/** HTTP REST endpoint. The SDK speaks WebSocket; a route handler does not need one. */
const API_URL = "https://api.runware.ai/v1";

/** FLUX.1 Fill [dev]. The AIR id, as the provider spells it and as it is stored. */
const MODEL = "runware:102@1";

/** The value every measured run used. See `EXPERIMENTO_3_*` in herramientas. */
const STEPS = 28;

/**
 * Budgets, sized against the route's own ceiling rather than against hope.
 *
 * The route allows 60 s (`maxDuration`) and the measured generations took 10 s
 * to 20 s, so these two leave roughly a 2.5x margin and still return an error
 * the user can read instead of a platform timeout they cannot.
 */
const INFERENCE_TIMEOUT_MS = 40_000;
const DOWNLOAD_TIMEOUT_MS = 15_000;

interface RunwareImage {
  taskUUID?: string;
  imageUUID?: string;
  imageURL?: string;
  cost?: number;
  seed?: number;
}

interface RunwareResponse {
  data?: RunwareImage[];
  errors?: {
    code?: string;
    message?: string;
    parameter?: string;
    taskUUID?: string;
  }[];
}

/**
 * A failure, worded for the person who pressed the button.
 *
 * It always says whether there was a charge, because that is the first thing
 * anyone wonders and the answer is knowable: Runware does not charge a rejected
 * task. A generation that failed and a generation that failed *and cost money*
 * are different events and the user deserves to be told which one happened.
 */
function fail(message: string): GenerationOutcome {
  return { ok: false, error: message };
}

function logIssue(detail: string): void {
  if (process.env.NODE_ENV === "development") {
    console.error("[generation] runware:", detail);
  }
}

export const runwareProvider: GenerationProvider = {
  name: "runware",
  billable: true,

  async inpaint(request: InpaintRequest): Promise<GenerationOutcome> {
    // The app's own key, deliberately not the one the Python tools in
    // `herramientas/` read. See `index.ts` for why they are two names.
    const apiKey = process.env.API_KEY_RUNWARE_PROD;
    if (!apiKey) {
      // Reachable only by misconfiguration: `getGenerationProvider` refuses to
      // return this provider without a key. Checked again because a provider
      // that assumes its own preconditions is a provider that sends an
      // unauthenticated request to a paid API.
      return fail(
        "La generación con IA no está configurada en este entorno. No se te cobró."
      );
    }

    const started = Date.now();

    // One task per request. `numberResults` stays at 1 because the cost is per
    // image and the strip advances one step at a time: two results would mean
    // paying twice to throw one away.
    const task = {
      taskType: "imageInference",
      taskUUID: crypto.randomUUID(),
      model: MODEL,
      positivePrompt: request.prompt,
      seed: request.seed,
      width: request.size.width,
      height: request.size.height,
      steps: STEPS,
      numberResults: 1,
      outputFormat: "PNG",
      includeCost: true,
      // Nested, as the current schema declares them. The first experiments sent
      // these at the root and Runware accepted it, which is precisely why it is
      // worth pinning down: an accepted-but-undeclared shape is one nobody can
      // promise will keep behaving the same way.
      inputs: {
        // Presigned R2 URLs. Runware fetches them itself, so nothing is
        // uploaded twice and no image bytes pass through this function.
        seedImage: request.imageUrl,
        maskImage: request.maskUrl,
      },
    };

    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify([task]),
        signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
      });
    } catch (error) {
      logIssue(`fetch failed: ${String(error)}`);
      return fail(
        "El servicio de generación no respondió a tiempo. No se te cobró; puedes intentar de nuevo."
      );
    }

    let body: RunwareResponse;
    try {
      body = (await response.json()) as RunwareResponse;
    } catch {
      logIssue(`unparseable body, HTTP ${response.status}`);
      return fail(
        "El servicio de generación devolvió una respuesta que no se pudo leer. No se te cobró."
      );
    }

    // Errors are scoped to the task, so a non-2xx status and a populated
    // `errors` array are the same event seen from two sides. The provider's own
    // message is passed through on purpose: during validation the difference
    // between "dimensiones no soportadas" and "sin saldo" is the whole message,
    // and hiding it would mean reading server logs to learn it.
    const problem = body.errors?.[0];
    if (problem || !response.ok) {
      const detail = problem?.message ?? `HTTP ${response.status}`;
      logIssue(`task rejected: ${problem?.code ?? response.status} ${detail}`);
      return fail(
        `El servicio de generación rechazó la petición. No se te cobró. Detalle: ${detail}`
      );
    }

    const result = body.data?.[0];
    if (!result?.imageURL) {
      logIssue("response carried no imageURL");
      return fail(
        "El servicio de generación no devolvió ninguna imagen. No se te cobró."
      );
    }

    // From here on the task succeeded and was charged, so every failure below
    // has to say so: the money is gone whether or not the bytes arrive, and a
    // message claiming otherwise would be false.
    let image: Blob;
    try {
      const download = await fetch(result.imageURL, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!download.ok) throw new Error(`HTTP ${download.status}`);
      image = await download.blob();
    } catch (error) {
      logIssue(`download failed: ${String(error)}`);
      return fail(
        "La imagen se generó pero no se pudo descargar. Esta generación sí se cobró. Vuelve a intentar."
      );
    }

    return {
      ok: true,
      data: {
        image,
        // Null rather than zero when the provider stays quiet. A zero would add
        // itself to the running total of the design as if the generation had
        // been free, and a total that is quietly wrong is worse than one that
        // shows a gap.
        costUsd: typeof result.cost === "number" ? result.cost : null,
        // The provider's own id for the task, which is what makes a row in
        // `assets` traceable back to a line on the Runware invoice.
        taskId: result.taskUUID ?? task.taskUUID,
        model: MODEL,
        steps: STEPS,
        // Echoed, not assumed. The provider is free to substitute a seed, and
        // a seed nobody verified cannot reproduce anything.
        seed: typeof result.seed === "number" ? result.seed : request.seed,
        latencyMs: Date.now() - started,
      },
    };
  },
};
