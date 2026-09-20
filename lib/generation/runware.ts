import "server-only";
import type {
  EditRequest,
  GenerationOutcome,
  GenerationProvider,
  InpaintRequest,
} from "@/lib/generation/types";

/**
 * The provider that costs money: Runware, with two models behind one object.
 *
 * FLUX.1 Fill [dev] answers `inpaint`, FLUX.1 Kontext [dev] answers `edit`.
 * They share an endpoint, a key and a response shape, and nothing else: the
 * notes below about what is deliberately not sent are about Fill.
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

/**
 * FLUX.1 Kontext [dev], for editing by instruction.
 *
 * A different model, not a different setting, and the difference shows up in
 * the request: no `maskImage`, no `seedImage`, the image goes in
 * `inputs.referenceImages`, and the prompt is an order rather than a
 * description of what belongs in a hole.
 *
 * Measured at **$0.0130** against $0.0038 for Fill, about 3.4 times. It earns
 * that: it produced both sleeves where Fill produced a bare arm, and it kept
 * the person's identity while doing it.
 */
const EDIT_MODEL = "runware:106@1";

/** The value every measured run used. See `EXPERIMENTO_3_*` in herramientas. */
const STEPS = 28;

/**
 * Budgets, and they add up to just under the route's own ceiling on purpose.
 *
 * The route allows 60 s (`maxDuration`), so 48 plus 10 leaves two seconds of
 * slack and still fails with a message the user can read instead of a platform
 * timeout they cannot.
 *
 * **They started at 40 and 15, and Kontext hit the 40.** Fill had measured
 * 10 s to 20 s, and the instruction model is slower: it re-renders the whole
 * frame rather than a masked patch. The same request succeeded on the retry, so
 * the ceiling was the problem and not the request.
 *
 * Raising them further means raising `maxDuration` past 60 first, because the
 * platform kills the function regardless of what this file hopes for. That is a
 * deployment decision (300 s needs fluid compute enabled, and fails the build
 * otherwise), so it waits for evidence that real calls need it.
 */
const INFERENCE_TIMEOUT_MS = 48_000;
const DOWNLOAD_TIMEOUT_MS = 10_000;

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

/**
 * Everything that is the same whichever model answers.
 *
 * Extracted rather than duplicated because the two paths differ only in the
 * task they send: the authentication, the rejection handling, the "was it
 * charged" wording and the download are one behaviour, and two copies of it
 * would drift the first time one of them was fixed.
 */
async function run(
  apiKey: string,
  task: Record<string, unknown>,
  model: string,
  steps: number,
  requestedSeed: number
): Promise<GenerationOutcome> {
  const started = Date.now();

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

    // **A timeout is not a rejection, and saying it was would be a lie.** When
    // Runware refuses a task there is no charge and that is knowable. When this
    // side stops waiting, the task was already accepted: it may well finish and
    // bill a second later, into a connection nobody is listening to. The image
    // is lost either way, but the money is not necessarily.
    const expiro = error instanceof Error && error.name === "TimeoutError";

    return fail(
      expiro
        ? "El servicio de generación tardó demasiado y se canceló la espera. La imagen se perdió, pero es posible que la llamada sí se haya cobrado."
        : "No se pudo contactar al servicio de generación. No se te cobró; puedes intentar de nuevo."
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
      taskId: result.taskUUID ?? String(task.taskUUID),
      model,
      steps,
      // Echoed, not assumed. The provider is free to substitute a seed, and a
      // seed nobody verified cannot reproduce anything.
      seed: typeof result.seed === "number" ? result.seed : requestedSeed,
      latencyMs: Date.now() - started,
    },
  };
}

/**
 * The app's own key, deliberately not the one the Python tools in
 * `herramientas/` read. See `index.ts` for why they are two names.
 */
function readKey(): string | undefined {
  return process.env.API_KEY_RUNWARE_PROD;
}

/**
 * Reachable only by misconfiguration: `getGenerationProvider` refuses to return
 * this provider without a key. Checked again anyway, because a provider that
 * assumes its own preconditions is a provider that sends an unauthenticated
 * request to a paid API.
 */
const SIN_LLAVE =
  "La generación con IA no está configurada en este entorno. No se te cobró.";

export const runwareProvider: GenerationProvider = {
  name: "runware",
  billable: true,

  async inpaint(request: InpaintRequest): Promise<GenerationOutcome> {
    const apiKey = readKey();
    if (!apiKey) return fail(SIN_LLAVE);

    // One task per request. `numberResults` stays at 1 because the cost is per
    // image and the strip advances one step at a time: two results would mean
    // paying twice to throw one away.
    return run(
      apiKey,
      {
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
        // Nested, as the current schema declares them. The first experiments
        // sent these at the root and Runware accepted it, which is precisely
        // why it is worth pinning down: an accepted-but-undeclared shape is one
        // nobody can promise will keep behaving the same way.
        inputs: {
          // Presigned R2 URLs. Runware fetches them itself, so nothing is
          // uploaded twice and no image bytes pass through this function.
          seedImage: request.imageUrl,
          maskImage: request.maskUrl,
        },
      },
      MODEL,
      STEPS,
      request.seed
    );
  },

  /**
   * Editing by instruction. Same plumbing, a different request entirely.
   *
   * Three differences from `inpaint`, and each one belongs to the model rather
   * than to a preference:
   *
   *   - **No `maskImage` and no `seedImage`.** The image goes in
   *     `inputs.referenceImages`, as a list.
   *   - **The size comes from a closed list** (`snapToKontextSize`), not from
   *     every multiple of 64. The caller has already chosen it; anything else
   *     is rejected without charge.
   *   - **The prompt is an order**, not a description of what belongs in a
   *     hole. That inversion is why this is a separate mode on screen rather
   *     than a third intent inside the mask panel.
   */
  async edit(request: EditRequest): Promise<GenerationOutcome> {
    const apiKey = readKey();
    if (!apiKey) return fail(SIN_LLAVE);

    return run(
      apiKey,
      {
        taskType: "imageInference",
        taskUUID: crypto.randomUUID(),
        model: EDIT_MODEL,
        positivePrompt: request.instruction,
        seed: request.seed,
        width: request.size.width,
        height: request.size.height,
        steps: STEPS,
        numberResults: 1,
        outputFormat: "PNG",
        includeCost: true,
        inputs: { referenceImages: [request.imageUrl] },
      },
      EDIT_MODEL,
      STEPS,
      request.seed
    );
  },
};
