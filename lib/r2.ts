import "server-only";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { readPngSize } from "@/lib/png-size";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * R2 is S3-compatible: point the SDK's endpoint at the account's R2 URL and
 * use region "auto". Server-only — these credentials never reach the browser.
 */
function getClient() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;

  if (!accountId || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error(
      "Missing R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_ENDPOINT. Check .env.local"
    );
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket() {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error("Missing R2_BUCKET. Check .env.local");
  }
  return bucket;
}

/** Signed PUT URL the browser uses to upload the binary straight to R2. */
export async function getUploadUrl(
  key: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, { expiresIn: 300 });
}

/** Signed GET URL to display a private object (rendered inline, e.g. `<img>`). */
export async function getReadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: 3600 });
}

/**
 * RFC 6266/5987 Content-Disposition value: an ASCII fallback plus a UTF-8
 * encoded filename, so non-Latin file names still download correctly.
 */
function contentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Signed GET URL that forces a download instead of inline rendering, via
 * `ResponseContentDisposition` — R2 (S3-compatible) sends that header back
 * for this one request without touching the stored object. A plain
 * `<a href>` navigation to this URL isn't a fetch/XHR, so it needs no CORS
 * configuration on the bucket, unlike the presigned PUT upload.
 */
export async function getDownloadUrl(
  key: string,
  filename: string
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ResponseContentDisposition: contentDisposition(filename),
  });
  return getSignedUrl(getClient(), command, { expiresIn: 3600 });
}

export async function deleteObject(key: string): Promise<void> {
  const command = new DeleteObjectCommand({ Bucket: getBucket(), Key: key });
  await getClient().send(command);
}

/**
 * Drops an object we just wrote and can no longer account for.
 *
 * **Best effort, and it never throws.** It is called on a path that is already
 * failing, to clean up after that failure; letting it raise would replace a
 * useful error with a confusing one and tell the user nothing about what
 * actually went wrong.
 *
 * So the worst case is exactly today's behaviour: an object in R2 with no row
 * pointing at it, which `herramientas/r2_vs_db.py` finds and
 * `herramientas/limpiar_r2.py` removes. The point of this function is to make
 * that the rare case rather than the normal one.
 *
 * **Only ever call it with a key this same request created.** A key that came
 * from the client is a key that may belong to somebody else, and deleting one
 * of those on a failed request would turn a storage leak into a way to destroy
 * other people's images.
 */
export async function discardObject(key: string): Promise<void> {
  try {
    await deleteObject(key);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[r2] could not discard orphaned object:", key, error);
    }
  }
}

/**
 * Where an object lives in the bucket, in one place.
 *
 * **The shape is a contract between two routes**, and it used to be written
 * only in the one that hands keys out. `presign-upload` built the string and
 * `confirm` accepted whatever came back, which meant the second route trusted
 * the browser to return the first route's answer unchanged. It also meant the
 * shape could drift: a change in one had nothing to compare itself against.
 *
 * The two builders below and the check that follows them are the same fact,
 * written once.
 */
export function designAssetKey(
  clientId: string,
  projectId: string,
  designId: string,
  assetId: string,
  extension: string
): string {
  return `clients/${clientId}/projects/${projectId}/designs/${designId}/${assetId}.${extension}`;
}

export function catalogAssetKey(
  clientId: string,
  assetId: string,
  extension: string
): string {
  return `clients/${clientId}/catalog/${assetId}.${extension}`;
}

/**
 * Whether a key is one this server could have handed out for this owner.
 *
 * **Why it has to be checked at all.** `confirm` takes `r2_key` from the
 * browser. Without this, a caller could register a row pointing at *another
 * client's* object and then read it through a signed URL, which is a
 * disclosure and not merely untidy bookkeeping. It also made cleaning up after
 * a failed confirm impossible to do safely: deleting a key the caller named
 * would let anyone destroy someone else's image on demand.
 *
 * **It needs no extra query**, which is what makes it worth doing on the
 * upload path. The design id is already in the request and RLS has already
 * proven the caller may write to that design, so a key that sits inside that
 * design's folder is a key they own. The same holds for a client's catalogue.
 */
export function isAssetKeyForOwner(
  key: string,
  assetId: string,
  owner: { designId?: string; clientId?: string }
): boolean {
  const parts = key.split("/");
  const file = parts.at(-1) ?? "";

  const dot = file.lastIndexOf(".");
  if (dot <= 0) return false;
  if (file.slice(0, dot) !== assetId) return false;
  if (!/^[a-z0-9]+$/i.test(file.slice(dot + 1))) return false;

  // The design branch first, mirroring `presign-upload`: when both ids arrive,
  // the design is the one that decides where the object goes.
  if (owner.designId) {
    return (
      parts.length === 7 &&
      parts[0] === "clients" &&
      parts[2] === "projects" &&
      parts[4] === "designs" &&
      parts[5] === owner.designId
    );
  }

  if (owner.clientId) {
    return (
      parts.length === 4 &&
      parts[0] === "clients" &&
      parts[1] === owner.clientId &&
      parts[2] === "catalog"
    );
  }

  return false;
}

/**
 * Las medidas de un objeto sin bajarlo entero.
 *
 * **Treinta y dos bytes alcanzan**, y esa es toda la razón por la que esta
 * función existe. Un PNG declara su ancho y su alto en los primeros veinticuatro
 * (`lib/png-size.ts`), así que un `Range` los trae sin mover el megabyte que
 * pesa la imagen. Y el denominador del `Content-Range` que vuelve es el tamaño
 * total del archivo, o sea que la misma petición contesta las tres preguntas:
 * si el objeto está, cuánto mide y cuánto pesa.
 *
 * Verificado contra el proveedor real: un PNG de 512×512 subido por Runware
 * devolvió `bytes 0-31/787271` y midió exacto.
 *
 * Null cuando el objeto todavía no existe, que en el camino de generación es
 * información y no un fallo: Runware escribe de forma asíncrona.
 */
export interface ObjectMeasurement {
  width: number;
  height: number;
  bytes: number;
}

export async function measureObject(
  key: string
): Promise<ObjectMeasurement | null> {
  try {
    const salida = await getClient().send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Range: "bytes=0-31",
      })
    );

    const cabecera = await salida.Body?.transformToByteArray();
    if (!cabecera) return null;

    const size = readPngSize(
      cabecera.buffer.slice(
        cabecera.byteOffset,
        cabecera.byteOffset + cabecera.byteLength
      ) as ArrayBuffer
    );
    if (!size) return null;

    // `bytes 0-31/787271`: lo que importa es el denominador.
    const total = Number(salida.ContentRange?.split("/")[1]);
    if (!Number.isFinite(total) || total <= 0) return null;

    return { width: size.width, height: size.height, bytes: total };
  } catch {
    // Incluye el 404 de un objeto que todavía no llegó, que es el caso normal
    // mientras se espera. Distinguirlo de un fallo de red no cambiaría nada:
    // el que llama reintenta igual y después se rinde.
    return null;
  }
}
