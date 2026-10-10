import "server-only";
import type {
  EditRequest,
  GenerationOutcome,
  GenerationProvider,
  InpaintRequest,
  ModelRequest,
  TryOnRequest,
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
/**
 * En qué formato se piden los resultados, y por qué dejó de ser PNG.
 *
 * **Medido el 25-sep sobre una generación real de 896x1344**: el mismo dibujo
 * pesa 3.45 MB en PNG y 0.13 MB en WEBP a calidad 95, veintiséis veces menos,
 * con una diferencia media de 1 sobre 255. Un diseño con ocho pasos bajaba 22
 * MB para dibujar ocho miniaturas, y esa era la espera de siete segundos al
 * abrir la pantalla.
 *
 * **Con pérdida, porque no hay otra opción.** `outputQuality` llega hasta 99;
 * el WEBP sin pérdida daría 3.9x con cero diferencia, pero solo se consigue
 * recodificando de este lado, y eso obligaría a bajar y volver a subir cada
 * imagen, que es justo lo que `uploadEndpoint` vino a evitar. 95 es además el
 * valor por omisión del proveedor.
 *
 * **Y los cuatro modelos lo aceptan de ENTRADA**, que era el bloqueante: en
 * esta cadena cada generación alimenta a la siguiente. No está documentado en
 * ningún lado, así que se midió con una llamada por modelo
 * (`herramientas/probar_webp.py`, $0.0149).
 */
const OUTPUT_FORMAT = "WEBP";
const OUTPUT_QUALITY = 95;

const MODEL = "runware:102@1";

/**
 * FLUX.1 [dev] con máscara, para DIBUJAR dentro de una zona.
 *
 * Es el mismo modelo que genera personas, usado de otra forma: acá recibe
 * `seedImage`, `maskImage` y `strength`, y esa última es la diferencia que lo
 * hace servir para algo que Fill no puede hacer. Fill completa lo que ve;
 * este llena la zona de ruido en proporción a `strength` y dibuja lo que el
 * prompt pide, sin que haga falta pintar nada debajo.
 *
 * Medido (`EXPERIMENTO_6`): con este camino salieron un bolsillo, un cuello
 * distinto, una gorra, un estampado y un cambio de tela. Con Fill, ninguno de
 * los cinco sin pintar antes.
 */
const DRAW_MODEL = "runware:101@1";

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

/**
 * P-Image-Try-On, for putting a garment on a person.
 *
 * **Chosen by measurement, not by price.** Four garments with four different
 * kinds of mark went through this model and through `bfl:flux@vto` with the
 * same person, the same seed and identically prepared images. It matched or
 * beat the other one on every logo criterion, barely touched the head (a mean
 * change of 0.3 against 3.2 to 4.4), returned exactly the input resolution,
 * took a third of the time, and cost **$0.0045 against $0.0575**
 * (`herramientas/docs/EXPERIMENTO_4_vton.md`).
 *
 * It also stayed at $0.0045 with a person photo three times larger, where the
 * other model's price climbed: this one does not bill by megapixel.
 */
const TRY_ON_MODEL = "prunaai:p-image@try-on";

/**
 * FLUX.1 [dev], for drawing a person from a description.
 *
 * Plain text-to-image. Kontext was the obvious candidate and it is the wrong
 * tool: it edits an image it receives, and this task has none to give it, while
 * costing five times more. Schnell costs half of this one but is the four-step
 * distilled build, and what is being drawn here are **faces**, which is exactly
 * where four steps show.
 */
const MODEL_MODEL = "runware:101@1";

/**
 * The canvas a model photo is drawn on, fixed and not offered as a choice.
 *
 * 832×1216: both multiples of 64, 1.01 MP, ratio 1.46. It is the size the next
 * step wants — P-Image returns the try-on at the person photo's resolution, and
 * FLUX VTO passes anything under 2 MP through untouched — so a size the user
 * could vary would only vary what the try-on gives back.
 */
const MODEL_SIZE = { width: 832, height: 1216 } as const;

/** The value every measured run used. See `EXPERIMENTO_3_*` in herramientas. */
const STEPS = 28;

/**
 * **Cuánto se espera a que el modelo responda**, y ya no incluye una descarga.
 *
 * Bajó de 55 a 35 segundos cuando los bytes dejaron de pasar por acá. No es un
 * recorte de prudencia: el que tiene que caber en los 60 de la ruta es el
 * total, y ahora después de esto viene la espera a que el objeto aparezca en R2
 * más, en el peor caso, el respaldo que lo baja y lo sube
 * (`lib/generation/store.ts`). Dejar 55 acá habría sumado más de 60 entre los
 * tres tramos, y el que corta entonces es Vercel, sin mensaje.
 *
 * 35 es casi el doble de la generación más lenta medida, que fueron 20.
 *
 * ---
 *
 * **Y antes eran dos plazos fijos, lo que estuvo mal.**
 *
 * Antes eran dos topes fijos, 48 segundos para la inferencia y 10 para bajar la
 * imagen, sumando poco menos que los 60 que permite la ruta. Parecía prudente y
 * estaba mal: los dos tramos compiten por el mismo tiempo, y repartirlo de
 * antemano le regala a uno lo que al otro le falta.
 *
 * Se rompió exactamente así. Generar una persona tarda unos 5 segundos y deja
 * 43 sin usar, pero la descarga seguía limitada a 10; un PNG de 1 MP sobre una
 * conexión lenta no entró, y se abortó una imagen **que ya estaba pagada**.
 *
 * Con un plazo único, la descarga hereda todo lo que la inferencia no gastó.
 * El caso que falló habría tenido 50 segundos en vez de 10.
 *
 * 55 y no 60 para dejarle margen a la ruta: el plazo propio tiene que vencer
 * antes que el de la plataforma, porque el nuestro devuelve un mensaje que se
 * puede leer y el suyo corta la función sin explicación.
 *
 * ---
 *
 * **30-sep: Kontext empezó a tardar más de lo medido, y este número dejó de
 * alcanzarle.** Dos llamadas seguidas en producción se abortaron a los 35s;
 * medido aparte con un plazo de 300s, la misma tarea contestó a los **51s**,
 * con resultado correcto y cobrando más que antes ($0.0201 contra $0.0137).
 * No estaba caído, estaba lento (`herramientas/model_availability`).
 *
 * Subir este número global habría sido pedirle más paciencia a los otros tres
 * caminos, que no la necesitan: Fill e inpaint miden 10-20s, el modelo 3-5s,
 * el try-on 11-13s, todos lejos de 35. Por eso el presupuesto más grande vive
 * aparte, en `EDIT_BUDGET_MS`, y solo lo usa `edit()`.
 */
const TOTAL_BUDGET_MS = 35_000;

/**
 * El mismo presupuesto, pero para Kontext, que el 30-sep se midió respondiendo
 * en 51s cuando lo normal habían sido 15. 120 es "de momento": deja margen
 * para que siga más lento sin dejar de intentarlo, no una cifra medida como
 * suficiente para un mal sostenido. Si Kontext se estabiliza más lento que
 * esto también, hay que volver a medir, no a subir el número a ciegas.
 *
 * Obliga a subir el `maxDuration` de la ruta de `edit` en la misma proporción
 * (ver `app/api/generate/edit/route.ts`): el plazo propio tiene que seguir
 * venciendo antes que el de la plataforma.
 */
const EDIT_BUDGET_MS = 120_000;

/** Nunca se pide un plazo de cero o negativo, por tarde que sea. */
const MIN_TIMEOUT_MS = 2_000;

function restante(vence: number): number {
  return Math.max(MIN_TIMEOUT_MS, vence - Date.now());
}

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
  steps: number | null,
  requestedSeed: number,
  /** Todos menos `edit` usan el valor por omisión. Ver `EDIT_BUDGET_MS`. */
  budgetMs: number = TOTAL_BUDGET_MS
): Promise<GenerationOutcome> {
  const started = Date.now();
  const vence = started + budgetMs;

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify([task]),
      signal: AbortSignal.timeout(restante(vence)),
    });
  } catch (error) {
    logIssue(`fetch failed: ${String(error)}`);

    // **A timeout is not a rejection, and saying it was would be a lie.** When
    // Runware refuses a task there is no charge and that is knowable. When this
    // side stops waiting, the task was already accepted: it may well finish and
    // bill a second later, into a connection nobody is listening to. The image
    // is lost either way, but the money is not necessarily.
    const expiro = error instanceof Error && error.name === "TimeoutError";

    // El número sale de `budgetMs`, no de un texto escrito aparte: un mensaje
    // que repite la cifra a mano es un mensaje que puede mentir el día que la
    // cifra cambie, que es exactamente lo que pasó con esta misma constante.
    return fail(
      expiro
        ? `El servicio de generación tardó más de ${Math.round(budgetMs / 1000)} segundos y se canceló la espera. La imagen se perdió, pero es posible que la llamada sí se haya cobrado.`
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

  // **Acá ya no se baja nada.** Runware está escribiendo la imagen en el
  // destino firmado que recibió en `uploadEndpoint`, de forma asíncrona, así
  // que los bytes nunca pasan por esta función. Esperar a que llegue y medirla
  // es trabajo de `lib/generation/store.ts`, que además sabe caer a esta
  // `imageURL` si el atajo falla.
  return {
    ok: true,
    data: {
      imageUrl: result.imageURL,
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
  format: { mime: "image/webp", extension: "webp" },

  async inpaint(request: InpaintRequest): Promise<GenerationOutcome> {
    const apiKey = readKey();
    if (!apiKey) return fail(SIN_LLAVE);

    // One task per request. `numberResults` stays at 1 because the cost is per
    // image and the strip advances one step at a time: two results would mean
    // paying twice to throw one away.
    // **El modo elige el modelo, no un parámetro.** Los dos toman la misma
    // máscara y la misma semilla de imagen, y ahí se acaba el parecido: Fill
    // completa lo que ve debajo y dev dibuja lo que se le pide. Mandarlos por
    // la misma función es correcto porque la orquestación es idéntica; elegir
    // con un `if` acá y no en la ruta es lo que mantiene a la ruta ignorante
    // de qué modelo existe.
    const dibuja = request.mode === "draw";

    return run(
      apiKey,
      {
        taskType: "imageInference",
        taskUUID: crypto.randomUUID(),
        model: dibuja ? DRAW_MODEL : MODEL,
        positivePrompt: request.prompt,
        seed: request.seed,
        width: request.size.width,
        height: request.size.height,
        steps: STEPS,
        numberResults: 1,
        outputFormat: OUTPUT_FORMAT,
        outputQuality: OUTPUT_QUALITY,
        includeCost: true,
        // Solo cuando el modelo la tiene. Mandársela a Fill no es inofensivo:
        // la convierte en un multiplicador de pasos, así que cambiaría el
        // cómputo y el precio sin cambiar la edición.
        ...(dibuja && request.strength !== null
          ? { strength: request.strength }
          : {}),
        // Runware escribe el resultado acá y nunca pasa por esta función.
        uploadEndpoint: request.uploadTo,
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
      dibuja ? DRAW_MODEL : MODEL,
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
        outputFormat: OUTPUT_FORMAT,
        outputQuality: OUTPUT_QUALITY,
        includeCost: true,
        // Runware escribe el resultado acá y nunca pasa por esta función.
        uploadEndpoint: request.uploadTo,
        inputs: { referenceImages: [request.imageUrl] },
      },
      EDIT_MODEL,
      STEPS,
      request.seed,
      EDIT_BUDGET_MS
    );
  },

  /**
   * The try-on. Two reference images with a role each, and almost no knobs.
   *
   * `settings.preserveInputSize` is sent explicitly although `true` is its
   * default, because it decides the output resolution and a default that
   * changes upstream would silently change what this app delivers.
   *
   * `steps` is not sent and **null is what gets stored**: this model has no
   * step count. A borrowed constant would be a number the report could quote,
   * and a zero would claim it ran no iterations, which is a different and false
   * statement.
   */
  async tryOn(request: TryOnRequest): Promise<GenerationOutcome> {
    const apiKey = readKey();
    if (!apiKey) return fail(SIN_LLAVE);

    return run(
      apiKey,
      {
        taskType: "imageInference",
        taskUUID: crypto.randomUUID(),
        model: TRY_ON_MODEL,
        seed: request.seed,
        numberResults: 1,
        outputFormat: OUTPUT_FORMAT,
        outputQuality: OUTPUT_QUALITY,
        includeCost: true,
        // Runware escribe el resultado acá y nunca pasa por esta función.
        uploadEndpoint: request.uploadTo,
        inputs: {
          referenceImages: [
            { image: request.personUrl, role: "person" },
            { image: request.garmentUrl, role: "garment" },
          ],
        },
        settings: { preserveInputSize: true },
      },
      TRY_ON_MODEL,
      null,
      request.seed
    );
  },

  /**
   * The person, from words.
   *
   * Nothing is sent that was not measured. No `negativePrompt`: this model does
   * accept one with guidance on, unlike Fill, but the project has measured that
   * naming a thing to exclude it summons it, and that measurement has not been
   * repeated here. No `CFGScale`: the schema declares no default, so sending a
   * number would be choosing one without a basis.
   */
  async generateModel(request: ModelRequest): Promise<GenerationOutcome> {
    const apiKey = readKey();
    if (!apiKey) return fail(SIN_LLAVE);

    return run(
      apiKey,
      {
        taskType: "imageInference",
        taskUUID: crypto.randomUUID(),
        model: MODEL_MODEL,
        positivePrompt: request.description,
        seed: request.seed,
        width: MODEL_SIZE.width,
        height: MODEL_SIZE.height,
        steps: STEPS,
        numberResults: 1,
        outputFormat: OUTPUT_FORMAT,
        outputQuality: OUTPUT_QUALITY,
        includeCost: true,
        // Runware escribe el resultado acá y nunca pasa por esta función.
        uploadEndpoint: request.uploadTo,
      },
      MODEL_MODEL,
      STEPS,
      request.seed
    );
  },
};
