"""
Tiempo y costo de generación por modelo, desde la tabla `assets`.

Respalda las cifras de tiempo y costo de generación del trabajo de graduación. SOLO LEE: una consulta GET a la API
REST de Supabase. No escribe en la base, no toca R2 y no llama a Runware.

Toma solo las generaciones reales (`origin = 'generated'` con un modelo `runware:*`
o `prunaai:*`), porque las del simulador guardan un costo inventado. La latencia es
`generation_latency_ms`: del pedido a Runware a su respuesta, sin la espera de R2.

Uso:

    python herramientas/metricas_generacion.py              # tabla resumen
    python herramientas/metricas_generacion.py --detalle    # además, cada llamada con su fecha
"""

from __future__ import annotations

import argparse
import collections
import json
import statistics
import sys
import urllib.request

from r2_vs_db import ENV, leer_env


def tarea_de(fila: dict) -> str:
    if fila["generation_model"] == "runware:101@1":
        return "persona" if fila["asset_type"] == "model_photo" else "dibujar"
    return fila["asset_type"]


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--detalle", action="store_true")
    args = parser.parse_args()

    env = leer_env(ENV)
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    llave = env["SUPABASE_SECRET_KEY"]
    pedido = urllib.request.Request(
        url + "/rest/v1/assets?origin=eq.generated"
        "&select=created_at,asset_type,generation_model,generation_latency_ms,"
        "cost_usd,width_px,height_px,generation_steps,generation_strength"
        "&order=created_at.asc",
        headers={"apikey": llave, "Authorization": "Bearer " + llave},
    )
    filas = json.load(urllib.request.urlopen(pedido))

    reales = [f for f in filas if (f["generation_model"] or "").startswith(("runware:", "prunaai:"))]
    con_latencia = [f for f in reales if f["generation_latency_ms"]]
    print(f"\n  generadas {len(filas)} · reales {len(reales)} · con latencia {len(con_latencia)}\n")

    grupos: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    for f in con_latencia:
        grupos[(f["generation_model"], tarea_de(f))].append(f)

    print(f"  {'modelo':<24} {'tarea':<12} {'n':>3} {'mín':>7} {'mediana':>8} {'máx':>7}  costos")
    for (modelo, tarea), fs in sorted(grupos.items()):
        lat = sorted(x["generation_latency_ms"] / 1000 for x in fs)
        costos = sorted({x["cost_usd"] for x in fs})
        print(f"  {modelo:<24} {tarea:<12} {len(fs):>3} {lat[0]:>6.1f}s "
              f"{statistics.median(lat):>7.1f}s {lat[-1]:>6.1f}s  {costos}")

    if args.detalle:
        for (modelo, tarea), fs in sorted(grupos.items()):
            print(f"\n  === {modelo} · {tarea}")
            for f in fs:
                print(f"    {f['created_at'][:16].replace('T', ' ')} UTC  "
                      f"{f['width_px']}x{f['height_px']}  pasos={f['generation_steps']} "
                      f"int={f['generation_strength']}  "
                      f"{f['generation_latency_ms'] / 1000:5.1f}s  ${f['cost_usd']}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
