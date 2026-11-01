"""
Firma una URL temporal de lectura para un objeto de R2, para poder pasársela a
Runware desde la CLI sin levantar la aplicación.

Existe por una razón concreta: los objetos de R2 son privados, así que la app
los sirve con URLs prefirmadas que caducan. Eso funciona perfecto en producción
—Runware acepta una URL cualquiera, y una prefirmada lo es durante la hora que
vive— pero para una prueba manual desde la terminal hacía falta poder firmar una
sin pasar por la app. Esto es eso, y nada más.

También lista los assets de un diseño, que es como se encuentra el par
imagen+máscara que quiere probarse.

SOLO LEE. No sube, no borra, no modifica nada.

Uso:

    # ver qué assets tiene un diseño
    python herramientas/r2_url.py --design <uuid-del-diseño>

    # firmar la URL de uno
    python herramientas/r2_url.py --asset <uuid-del-asset>
    python herramientas/r2_url.py --key clients/.../algo.png

    # cuánto dura la firma (por omisión, una hora)
    python herramientas/r2_url.py --asset <uuid> --minutos 180
"""

from __future__ import annotations

import argparse
import sys

from r2_vs_db import ENV, RAIZ, leer_env  # mismo parser, mismas credenciales


def cliente_r2(env: dict[str, str]):
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=env["R2_ENDPOINT"],
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def consultar(env: dict[str, str], recurso: str, params: dict) -> list[dict]:
    """Una consulta a PostgREST con la llave secreta. Salta el RLS a propósito."""
    import json
    import urllib.error
    import urllib.parse
    import urllib.request

    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    consulta = urllib.parse.urlencode(params)
    pedido = urllib.request.Request(
        f"{url}/rest/v1/{recurso}?{consulta}",
        headers={
            "apikey": env["SUPABASE_SECRET_KEY"],
            "Authorization": f"Bearer {env['SUPABASE_SECRET_KEY']}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(pedido, timeout=30) as respuesta:
            return json.loads(respuesta.read())
    except urllib.error.HTTPError as error:
        sys.exit(f"Supabase respondió {error.code}: {error.read()[:300]!r}")


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    grupo = parser.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--design", help="lista los assets de este diseño")
    grupo.add_argument("--asset", help="firma la URL de este asset, por id")
    grupo.add_argument("--key", help="firma la URL de esta clave de R2")
    parser.add_argument(
        "--minutos", type=int, default=60, help="vigencia de la firma (default 60)"
    )
    args = parser.parse_args()

    env = leer_env(ENV)

    if args.design:
        filas = consultar(
            env,
            "assets",
            {
                "select": "id,asset_type,origin,width_px,height_px,created_at,r2_key",
                "design_id": f"eq.{args.design}",
                "order": "created_at.asc",
            },
        )
        if not filas:
            print("Ese diseño no tiene assets (o el id no existe).")
            return 1
        print(f"{len(filas)} asset(s):\n")
        for f in filas:
            medidas = (
                f"{f['width_px']}×{f['height_px']}"
                if f["width_px"] and f["height_px"]
                else "sin medidas"
            )
            print(f"  {f['asset_type']:<12} {f['origin']:<9} {medidas:>12}  {f['created_at'][:19]}")
            print(f"    id {f['id']}")
        print("\nFirmá el que quieras con:  --asset <id>")
        return 0

    clave = args.key
    if args.asset:
        filas = consultar(
            env, "assets", {"select": "r2_key,asset_type,width_px,height_px", "id": f"eq.{args.asset}"}
        )
        if not filas:
            sys.exit("No existe un asset con ese id.")
        clave = filas[0]["r2_key"]
        medidas = (
            f"{filas[0]['width_px']}×{filas[0]['height_px']}"
            if filas[0]["width_px"]
            else "sin medidas registradas"
        )
        print(f"# {filas[0]['asset_type']} · {medidas}", file=sys.stderr)

    url = cliente_r2(env).generate_presigned_url(
        "get_object",
        Params={"Bucket": env["R2_BUCKET"], "Key": clave},
        ExpiresIn=args.minutos * 60,
    )
    print(f"# vence en {args.minutos} min", file=sys.stderr)
    # La URL sola en stdout, para poder canalizarla o copiarla sin recortar nada.
    print(url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
