/**
 * Cuánto mide esta imagen, preguntado en el servidor y sin decodificarla.
 *
 * `lib/image-size.ts` contesta lo mismo en el navegador, donde es barato porque
 * la imagen se va a decodificar igual. Acá no hay equivalente: este proyecto no
 * tiene librería de imágenes —ni `sharp` ni `jimp`— y sumar una para leer dos
 * números sería una dependencia grande por un dato chico.
 *
 * No hace falta. **Los dos formatos que este proyecto guarda declaran su tamaño
 * en los primeros bytes**, cada uno a su manera, y con leer 32 alcanza para los
 * dos. Eso es lo que permite medir un objeto de R2 con una petición de rango en
 * vez de descargarlo entero.
 *
 * ## Por qué dos formatos y no uno
 *
 * Hasta el 25-sep esto leía PNG y nada más, y estaba bien: todo lo que llegaba
 * acá lo producía la app o un proveedor al que se le pedía `outputFormat:
 * "PNG"`. Desde que las generaciones salen en WEBP conviven los dos, y van a
 * seguir conviviendo: **el simulador sigue armando PNG byte a byte** y las
 * máscaras las dibuja el navegador en PNG. Una fila vieja también es PNG, para
 * siempre.
 *
 * ## Dónde lo dice cada uno
 *
 * **PNG** lo dice en el bloque IHDR, que es siempre el primero y está en una
 * posición fija: ocho bytes de firma, cuatro de longitud, cuatro de tipo, y ahí
 * el ancho y el alto como enteros de 32 bits big-endian.
 *
 * **WEBP** es un contenedor RIFF y tiene tres variantes, cada una con las
 * medidas en otro lado y en otra codificación. Se verificaron las tres contra
 * archivos reales, y las que Runware devuelve son `VP8 `:
 *
 *   * `VP8 ` (con pérdida): 14 bits para cada lado, little-endian, en el byte
 *     26. Es lo que devolvieron los cuatro modelos medidos.
 *   * `VP8L` (sin pérdida): los dos lados empaquetados en 28 bits desde el byte
 *     21, y **menos uno**, porque el formato guarda "tamaño - 1".
 *   * `VP8X` (extendido, el que se usa con transparencia o animación): tres
 *     bytes por lado desde el 24, también menos uno.
 *
 * Las tres caen dentro de los primeros 32 bytes, que es lo que ya se pedía para
 * PNG. Por eso el cambio de formato no obligó a pedir más.
 */

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Byte donde empieza el ancho en un PNG: 8 de firma + 4 de longitud + 4 de tipo. */
const ANCHO_PNG_EN = 16;

export interface PixelSize {
  width: number;
  height: number;
}

function leerPng(vista: DataView): PixelSize | null {
  if (vista.byteLength < 24) return null;

  for (let i = 0; i < FIRMA_PNG.length; i += 1) {
    if (vista.getUint8(i) !== FIRMA_PNG[i]) return null;
  }

  // Big-endian, que es como el formato PNG guarda todos sus enteros.
  const width = vista.getUint32(ANCHO_PNG_EN, false);
  const height = vista.getUint32(ANCHO_PNG_EN + 4, false);
  return width > 0 && height > 0 ? { width, height } : null;
}

function leerWebp(vista: DataView): PixelSize | null {
  // 'RIFF' .... 'WEBP' y cuatro bytes más de tipo de bloque: 16 para saber
  // siquiera qué variante es, y 30 para haber leído las medidas de cualquiera.
  if (vista.byteLength < 30) return null;

  const marca = (desde: number, largo: number) =>
    String.fromCharCode(
      ...Array.from({ length: largo }, (_, i) => vista.getUint8(desde + i))
    );

  if (marca(0, 4) !== "RIFF" || marca(8, 4) !== "WEBP") return null;

  const variante = marca(12, 4);

  if (variante === "VP8 ") {
    // Los dos bits altos de cada valor son banderas de escala, no tamaño.
    const width = vista.getUint16(26, true) & 0x3fff;
    const height = vista.getUint16(28, true) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (variante === "VP8L") {
    // 14 bits para el ancho y 14 para el alto, seguidos, y guardados como
    // "tamaño - 1" porque no existe una imagen de lado cero.
    const empaquetado = vista.getUint32(21, true);
    const width = (empaquetado & 0x3fff) + 1;
    const height = ((empaquetado >> 14) & 0x3fff) + 1;
    return { width, height };
  }

  if (variante === "VP8X") {
    const tresBytes = (desde: number) =>
      vista.getUint8(desde) |
      (vista.getUint8(desde + 1) << 8) |
      (vista.getUint8(desde + 2) << 16);
    return { width: tresBytes(24) + 1, height: tresBytes(27) + 1 };
  }

  return null;
}

/**
 * Las medidas de un PNG o de un WEBP, o null si no es ninguno de los dos.
 *
 * Null y no un error: quien llama ya tiene un camino alternativo, y devolver
 * null lo deja tomarlo. Adivinar sería peor, porque de acá salen el ancho y el
 * alto que alimentan el encajado del paso siguiente de la cadena.
 */
export function readPixelSize(bytes: ArrayBuffer): PixelSize | null {
  if (bytes.byteLength < 24) return null;
  const vista = new DataView(bytes);
  return leerPng(vista) ?? leerWebp(vista);
}
