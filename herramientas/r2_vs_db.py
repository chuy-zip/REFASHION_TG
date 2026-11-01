"""
Compara lo que hay en R2 contra lo que dice la tabla `assets` de Supabase.

Es lo único del diagnóstico que SQL no puede contestar: los objetos viven en R2
y las filas en Postgres, y nada los mantiene en sincronía. Hay dos desajustes
posibles y no son igual de graves:

  * FILA SIN OBJETO  — roto. La interfaz va a pedir una URL firmada de algo que
    no existe y va a mostrar una imagen quebrada. Este es el que hay que buscar.

  * OBJETO SIN FILA  — desperdicio. Lo deja una subida que completó el PUT y
    falló al registrar. Invisible para la aplicación y barato de dejar ahí.

Vive en `herramientas/`, aparte del producto: la aplicación no lo importa. Lee el
`.env.local` de la raíz del repositorio, que tiene la llave secreta de Supabase y
que git ignora. El script no imprime sus valores.

SOLO LEE. No borra nada en R2 ni en la base, y no está preparado para hacerlo.

Uso, desde cualquier carpeta:

    python herramientas/r2_vs_db.py

Necesita `boto3` (ver `requirements.txt`). Las credenciales salen de `.env.local`,
en la raíz del repositorio: R2_* y SUPABASE_SECRET_KEY.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# La raíz del repositorio es la carpeta que contiene a `herramientas/`, se corra
# esto desde donde se corra.
RAIZ = Path(__file__).resolve().parent.parent
ENV = RAIZ / ".env.local"


def leer_env(ruta: Path) -> dict[str, str]:
    """
    Parser mínimo de .env: `CLAVE=valor`, sin sustituciones ni `export`.

    A propósito no usa python-dotenv. El archivo lo escribe una sola persona con
    un formato conocido, y una dependencia menos es una cosa menos que instalar
    en la máquina donde toque correr esto.
    """
    if not ruta.exists():
        sys.exit(f"No encontré {ruta}. ¿Estás en el proyecto correcto?")

    valores: dict[str, str] = {}
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        valores[clave.strip()] = valor.strip().strip('"').strip("'")
    return valores


def claves_en_supabase(url: str, secreto: str) -> dict[str, dict]:
    """
    Todas las filas de `assets`, paginadas.

    Usa la llave secreta y por lo tanto **salta el RLS**: acá el objetivo es
    justamente ver todo, incluido lo que ningún usuario alcanza. Es también el
    motivo por el que este archivo no vive dentro del repo.
    """
    filas: dict[str, dict] = {}
    paso = 1000
    desde = 0

    while True:
        consulta = urllib.parse.urlencode(
            {
                "select": "id,r2_key,asset_type,design_id,created_at",
                "order": "r2_key.asc",
                "limit": paso,
                "offset": desde,
            }
        )
        pedido = urllib.request.Request(
            f"{url.rstrip('/')}/rest/v1/assets?{consulta}",
            headers={
                "apikey": secreto,
                "Authorization": f"Bearer {secreto}",
                "Accept": "application/json",
            },
        )

        try:
            with urllib.request.urlopen(pedido, timeout=30) as respuesta:
                lote = json.loads(respuesta.read())
        except urllib.error.HTTPError as error:
            sys.exit(f"Supabase respondió {error.code}: {error.read()[:300]!r}")

        for fila in lote:
            filas[fila["r2_key"]] = fila

        if len(lote) < paso:
            return filas
        desde += paso


def claves_en_r2(env: dict[str, str]) -> dict[str, int]:
    """Todas las claves del bucket, con su tamaño."""
    import boto3  # importado acá para que el error de falta se lea claro

    cliente = boto3.client(
        "s3",
        endpoint_url=env["R2_ENDPOINT"],
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",  # R2 no usa regiones, pero boto3 exige una
    )

    objetos: dict[str, int] = {}
    pagina = cliente.get_paginator("list_objects_v2")
    for bloque in pagina.paginate(Bucket=env["R2_BUCKET"]):
        for objeto in bloque.get("Contents", []):
            objetos[objeto["Key"]] = objeto["Size"]
    return objetos


def main() -> int:
    # La consola de Windows arranca en una codepage que no es UTF-8, y sin esto
    # los acentos y las rayas salen como basura.
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    env = leer_env(ENV)

    faltantes = [
        nombre
        for nombre in (
            "NEXT_PUBLIC_SUPABASE_URL",
            "SUPABASE_SECRET_KEY",
            "R2_ENDPOINT",
            "R2_ACCESS_KEY_ID",
            "R2_SECRET_ACCESS_KEY",
            "R2_BUCKET",
        )
        if not env.get(nombre)
    ]
    if faltantes:
        sys.exit("Faltan variables en .env.local: " + ", ".join(faltantes))

    print(f"Leyendo {ENV.relative_to(RAIZ)}…")
    filas = claves_en_supabase(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SECRET_KEY"])
    print(f"  assets en Supabase : {len(filas)}")

    objetos = claves_en_r2(env)
    print(f"  objetos en R2      : {len(objetos)}")

    en_ambos = filas.keys() & objetos.keys()
    solo_base = sorted(filas.keys() - objetos.keys())
    solo_r2 = sorted(objetos.keys() - filas.keys())

    print(f"  coinciden          : {len(en_ambos)}\n")

    # Lo grave primero, porque es lo que se ve roto en pantalla.
    print("=" * 74)
    if solo_base:
        print(f"ROTO — {len(solo_base)} fila(s) sin objeto en R2")
        print("La app va a firmar una URL de algo que no existe: imagen quebrada.\n")
        for clave in solo_base:
            fila = filas[clave]
            print(f"  {fila['asset_type']:<14} {fila['created_at'][:19]}  {clave}")
            print(f"  {'':14} id {fila['id']}  design {fila['design_id']}")
    else:
        print("ROTO — ninguna. Toda fila de `assets` tiene su objeto en R2.")
    print("=" * 74)

    print()
    if solo_r2:
        desperdicio = sum(objetos[c] for c in solo_r2)
        print(f"DESPERDICIO — {len(solo_r2)} objeto(s) sin fila, {desperdicio / 1024:.0f} kB")
        print("Subidas que completaron el PUT y fallaron al registrar. Invisibles.\n")
        for clave in solo_r2:
            print(f"  {objetos[clave] / 1024:8.0f} kB  {clave}")
    else:
        print("DESPERDICIO — ninguno. Todo objeto en R2 tiene su fila.")

    # Distinto de cero solo para el caso grave: el desperdicio no es un fallo.
    return 1 if solo_base else 0


if __name__ == "__main__":
    raise SystemExit(main())
