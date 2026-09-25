import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import {
  catalogAssetKey,
  discardObject,
  getDownloadUrl,
  getReadUrl,
  getUploadUrl,
} from "@/lib/r2";
import { storeGeneratedImage } from "@/lib/generation/store";
import { getClientAccess } from "@/lib/access";
import { assetDisplayName } from "@/lib/assets";
import { getGenerationProvider } from "@/lib/generation";
import { newSeed } from "@/lib/generation/seed";
import { generateModelSchema } from "@/lib/validation";
import {
  jsonError,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import type { Asset } from "@/lib/types";

/**
 * POST /api/generate/model — a model photo drawn from a description.
 *
 * **It writes to the client's catalogue, not to a design**, and that is the
 * decision the whole route follows from. A generated person is reused across
 * every design of that client: paid once, chosen many times. Filing it under a
 * design would make the second design regenerate a person the first one already
 * bought.
 *
 * **Stored as `model_photo` with `origin: 'generated'`, not as `ai_model`.**
 * The schema has two axes and they answer different questions: the type says
 * *what the image is* and the origin says *how it was obtained*. A drawn person
 * is a model photo — everything that consumes model photos should see it — and
 * `generated` is what records that a model drew it. Giving it a type of its own
 * would have hidden it from the try-on picker, which reads model photos, and
 * would repeat the mistake a retracted migration already made for painting.
 *
 * Membership is checked with `getClientAccess` before anything is spent. RLS
 * would refuse the insert anyway, but only after the generation had been paid
 * for, which is the wrong order to find out.
 */

/** Measured at 3 s to 5 s, the fastest of the four paths. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = generateModelSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const { client_id, description } = parsed.data;

  const supabase = await createSupabaseClient();

  // Antes de gastar, no después: RLS rechazaría la inserción igual, pero para
  // entonces la generación ya estaría pagada.
  const access = await getClientAccess(supabase, client_id, user.id);
  if (!access.canEdit) {
    return jsonError(
      "No tienes permisos para crear modelos en este cliente.",
      403
    );
  }

  const seed = newSeed();

  // **La clave y su URL firmada se preparan ANTES de llamar**, porque el
  // proveedor necesita saber dónde escribir. Es la inversión que hace que los
  // bytes no vuelvan a pasar por acá: antes se pedía la imagen y después se
  // decidía dónde iba; ahora el destino viaja con el pedido.
  const assetId = crypto.randomUUID();
  const r2Key = catalogAssetKey(client_id, assetId, "png");
  const uploadTo = await getUploadUrl(r2Key, "image/png");

  const provider = getGenerationProvider();
  const outcome = await provider.generateModel({
    description,
    seed,
    uploadTo,
  });

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
      client_id,
      r2_key: r2Key,
      asset_type: "model_photo",
      original_filename: `modelo-${Date.now()}.png`,
      mime_type: "image/png",
      file_size_bytes: stored.measurement.bytes,
      width_px: stored.measurement.width,
      height_px: stored.measurement.height,
      origin: "generated",
      runware_task_id: result.taskId,
      cost_usd: result.costUsd,
      generation_seed: result.seed,
      generation_model: result.model,
      generation_steps: result.steps,
      generation_latency_ms: result.latencyMs,
      // Exactly the text that was sent, which on this path is exactly what the
      // user read on screen: there is no hidden frame around it.
      generation_prompt: description,
    })
    .select()
    .single();

  if (error) {
    await discardObject(r2Key);
    return translateDbError(error);
  }

  const created = data as Asset;

  return NextResponse.json(
    {
      ...created,
      url: await getReadUrl(created.r2_key),
      downloadUrl: await getDownloadUrl(
        created.r2_key,
        assetDisplayName(created)
      ),
      latency_ms: result.latencyMs,
      simulated: !provider.billable,
    },
    { status: 201 }
  );
}
