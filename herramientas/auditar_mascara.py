"""
Mide qué cambió de verdad en una generación con máscara, y dónde.

POR QUÉ EXISTE. En la interfaz, "Textura" y "Forma" devolvían imágenes sin
cambios aparentes, y ahí se abren dos sospechas que se confunden a simple
vista: que la máscara esté mal (mal ubicada, vacía, invertida, de otro tamaño)
o que el modelo haya decidido no contradecir lo que ve debajo de ella. Mirar la
pantalla no las distingue. Esto sí.

QUÉ MIDE. Para cada generación con máscara, de la más nueva a la más vieja:

  * la máscara: cuánto del lienzo cubre, si es binaria de verdad, y si su
    tamaño coincide con el de la semilla;
  * el resultado contra su semilla, DENTRO de la máscara y FUERA de ella,
    por separado.

Esa separación es la prueba. Si adentro cambió poco y afuera nada, la máscara
llegó bien y el modelo eligió no cambiar: el problema es el modelo o el prompt.
Si adentro tampoco cambió nada pero la máscara está corrida o vacía, el
problema es la máscara y el modelo nunca tuvo la culpa.

SOLO LEE. No escribe en R2 ni en la base. Las imágenes se bajan a una carpeta
para poder mirarlas después.

Uso:

    python herramientas/auditar_mascara.py
    python herramientas/auditar_mascara.py --cuantas 12
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from r2_vs_db import ENV, RAIZ, leer_env

CAMPOS = (
    "id,r2_key,asset_type,design_id,created_at,width_px,height_px,"
    "mask_asset_id,parent_asset_id,generation_prompt,generation_model,"
    "generation_seed,generation_steps,cost_usd"
)


def consultar(url: str, secreto: str, ruta: str) -> list[dict]:
    pedido = urllib.request.Request(
        url + "/rest/v1/" + ruta,
        headers={"apikey": secreto, "Authorization": "Bearer " + secreto},
    )
    with urllib.request.urlopen(pedido, timeout=30) as respuesta:
        return json.loads(respuesta.read().decode("utf-8"))


def generaciones(url: str, secreto: str, cuantas: int) -> list[dict]:
    """Las últimas generaciones que llevan máscara, más nuevas primero."""
    consulta = urllib.parse.urlencode(
        {
            "select": CAMPOS,
            "asset_type": "eq.inpainting",
            "order": "created_at.desc",
            "limit": cuantas,
        }
    )
    return consultar(url, secreto, "assets?" + consulta)


def por_id(url: str, secreto: str, ids: list[str]) -> dict[str, dict]:
    if not ids:
        return {}
    consulta = urllib.parse.urlencode(
        {"select": CAMPOS, "id": "in.(" + ",".join(ids) + ")"}
    )
    return {
        fila["id"]: fila for fila in consultar(url, secreto, "assets?" + consulta)
    }


def cliente_r2(env: dict[str, str]):
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=env["R2_ENDPOINT"],
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def bajar(cliente, bucket: str, clave: str, destino: Path):
    destino.parent.mkdir(parents=True, exist_ok=True)
    if destino.exists():
        return destino
    try:
        cliente.download_file(bucket, clave, str(destino))
    except Exception as error:  # noqa: BLE001 - se informa y se sigue
        print("      no se pudo bajar " + clave + ": " + type(error).__name__)
        return None
    return destino


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cuantas", type=int, default=5)
    args = parser.parse_args()

    import numpy as np
    from PIL import Image

    env = leer_env(ENV)
    faltantes = [
        n
        for n in (
            "NEXT_PUBLIC_SUPABASE_URL",
            "SUPABASE_SECRET_KEY",
            "R2_ENDPOINT",
            "R2_ACCESS_KEY_ID",
            "R2_SECRET_ACCESS_KEY",
            "R2_BUCKET",
        )
        if not env.get(n)
    ]
    if faltantes:
        sys.exit("Faltan variables en .env.local: " + ", ".join(faltantes))

    carpeta = RAIZ / "herramientas" / "auditoria_mascaras"
    cliente = cliente_r2(env)
    bucket = env["R2_BUCKET"]
    url = env["NEXT_PUBLIC_SUPABASE_URL"]
    secreto = env["SUPABASE_SECRET_KEY"]

    filas = generaciones(url, secreto, args.cuantas)
    print("\nGeneraciones con mascara encontradas: " + str(len(filas)))

    referidos = [f["mask_asset_id"] for f in filas if f.get("mask_asset_id")]
    referidos += [f["parent_asset_id"] for f in filas if f.get("parent_asset_id")]
    otros = por_id(url, secreto, sorted(set(referidos)))

    for numero, fila in enumerate(filas, start=1):
        print("\n" + "=" * 78)
        print("[" + str(numero) + "] " + fila["created_at"] + "   " + fila["id"][:8])
        prompt = (fila.get("generation_prompt") or "").replace("\n", " ")
        print("  prompt   : " + prompt[:150])
        print(
            "  modelo   : "
            + str(fila.get("generation_model"))
            + "   pasos "
            + str(fila.get("generation_steps"))
            + "   semilla "
            + str(fila.get("generation_seed"))
            + "   costo "
            + str(fila.get("cost_usd"))
        )
        print(
            "  tamano   : "
            + str(fila.get("width_px"))
            + " x "
            + str(fila.get("height_px"))
        )

        mascara_fila = otros.get(fila.get("mask_asset_id") or "")
        semilla_fila = otros.get(fila.get("parent_asset_id") or "")
        if not mascara_fila:
            print("  SIN MASCARA registrada (mask_asset_id vacio)")
            continue
        if not semilla_fila:
            print("  SIN SEMILLA registrada (parent_asset_id vacio)")
            continue

        base = carpeta / fila["id"][:8]
        m = bajar(cliente, bucket, mascara_fila["r2_key"], base / "mascara.png")
        s = bajar(cliente, bucket, semilla_fila["r2_key"], base / "semilla.png")
        r = bajar(cliente, bucket, fila["r2_key"], base / "resultado.png")
        if not (m and s and r):
            continue

        mascara = Image.open(m).convert("L")
        semilla = Image.open(s).convert("RGB")
        result = Image.open(r).convert("RGB")

        print(
            "  mascara  : "
            + str(mascara.size)
            + "   semilla "
            + str(semilla.size)
            + "   resultado "
            + str(result.size)
        )

        mask = np.asarray(mascara, dtype=np.float32) / 255.0
        cubierto = float((mask > 0.5).mean()) * 100.0
        grises = float(((mask > 0.02) & (mask < 0.98)).mean()) * 100.0
        print(
            "  cobertura: %.2f%% del lienzo en blanco   gris intermedio %.2f%%"
            % (cubierto, grises)
        )

        # La ruta encaja el pedido a un tamano valido de inferencia, que no
        # siempre es el de la semilla: el proveedor escala la semilla y la
        # mascara por su cuenta. Para comparar hay que hacer lo mismo de este
        # lado, si no la unica lectura posible seria "no se puede comparar", que
        # es justo lo que no sirve.
        if semilla.size != result.size:
            print("  (semilla reescalada de %s a %s para comparar)"
                  % (semilla.size, result.size))
            semilla = semilla.resize(result.size, Image.LANCZOS)
        if mascara.size != result.size:
            mascara = mascara.resize(result.size, Image.NEAREST)
        mask = np.asarray(mascara, dtype=np.float32) / 255.0

        a = np.asarray(semilla, dtype=np.float32)
        b = np.asarray(result, dtype=np.float32)
        dif = np.abs(a - b).mean(axis=2)

        dentro = mask > 0.5
        fuera = ~dentro
        if dentro.any():
            print(
                "  DENTRO   : media %6.2f / 255   maxima %6.2f   "
                "cambiaron mas de 8: %.1f%%"
                % (
                    dif[dentro].mean(),
                    dif[dentro].max(),
                    float((dif[dentro] > 8).mean()) * 100,
                )
            )
        if fuera.any():
            print(
                "  FUERA    : media %6.2f / 255   maxima %6.2f   "
                "cambiaron mas de 8: %.1f%%"
                % (
                    dif[fuera].mean(),
                    dif[fuera].max(),
                    float((dif[fuera] > 8).mean()) * 100,
                )
            )

    print("\nImagenes en " + str(carpeta) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
