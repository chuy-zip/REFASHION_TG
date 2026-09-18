/**
 * How big is this PNG, asked on the server, without decoding it.
 *
 * `lib/image-size.ts` answers the same question in the browser, where it is
 * cheap because the image is about to be decoded anyway. On the server there is
 * no equivalent: this project has no image library — no `sharp`, no `jimp` —
 * and adding one to read two numbers would be a large dependency for a small
 * fact.
 *
 * It does not need one. A PNG states its size in the **IHDR chunk, which is
 * always the first one**, at a fixed offset: eight bytes of signature, four of
 * chunk length, four of type, then width and height as big-endian 32-bit
 * integers. Twenty-four bytes in and the answer is there, whatever the image
 * weighs.
 *
 * **Only PNG**, deliberately. Everything this reads is produced by the app or
 * by a provider asked for `outputFormat: "PNG"`, so a JPEG arriving here would
 * mean something upstream changed — and returning null then is better than
 * guessing, because the caller already has a sane fallback.
 */

const FIRMA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Byte donde empieza el ancho: 8 de firma + 4 de longitud + 4 de tipo. */
const ANCHO_EN = 16;

export interface PngSize {
  width: number;
  height: number;
}

export function readPngSize(bytes: ArrayBuffer): PngSize | null {
  // 24 es lo mínimo para tener firma, cabecera de chunk y las dos medidas.
  if (bytes.byteLength < 24) return null;

  const vista = new DataView(bytes);

  for (let i = 0; i < FIRMA.length; i += 1) {
    if (vista.getUint8(i) !== FIRMA[i]) return null;
  }

  // Big-endian, que es como el formato PNG guarda todos sus enteros.
  const width = vista.getUint32(ANCHO_EN, false);
  const height = vista.getUint32(ANCHO_EN + 4, false);

  // Un PNG de lado cero no existe; leerlo significa que esto no era un PNG.
  if (width === 0 || height === 0) return null;

  return { width, height };
}
