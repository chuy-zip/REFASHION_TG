import "server-only";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
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
