import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import {
  getReadUrl,
  getUploadUrl,
  getDownloadUrl,
  discardObject,
} from "@/lib/r2";
import { storeGeneratedImage } from "@/lib/generation/store";
import { resolveDesignPath } from "@/lib/designs";
import { getClientAccess } from "@/lib/access";
import { assetDisplayName } from "@/lib/assets";
import { getGenerationProvider } from "@/lib/generation";
import { resolveGenerationInputs } from "@/lib/generation/inputs";
import { composePrompt } from "@/lib/generation/prompt";
import { newSeed } from "@/lib/generation/seed";
import { inpaintSchema } from "@/lib/validation";
import {
  jsonError,
  notFound,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import type { Asset } from "@/lib/types";

/**
 * POST /api/generate/inpainting — edit a masked region of the working image.
 *
 * The route owns the *orchestration*; it owns none of the decisions:
 *
 *   - **who may read these images** is `resolveGenerationInputs` (FKs are
 *     verified below RLS — seventh time);
 *   - **what size to send** is `snapToInferenceSize`, shared with the browser
 *     so a mask can never be painted at a size the request does not use;
 *   - **who generates** is `getGenerationProvider()`, which today is the
 *     simulator and tomorrow is Runware, without this file changing.
 *
 * Synchronous on purpose. An inpainting takes 5–20 s and Vercel allows up to
 * 300 s, so a queue, a webhook and a task table would be machinery for a
 * problem that does not exist yet. If real latencies
 * come close to the limit, that is when it changes.
 */

/**
 * The ceiling this route is allowed to take, stated rather than inherited.
 *
 * Without it the function keeps whatever default the platform has that month,
 * and the platform's default has been as low as 10 s — which is under half of
 * the slowest generation this project has measured. A real call would have
 * failed on deploy and worked on localhost, which is the worst shape a bug can
 * take.
 *
 * It was 60, because 60 is valid on every Vercel configuration and anything
 * above needs fluid compute, failing the build otherwise. The note said to
 * raise it the day a real latency got close. That day was 15-oct: FLUX dev went
 * from 6.4 s to 28.8 s in one afternoon and a model generation was cut at 35.
 *
 * 150 now, the same in the four generation routes: `TOTAL_BUDGET_MS` (120 s)
 * plus 6 s of polling and 18 s of fallback in `store.ts`, 144 in the worst
 * case. It needs fluid compute, and the project has it: the edit route has
 * shipped with 150 since 30-sep.
 */
export const maxDuration = 150;

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = inpaintSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const { design_id, image_asset_id, mask_asset_id, mode, prompt, strength } =
    parsed.data;

  const supabase = await createSupabaseClient();

  // RLS hides designs the caller is not a member of, so "no path" is a 404 for
  // the same reason it is everywhere else in the app.
  const path = await resolveDesignPath(supabase, design_id);
  if (!path) return notFound("El diseño no existe.");

  // Antes de gastar, no después: RLS rechazaría la inserción igual, pero para
  // entonces la generación ya estaría pagada. Un miembro de solo lectura
  // puede leer el diseño, y con eso pasaba todas las comprobaciones de abajo.
  const access = await getClientAccess(supabase, path.clientId, user.id);
  if (!access.canEdit) {
    return jsonError(
      "Tu acceso a este cliente es de solo lectura: no puedes editar con IA.",
      403
    );
  }

  const resolved = await resolveGenerationInputs(
    supabase,
    design_id,
    // Del diseño resuelto en el servidor, nunca del navegador: es lo que
    // permite aceptar una prenda del catálogo sin aflojar la regla.
    path.clientId,
    image_asset_id,
    mask_asset_id
  );
  if (!resolved.ok) return jsonError(resolved.error, resolved.status);

  const { image, mask, size } = resolved.inputs;

  // Signed URLs, not bytes: the provider fetches them itself. Runware's
  // `seedImage` takes a public URL, and a presigned R2 URL is one for the hour
  // it lives — far longer than any generation.
  const [imageUrl, maskUrl] = await Promise.all([
    getReadUrl(image.r2_key),
    getReadUrl(mask.r2_key),
  ]);

  // The user's words go in verbatim, inside a frame that says what must not
  // change. Composed here rather than in the browser so there is exactly one
  // answer to "what was actually asked for", and so the frame can be tuned
  // without shipping a new client (`lib/generation/prompt.ts`).
  const composed = composePrompt(prompt);

  // Chosen here and not in the browser, for the same reason the prompt is: one
  // answer to "what was actually asked for". A seed the client could pick would
  // also be a seed the client could omit, which is how generations became
  // unrepeatable in the first place (`lib/generation/seed.ts`).
  const seed = newSeed();

  // **La clave y su URL firmada se preparan ANTES de llamar**, porque el
  // proveedor necesita saber dónde escribir. Es la inversión que hace que los
  // bytes no vuelvan a pasar por acá: antes se pedía la imagen y después se
  // decidía dónde iba; ahora el destino viaja con el pedido.
  // El proveedor primero, porque **él decide el formato** y de eso dependen
  // la extensión de la clave y el tipo con el que se firma la subida. El
  // simulador entrega PNG y el real WEBP; firmar un tipo fijo rompería a uno
  // de los dos, porque la URL firmada exige que el PUT mande ese mismo tipo.
  const provider = getGenerationProvider();
  const { mime, extension } = provider.format;

  const assetId = crypto.randomUUID();
  const r2Key = `clients/${path.clientId}/projects/${path.projectId}/designs/${design_id}/${assetId}.${extension}`;
  const uploadTo = await getUploadUrl(r2Key, mime);

  const outcome = await provider.inpaint({
    imageUrl,
    maskUrl,
    size,
    prompt: composed,
    mode,
    // Null explícito y no `undefined`: en `fill` significa "este modelo no
    // tiene esta perilla", y esa distinción viaja hasta la columna.
    strength: mode === "draw" ? strength ?? null : null,
    seed,
    uploadTo,
  });

  // A failed generation is not charged and nothing is written: the design is
  // left exactly as it was, which is what lets the user just press again.
  if (!outcome.ok) return jsonError(outcome.error, 502);

  const result = outcome.data;

  // **El objeto ya se está escribiendo solo.** Runware recibió el destino
  // firmado y escribe ahí de forma asíncrona, así que acá solo se espera a que
  // aparezca y se lo mide con 32 bytes. Si nunca aparece, `storeGeneratedImage`
  // cae al camino de antes y baja la imagen de la URL del proveedor.
  const stored = await storeGeneratedImage(r2Key, result.imageUrl, mime);
  if (!stored.ok) return jsonError(stored.error, 502);

  const { data, error } = await supabase
    .from("assets")
    .insert({
      id: assetId,
      design_id,
      r2_key: r2Key,
      asset_type: "inpainting",
      // **Sin nombre, y eso es lo correcto.** Acá iba un `prueba-virtual-1758…`
      // con marca de tiempo, que no lo eligió nadie y que no dice nada: la
      // columna es "el nombre que el usuario le puso" y una imagen generada no
      // tuvo quién se lo pusiera. En null, la pantalla muestra el diseño y el
      // tipo, la descarga sale como "Prueba virtual.webp", y **un valor en esta
      // columna pasa a significar que alguien la nombró de verdad**.
      original_filename: null,
      mime_type: mime,
      file_size_bytes: stored.measurement.bytes,
      // MEDIDO, no supuesto. Antes decía `size.width`, o sea el tamaño que
      // se pidió, que con el simulador es cierto por construcción y con un
      // proveedor real es una suposición. Ahora se lee del objeto ya escrito,
      // con una petición de 32 bytes.
      width_px: stored.measurement.width,
      height_px: stored.measurement.height,
      // 'generated' is reserved for images that cost money and came out of a
      // model. The simulator claims it too, because everything
      // downstream — the strip, the running total, the lineage — has to behave
      // exactly as it will with the real provider.
      origin: "generated",
      runware_task_id: result.taskId,
      cost_usd: result.costUsd,
      // Lo que hace falta para volver a producir ESTA imagen (migración 018).
      // Las tres las reporta el proveedor, no las supone la ruta: la ruta sabe
      // qué pidió, no qué respondió.
      generation_seed: result.seed,
      generation_model: result.model,
      generation_steps: result.steps,
      // Lo que decidió el resultado (migración 020). Null en `fill`, porque
      // ese modelo no lee el parámetro: guardarle un número sería dejar la
      // fila afirmando algo que no ocurrió.
      generation_strength: mode === "draw" ? strength ?? null : null,
      generation_latency_ms: result.latencyMs,
      // The COMPOSED text, not the user's fragment: this column is the record
      // of what the model was actually asked, and it is what makes a result
      // reproducible months later. The user's own words are the tail of it.
      generation_prompt: composed,
      // The lineage that sustains objetivo específico 2: this image came out of
      // that one. It is also what makes the history a tree while the strip
      // stays a line.
      parent_asset_id: image_asset_id,
      // WHICH region was edited, recorded instead of inferred (migration 017).
      // Without it a generation and its mask are siblings that have to be
      // matched by timestamp, which breaks on two generations in a row — and a
      // result whose mask cannot be identified is not reproducible, and reproducibility is
      // what the row is for.
      //
      // It also turns the leak into something findable: the mask is uploaded
      // *before* the provider is called, so a failed generation leaves one
      // behind. With this column, a mask no row points at is orphaned by
      // definition.
      mask_asset_id,
    })
    .select()
    .single();

  if (error) {
    // **El objeto ya está en R2 y ninguna fila lo reclama.** Se descarta acá,
    // que es donde se sabe que quedó suelto: la clave la construyó esta misma
    // petición con un UUID nuevo, así que nada más puede estar apuntándola y
    // borrarla es seguro.
    //
    // Es la misma respuesta que ya daba el navegador cuando el servidor le
    // rechazaba una máscara. Lo que falla no es el orden —subir antes de
    // insertar es lo correcto, porque al revés un fallo dejaría una fila
    // apuntando a un objeto inexistente, que sí se ve rota en pantalla— sino
    // que faltaba limpiar el único caso que el orden deja abierto.
    await discardObject(r2Key);
    return translateDbError(error);
  }

  const created = data as Asset;

  // The cursor follows the generation: what the user just made is what they are
  // now working on. Going back is a separate, explicit act.
  // Best effort — the image is already registered and a failure here must not
  // undo that.
  await supabase
    .from("designs")
    .update({ current_asset_id: assetId })
    .eq("id", design_id);

  // Only ever from 'draft': 'completed' records a decision the user made and
  // nothing automatic may undo it. Separate statement
  // because the cursor moves unconditionally and the status does not.
  await supabase
    .from("designs")
    .update({ status: "active" })
    .eq("id", design_id)
    .eq("status", "draft");

  return NextResponse.json({
    ...created,
    url: await getReadUrl(created.r2_key),
    downloadUrl: await getDownloadUrl(
      created.r2_key,
      assetDisplayName(created)
    ),
    latency_ms: result.latencyMs,
    simulated: !provider.billable,
  });
}
