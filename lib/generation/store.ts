import "server-only";
import { getUploadUrl, measureObject, type ObjectMeasurement } from "@/lib/r2";

/**
 * Conseguir el resultado de una generación dentro de R2, y medirlo.
 *
 * **Existe para que la espera y su respaldo se escriban una vez.** Las cuatro
 * rutas de generación hacen exactamente lo mismo con el resultado —ponerlo en
 * el bucket y averiguar cuánto mide— y cuatro copias de un reintento con
 * respaldo son cuatro lugares donde el día que se arregle uno los otros tres
 * quedan atrás.
 *
 * ## Por qué hay que esperar
 *
 * Se le pasa a Runware una URL firmada en `uploadEndpoint` y **él escribe el
 * objeto directamente**, así que los bytes no pasan por esta función. Eso es lo
 * que evita bajar y volver a subir un megabyte por generación.
 *
 * Pero **la escritura es asíncrona, y eso no lo dice ninguna documentación**.
 * Cuando la respuesta de Runware llega, el objeto todavía no está en el bucket.
 * Se descubrió midiendo: una comprobación inmediata devolvió 404 y el objeto
 * apareció segundos después (`herramientas/probar_upload_endpoint.py`).
 *
 * De ahí el reintento con espera creciente. Los plazos son cortos a propósito:
 * lo medido fue cuestión de segundos, y esperar de más consume el presupuesto
 * de la ruta, que es el que decide si el usuario ve un mensaje o un corte.
 *
 * ## Por qué hay respaldo
 *
 * La respuesta sigue trayendo `imageURL` aunque se use `uploadEndpoint`, así
 * que si el objeto nunca aparece se baja de ahí y se sube como siempre. **El
 * peor caso de este camino es el camino anterior**, que es la única forma
 * aceptable de cambiar algo que ya funcionaba: una imagen que se pagó no se
 * pierde porque el atajo falló.
 */

/** Cuánto se espera antes de cada intento, en milisegundos. */
const ESPERAS = [400, 800, 1600, 3200] as const;

/**
 * Plazo de cada tramo del respaldo.
 *
 * Los tres presupuestos tienen que caber en el `maxDuration` de la ruta que
 * llama: 120 de inferencia (`TOTAL_BUDGET_MS` en `runware.ts`), 6 de espera, y
 * estos dos, 144 en el peor caso contra un techo de 150 en las cuatro rutas. El
 * peor caso es que el atajo falle **y** el respaldo tarde todo lo que puede.
 *
 * Hasta el 15-oct eran 35 de inferencia contra un techo de 60, salvo `edit`,
 * que tenía 120 desde el 30-sep. Se unificó cuando FLUX dev también se volvió
 * lento.
 */
const RESPALDO_TIMEOUT_MS = 9_000;

export type StoredImage =
  | { ok: true; measurement: ObjectMeasurement; viaFallback: boolean }
  | { ok: false; error: string };

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function storeGeneratedImage(
  r2Key: string,
  imageUrl: string,
  /**
   * El tipo con el que se firmó la subida, que es el que el proveedor entrega.
   *
   * Estaba fijo en `image/png` y dejó de ser cierto el día que las
   * generaciones pasaron a WEBP. Un respaldo que sube con el tipo equivocado
   * no falla: guarda el objeto con una etiqueta que miente, y eso se descubre
   * meses después en una descarga con la extensión que no corresponde.
   */
  mime: string
): Promise<StoredImage> {
  for (const espera of ESPERAS) {
    await dormir(espera);
    const measurement = await measureObject(r2Key);
    if (measurement) return { ok: true, measurement, viaFallback: false };
  }

  // No llegó. Se baja del proveedor y se sube como se hacía antes de todo esto.
  try {
    // Con plazo, los dos. Este camino corre cuando ya se gastaron los seis
    // segundos de espera, así que lo que queda del presupuesto de la ruta es
    // poco: un `fetch` sin plazo acá es un corte de Vercel sin mensaje.
    const respuesta = await fetch(imageUrl, {
      signal: AbortSignal.timeout(RESPALDO_TIMEOUT_MS),
    });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const imagen = await respuesta.blob();

    const destino = await getUploadUrl(r2Key, mime);
    const put = await fetch(destino, {
      method: "PUT",
      headers: { "Content-Type": mime },
      body: imagen,
      signal: AbortSignal.timeout(RESPALDO_TIMEOUT_MS),
    });
    if (!put.ok) throw new Error(`PUT ${put.status}`);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[generation] fallback upload failed:", error);
    }
    return {
      ok: false,
      error:
        "La imagen se generó pero no se pudo guardar. Esta generación sí se cobró. Vuelve a intentar.",
    };
  }

  const measurement = await measureObject(r2Key);
  if (!measurement) {
    return {
      ok: false,
      error:
        "La imagen se guardó pero no se pudo leer. Esta generación sí se cobró.",
    };
  }

  return { ok: true, measurement, viaFallback: true };
}
