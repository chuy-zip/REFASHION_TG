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
import { resolveDesignPath } from "@/lib/designs";
import { assetDisplayName } from "@/lib/assets";
import { getGenerationProvider } from "@/lib/generation";
import { resolveTryOnInputs } from "@/lib/generation/inputs";
import { newSeed } from "@/lib/generation/seed";
import { readPngSize } from "@/lib/png-size";
import { tryOnSchema } from "@/lib/validation";
import {
  jsonError,
  notFound,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import type { Asset } from "@/lib/types";

/**
 * POST /api/generate/vton — the garment, worn by a person.
 *
 * The third generation route, and it follows the two before it on purpose:
 * ownership is decided in `lib/generation/inputs.ts`, the provider is chosen in
 * one place, and the upload and insert are the same three steps. What is
 * different is what it produces and where that lands.
 *
 * **The result is a final product, not a working step.** A try-on does not
 * continue the design the way an inpainting does: nothing is painted on top of
 * it afterwards, and the cursor must not move onto it, or the next edit would
 * try to mask a photograph of a person. So `asset_type` is `vton`, which
 * `listClientFinalProducts` reads, and `designs.current_asset_id` is left
 * exactly where it was.
 *
 * **Two inputs, two columns.** The garment goes in `parent_asset_id`, because
 * the result descends from it. The person goes in `person_asset_id`, added by
 * migration 019 for exactly this: without it a try-on is an image nobody can
 * trace back to what produced it, and the report's results table is built by
 * crossing person against garment.
 */

/** Same ceiling as its siblings. Measured try-ons took 11 s to 13 s. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = tryOnSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const { design_id, garment_asset_id, person_asset_id } = parsed.data;

  const supabase = await createSupabaseClient();

  const path = await resolveDesignPath(supabase, design_id);
  if (!path) return notFound("El diseño no existe.");

  const resolved = await resolveTryOnInputs(
    supabase,
    design_id,
    path.clientId,
    garment_asset_id,
    person_asset_id
  );
  if (!resolved.ok) return jsonError(resolved.error, resolved.status);

  const { garment, person } = resolved.inputs;

  // Signed URLs, not bytes: the provider fetches both itself.
  const [garmentUrl, personUrl] = await Promise.all([
    getReadUrl(garment.r2_key),
    getReadUrl(person.r2_key),
  ]);

  const seed = newSeed();

  const provider = getGenerationProvider();
  const outcome = await provider.tryOn({ personUrl, garmentUrl, seed });

  if (!outcome.ok) return jsonError(outcome.error, 502);

  const result = outcome.data;

  // Measured. This model returns the person photo's resolution, so the size is
  // knowable in advance, and reading it anyway is what keeps that a fact rather
  // than an assumption about someone else's default.
  const entregado = readPngSize(await result.image.arrayBuffer());

  const assetId = crypto.randomUUID();
  const r2Key = `clients/${path.clientId}/projects/${path.projectId}/designs/${design_id}/${assetId}.png`;

  const uploadUrl = await getUploadUrl(r2Key, "image/png");
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: result.image,
  });

  if (!put.ok) {
    return jsonError("No se pudo guardar la prueba virtual.", 502);
  }

  const { data, error } = await supabase
    .from("assets")
    .insert({
      id: assetId,
      design_id,
      r2_key: r2Key,
      asset_type: "vton",
      original_filename: `prueba-virtual-${Date.now()}.png`,
      mime_type: "image/png",
      file_size_bytes: result.image.size,
      width_px: entregado?.width ?? person.width_px,
      height_px: entregado?.height ?? person.height_px,
      origin: "generated",
      runware_task_id: result.taskId,
      cost_usd: result.costUsd,
      generation_seed: result.seed,
      generation_model: result.model,
      // Null, because this model has no step count to report. It used to be a
      // zero, and the database caught it: migration 018 constrains this column
      // to null or a positive number, precisely so that "not applicable" and
      // "ran nothing" cannot be written as the same value.
      generation_steps: result.steps,
      // No prompt, and that is the request as it was actually sent. The chosen
      // model takes `positivePrompt` only to disambiguate a garment reference
      // showing several items, and ours show one.
      generation_prompt: null,
      parent_asset_id: garment_asset_id,
      // Migración 019. The other half of the lineage.
      person_asset_id,
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

  // **The cursor does not move, and that is the difference from the other two
  // routes.** A try-on is something to show, not something to keep editing:
  // moving the design onto it would point the next mask at a photograph of a
  // person. The design stays standing on its garment.

  // The status does move, for the same reason it does elsewhere: a design that
  // has produced a presentation is no longer a draft. Only ever from 'draft',
  // because 'completed' records a decision nothing automatic may undo.
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
