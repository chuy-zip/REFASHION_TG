"""
Llamadas reales de inpainting a Runware, para separar causas en vez de adivinar.

QUÉ PASÓ ANTES. La primera llamada (16-sep, $0.0013) respetó la máscara y dejó
el fondo intacto —la alineación funciona— pero **no cambió el color**: repintó
la camisa entera y la dejó negra. La sospecha es que `lib/generation/prompt.ts`
está escrito para el modelo equivocado: manda una **orden** ("cambia únicamente
el color…") y un modelo de inpainting no obedece órdenes, sino que **pinta lo
que el prompt describe**. Los conceptos visuales más fuertes de esa frase son
"prenda", "tejido" y "pliegues", y eso fue lo que pintó.

Pero hay tres sospechosos y una sola llamada no los separa:

  1. la **forma** del prompt: orden contra descripción;
  2. el **idioma**: FLUX usa codificadores entrenados sobre todo en inglés;
  3. la **intensidad**: 0.85 con la prenda entera enmascarada es "reemplazá casi
     todo", y sin contexto dentro de la región el modelo se apoya en lo que ve
     alrededor.

LA MATRIZ. `--matriz` corre cuatro combinaciones que aíslan **una** variable por
comparación, en vez de cambiar tres cosas a la vez y no saber cuál sirvió:

    A  descriptivo  es  0.85        A vs D  ->  aísla la FORMA
    B  descriptivo  en  0.85        A vs B  ->  aísla el IDIOMA
    C  descriptivo  en  0.45        B vs C  ->  aísla la INTENSIDAD
    D  orden        en  0.85

Cuatro llamadas, ~$0.005. La tabla que sale es material del capítulo de
Resultados y además decide cómo hay que reescribir `prompt.ts`.

CUESTA DINERO. No corre sin `--confirmar`.

Uso:

    python herramientas/probar_inpaint.py --design <uuid>                       # ensayo
    python herramientas/probar_inpaint.py --design <uuid> --matriz --confirmar
    python herramientas/probar_inpaint.py --design <uuid> --confirmar \
        --forma descriptivo --idioma en --strength 0.45
"""

from __future__ import annotations

import argparse
import io as _io
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from r2_url import cliente_r2, consultar
from r2_vs_db import ENV, leer_env

API = "https://api.runware.ai/v1"
MODELO = "runware:102@1"  # FLUX.1 Fill [dev]

IMAGEN_POR_OMISION = "64ffd2fd-45ff-44d5-93be-b911a44417e5"
MASCARA_POR_OMISION = "df763bbc-5fed-40d7-9196-fa7a7d3a5913"

# Espejo de `lib/generation/dimensions.ts`. El modelo solo genera en múltiplos
# de 64 ("multipleOf": 64 en su esquema), entre 128 y 2048.
PASO, MINIMO, MAXIMO = 64, 128, 2048

# Lo que costó la primera llamada a este tamaño, para estimar antes de gastar.
COSTO_ESTIMADO = 0.0013


def encajar(ancho: int, alto: int) -> tuple[int, int]:
    mayor = max(ancho, alto)
    escala = MAXIMO / mayor if mayor > MAXIMO else 1

    def lado(v: float) -> int:
        return min(MAXIMO, max(MINIMO, round(v / PASO) * PASO))

    return lado(ancho * escala), lado(alto * escala)


def prompt_de(forma: str, idioma: str, color_es: str, color_en: str) -> str:
    """
    Los cuatro textos.

    `orden/es` es literalmente lo que compone `lib/generation/prompt.ts` hoy,
    palabra por palabra. Cambiarlo mediría otra cosa: el punto del experimento
    es saber si **ese** texto es el problema.

    Los descriptivos dicen QUÉ debe haber, no qué hacerle: sustantivo con
    adjetivos y ningún verbo de instrucción. Es como se le habla a un modelo de
    inpainting, que rellena la región con lo que el prompt describe.
    """
    if forma == "orden":
        if idioma == "es":
            return (
                f"Cambia únicamente el color de esta zona de la prenda a {color_es}, "
                "conservando los pliegues, las sombras y la textura del tejido."
            )
        return (
            f"Change only the color of this area of the garment to {color_en}, "
            "preserving the folds, the shadows and the fabric texture."
        )

    if idioma == "es":
        return (
            f"camiseta {color_es}, tela de algodón, pliegues suaves y sombras "
            "naturales, fondo blanco"
        )
    return (
        f"a {color_en} t-shirt, cotton fabric, soft folds and natural shading, "
        "white background"
    )


def asset(env, asset_id: str) -> dict:
    filas = consultar(
        env,
        "assets",
        {"select": "id,asset_type,r2_key,width_px,height_px", "id": f"eq.{asset_id}"},
    )
    if not filas:
        sys.exit(f"No existe un asset con id {asset_id}.")
    return filas[0]


def par_del_diseno(env, design_id: str) -> tuple[str, str]:
    """
    La máscara más reciente del diseño y la imagen sobre la que se pintó.

    "Sobre la que se pintó" es su `parent_asset_id`, que es un dato registrado y
    no una deducción por hora — que es justo lo que la migración 017 vino a
    eliminar.
    """
    filas = consultar(
        env,
        "assets",
        {
            "select": "id,parent_asset_id,created_at",
            "design_id": f"eq.{design_id}",
            "asset_type": "eq.mask",
            "order": "created_at.desc",
            "limit": "1",
        },
    )
    if not filas:
        sys.exit(
            "Ese diseño no tiene ninguna máscara. Pintá una en la app y generá "
            "(el simulador es gratis) para que se suba a R2."
        )
    if not filas[0]["parent_asset_id"]:
        sys.exit("Esa máscara no dice sobre qué imagen se pintó.")
    return filas[0]["parent_asset_id"], filas[0]["id"]


def firmar(env, clave: str, minutos: int = 60) -> str:
    return cliente_r2(env).generate_presigned_url(
        "get_object",
        Params={"Bucket": env["R2_BUCKET"], "Key": clave},
        ExpiresIn=minutos * 60,
    )


def medir(datos: bytes) -> tuple[int, int] | None:
    from PIL import Image

    try:
        with Image.open(_io.BytesIO(datos)) as imagen:
            return imagen.size
    except Exception:
        return None


def bajar(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as respuesta:
        return respuesta.read()


def llamar(env, tarea: dict) -> tuple[dict | None, float, str | None]:
    """Devuelve (resultado, segundos, error). Un rechazo NO se cobra."""
    pedido = urllib.request.Request(
        API,
        method="POST",
        data=json.dumps([tarea]).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {env['RUNWARE_API_KEY']}",
        },
    )
    comenzo = time.monotonic()
    try:
        with urllib.request.urlopen(pedido, timeout=300) as respuesta:
            cuerpo = json.loads(respuesta.read())
    except urllib.error.HTTPError as error:
        detalle = error.read().decode("utf-8", "replace")[:600]
        return None, time.monotonic() - comenzo, detalle

    tardo = time.monotonic() - comenzo
    if "errors" in cuerpo:
        return None, tardo, json.dumps(cuerpo["errors"], ensure_ascii=False)[:600]
    return cuerpo["data"][0], tardo, None


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirmar", action="store_true", help="llama de verdad y gasta")
    parser.add_argument("--matriz", action="store_true", help="las cuatro combinaciones")
    parser.add_argument("--design", help="elige solo el par más reciente de este diseño")
    parser.add_argument("--imagen", default=IMAGEN_POR_OMISION)
    parser.add_argument("--mascara", default=MASCARA_POR_OMISION)
    parser.add_argument("--forma", choices=["orden", "descriptivo"], default="orden")
    parser.add_argument("--idioma", choices=["es", "en"], default="es")
    parser.add_argument("--color-es", default="azul marino")
    parser.add_argument("--color-en", default="navy blue")
    parser.add_argument("--strength", type=float, default=0.85)
    parser.add_argument("--steps", type=int, default=28)
    parser.add_argument("--salida", default="resultados")
    args = parser.parse_args()

    env = leer_env(ENV)
    if not env.get("RUNWARE_API_KEY"):
        sys.exit("Falta RUNWARE_API_KEY en .env.local")

    if args.design:
        args.imagen, args.mascara = par_del_diseno(env, args.design)

    imagen = asset(env, args.imagen)
    mascara = asset(env, args.mascara)
    ancho, alto = encajar(imagen["width_px"], imagen["height_px"])

    corridas = (
        [
            ("A", "descriptivo", "es", 0.85),
            ("B", "descriptivo", "en", 0.85),
            ("C", "descriptivo", "en", 0.45),
            ("D", "orden", "en", 0.85),
        ]
        if args.matriz
        else [("-", args.forma, args.idioma, args.strength)]
    )

    print(f"  seedImage : {imagen['asset_type']}  {imagen['width_px']}×{imagen['height_px']}")
    print(f"  maskImage : {mascara['asset_type']}  {mascara['width_px']}×{mascara['height_px']}")
    print(f"  lienzo    : {ancho}×{alto}   (encajado a múltiplos de 64)")
    coinciden = (mascara["width_px"], mascara["height_px"]) == (
        imagen["width_px"],
        imagen["height_px"],
    )
    print(
        "  ✅ la máscara mide como la imagen"
        if coinciden
        else "  ⚠️  la máscara NO mide como la imagen: es vieja, pintala de nuevo"
    )
    print()

    for etiqueta, forma, idioma, strength in corridas:
        print(f"  [{etiqueta}] {forma:<12} {idioma}  strength {strength}")
        print(f"       {prompt_de(forma, idioma, args.color_es, args.color_en)}")

    if not args.confirmar:
        print(
            f"\nENSAYO — no se llamó a nadie. {len(corridas)} llamada(s) costarían "
            f"~${COSTO_ESTIMADO * len(corridas):.4f}."
        )
        return 0

    carpeta = Path(args.salida)
    carpeta.mkdir(parents=True, exist_ok=True)
    marca = time.strftime("%Y%m%d-%H%M%S")
    resumen = []

    print()
    for etiqueta, forma, idioma, strength in corridas:
        tarea = {
            "taskType": "imageInference",
            "taskUUID": str(uuid.uuid4()),
            "model": MODELO,
            "positivePrompt": prompt_de(forma, idioma, args.color_es, args.color_en),
            "seedImage": firmar(env, imagen["r2_key"]),
            "maskImage": firmar(env, mascara["r2_key"]),
            "width": ancho,
            "height": alto,
            "strength": strength,
            "steps": args.steps,
            "numberResults": 1,
            "outputFormat": "PNG",
            "includeCost": True,
        }

        resultado, tardo, error = llamar(env, tarea)
        if error:
            print(f"  [{etiqueta}] FALLÓ en {tardo:.1f}s — no se cobró")
            print(f"       {error}")
            resumen.append((etiqueta, None))
            continue

        datos = bajar(resultado["imageURL"])
        nombre = f"{marca}-{etiqueta}-{forma}-{idioma}-s{strength}.png"
        (carpeta / nombre).write_bytes(datos)

        print(
            f"  [{etiqueta}] {tardo:4.1f}s  ${resultado.get('cost')}  "
            f"{medir(datos)}  ->  {nombre}"
        )
        resumen.append((etiqueta, resultado.get("cost")))

    # Los originales una sola vez, para comparar contra los cuatro.
    (carpeta / f"{marca}-00-prenda-original.png").write_bytes(
        bajar(firmar(env, imagen["r2_key"]))
    )
    (carpeta / f"{marca}-00-mascara.png").write_bytes(
        bajar(firmar(env, mascara["r2_key"]))
    )

    total = sum(c or 0 for _, c in resumen)
    print(f"\n  gastado: ${total:.4f}   originales guardados como {marca}-00-*")
    print(f"  todo en {carpeta.resolve()}")

    if args.matriz:
        print("\n  Cómo leer la tabla:")
        print("    A vs D  ->  ¿importa la FORMA del prompt? (descripción contra orden)")
        print("    A vs B  ->  ¿importa el IDIOMA?")
        print("    B vs C  ->  ¿importa la INTENSIDAD?")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
