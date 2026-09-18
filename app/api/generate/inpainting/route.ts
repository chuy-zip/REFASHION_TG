import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { getReadUrl, getUploadUrl, getDownloadUrl } from "@/lib/r2";
import { resolveDesignPath } from "@/lib/designs";
import { assetDisplayName } from "@/lib/assets";
import { getGenerationProvider } from "@/lib/generation";
import { resolveGenerationInputs } from "@/lib/generation/inputs";
import { composePrompt } from "@/lib/generation/prompt";
import { readPngSize } from "@/lib/png-size";
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
 *     verified below RLS — seventh time, APRENDIZAJES §2.5b);
 *   - **what size to send** is `snapToInferenceSize`, shared with the browser
 *     so a mask can never be painted at a size the request does not use;
 *   - **who generates** is `getGenerationProvider()`, which today is the
 *     simulator and tomorrow is Runware, without this file changing.
 *
 * Synchronous on purpose. An inpainting takes 5–20 s and Vercel allows up to
 * 300 s, so a queue, a webhook and a task table would be machinery for a
 * problem that does not exist yet (`FASE_2_INPAINTING` §5.4). If real latencies
 * come close to the limit, that is when it changes.
 */
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

  const { design_id, image_asset_id, mask_asset_id, intent, prompt, strength } =
    parsed.data;

  const supabase = await createSupabaseClient();

  // RLS hides designs the caller is not a member of, so "no path" is a 404 for
  // the same reason it is everywhere else in the app.
  const path = await resolveDesignPath(supabase, design_id);
  if (!path) return notFound("El diseño no existe.");

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
  const composed = composePrompt(intent, prompt);

  const provider = getGenerationProvider();
  const outcome = await provider.inpaint({
    imageUrl,
    maskUrl,
    size,
    prompt: composed,
    intent,
    strength,
  });

  // A failed generation is not charged and nothing is written: the design is
  // left exactly as it was, which is what lets the user just press again.
  if (!outcome.ok) return jsonError(outcome.error, 502);

  const result = outcome.data;

  // Lo que de verdad volvió. Si no se puede leer se cae a lo pedido, que es la
  // mejor suposición disponible — pero se intenta medir primero.
  const entregado = readPngSize(await result.image.arrayBuffer());

  // The same three-step upload the browser does, run here because the bytes are
  // already on this side. Presigning our own URL rather than adding a "put
  // object" helper keeps one way of writing to R2 — and it is the exact shape
  // Runware's `uploadEndpoint` will take when it writes the result itself.
  const assetId = crypto.randomUUID();
  const r2Key = `clients/${path.clientId}/projects/${path.projectId}/designs/${design_id}/${assetId}.png`;

  const uploadUrl = await getUploadUrl(r2Key, "image/png");
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: result.image,
  });

  if (!put.ok) {
    return jsonError("No se pudo guardar la imagen generada.", 502);
  }

  const { data, error } = await supabase
    .from("assets")
    .insert({
      id: assetId,
      design_id,
      r2_key: r2Key,
      asset_type: "inpainting",
      original_filename: `${intent}-${Date.now()}.png`,
      mime_type: "image/png",
      file_size_bytes: result.image.size,
      // MEDIDO, no supuesto. Antes decía `size.width`, o sea el tamaño que se
      // pidió: con el simulador es cierto por construcción, con un proveedor
      // real es una suposición, y una medida falsa acá alimenta el encajado del
      // paso siguiente. `readPngSize` lee la cabecera del PNG y no necesita
      // ninguna librería de imágenes en el servidor.
      width_px: entregado?.width ?? size.width,
      height_px: entregado?.height ?? size.height,
      // 'generated' is reserved for images that cost money and came out of a
      // model (FASE_1_5 §3.1). The simulator claims it too, because everything
      // downstream — the strip, the running total, the lineage — has to behave
      // exactly as it will with the real provider.
      origin: "generated",
      runware_task_id: result.taskId,
      cost_usd: result.costUsd,
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
      // result whose mask cannot be identified is not reproducible, which is
      // what §7 needs it to be.
      //
      // It also turns the leak into something findable: the mask is uploaded
      // *before* the provider is called, so a failed generation leaves one
      // behind. With this column, a mask no row points at is orphaned by
      // definition.
      mask_asset_id,
    })
    .select()
    .single();

  if (error) return translateDbError(error);

  const created = data as Asset;

  // The cursor follows the generation: what the user just made is what they are
  // now working on. Going back is a separate, explicit act (FASE_1_5 §7.4).
  // Best effort — the image is already registered and a failure here must not
  // undo that.
  await supabase
    .from("designs")
    .update({ current_asset_id: assetId })
    .eq("id", design_id);

  // Only ever from 'draft': 'completed' records a decision the user made and
  // nothing automatic may undo it (APRENDIZAJES §3.9). Separate statement
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
