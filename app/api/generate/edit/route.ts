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
import { assetDisplayName } from "@/lib/assets";
import { getGenerationProvider } from "@/lib/generation";
import { resolveEditInput } from "@/lib/generation/inputs";
import { newSeed } from "@/lib/generation/seed";
import { editSchema } from "@/lib/validation";
import {
  jsonError,
  notFound,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import type { Asset } from "@/lib/types";

/**
 * POST /api/generate/edit — change the image by instruction, with no mask.
 *
 * **A separate route from `/inpainting`, not a flag on it.** The two differ in
 * their inputs (one resolves a mask and this one refuses to), in their valid
 * sizes (multiples of 64 against a closed list), in what they store
 * (`asset_type` 'inpainting' against 'edit', and a `mask_asset_id` that is null
 * here), and in what the text means. A shared handler with four branches would
 * be one file pretending to be one operation.
 *
 * What they do share stays shared: the ownership rule lives in
 * `lib/generation/inputs.ts`, the provider is chosen in one place, and the
 * upload and the insert follow the same three steps, so a fix to one is a fix
 * to both.
 *
 * Synchronous, like its sibling and for the same reason: Kontext takes about
 * the same time as Fill, and a queue would be machinery for a problem that does
 * not exist yet.
 */

/** Same ceiling and same reasoning as `/inpainting`. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const { design_id, image_asset_id, instruction } = parsed.data;

  const supabase = await createSupabaseClient();

  const path = await resolveDesignPath(supabase, design_id);
  if (!path) return notFound("El diseño no existe.");

  const resolved = await resolveEditInput(
    supabase,
    design_id,
    // From the design resolved server-side, never from the browser.
    path.clientId,
    image_asset_id
  );
  if (!resolved.ok) return jsonError(resolved.error, resolved.status);

  const { image, size } = resolved.input;

  // A signed URL, not bytes: the provider fetches it itself.
  const imageUrl = await getReadUrl(image.r2_key);

  // The user's words leave untouched. There is no `composePrompt` here and that
  // is deliberate: on this path the text is an order, and an order wrapped in
  // sentences the user cannot see is an order they did not give.
  const seed = newSeed();

  // **La clave y su URL firmada se preparan ANTES de llamar**, porque el
  // proveedor necesita saber dónde escribir. Es la inversión que hace que los
  // bytes no vuelvan a pasar por acá: antes se pedía la imagen y después se
  // decidía dónde iba; ahora el destino viaja con el pedido.
  const assetId = crypto.randomUUID();
  const r2Key = `clients/${path.clientId}/projects/${path.projectId}/designs/${design_id}/${assetId}.png`;
  const uploadTo = await getUploadUrl(r2Key, "image/png");

  const provider = getGenerationProvider();
  const outcome = await provider.edit({
    imageUrl,
    size,
    instruction,
    seed,
    uploadTo,
  });

  // A failed generation is not charged and nothing is written. Unlike the mask
  // path, there is nothing to clean up either: no mask was uploaded first, so a
  // rejection here cannot orphan a row.
  if (!outcome.ok) return jsonError(outcome.error, 502);

  const result = outcome.data;

  // **El objeto ya se está escribiendo solo.** Runware recibió el destino
  // firmado y escribe ahí de forma asíncrona, así que acá solo se espera a que
  // aparezca y se lo mide con 32 bytes. Si nunca aparece, `storeGeneratedImage`
  // cae al camino de antes y baja la imagen de la URL del proveedor.
  const stored = await storeGeneratedImage(r2Key, result.imageUrl);
  if (!stored.ok) return jsonError(stored.error, 502);

  const { data, error } = await supabase
    .from("assets")
    .insert({
      id: assetId,
      design_id,
      r2_key: r2Key,
      // 'edit' and not 'inpainting' (migration 018). The distinction the column
      // records is **with a mask against without one**: an inpainting is
      // defined by the region that was painted, and this one never had a
      // region. Deterministic against generative is a different question and
      // `origin` already answers it.
      asset_type: "edit",
      original_filename: `edit-${Date.now()}.png`,
      mime_type: "image/png",
      file_size_bytes: stored.measurement.bytes,
      // Medido, no supuesto: este modelo reencuadra, así que el tamaño
      // entregado puede diferir del pedido por más que un redondeo.
      width_px: stored.measurement.width,
      height_px: stored.measurement.height,
      origin: "generated",
      runware_task_id: result.taskId,
      cost_usd: result.costUsd,
      generation_seed: result.seed,
      generation_model: result.model,
      generation_steps: result.steps,
      generation_latency_ms: result.latencyMs,
      // Exactly what was sent, which on this path is exactly what was typed.
      generation_prompt: instruction,
      parent_asset_id: image_asset_id,
      // No `mask_asset_id`, and its absence is data rather than an omission:
      // a row of type 'edit' with a null mask is the signature of this path.
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

  // The cursor follows the generation, same as the mask path.
  await supabase
    .from("designs")
    .update({ current_asset_id: assetId })
    .eq("id", design_id);

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
