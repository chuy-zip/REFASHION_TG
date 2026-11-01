"""
Experimento 2: separar lo que el experimento 1 no pudo separar.

EL PLAN COMPLETO ESTÁ EN `herramientas/docs/EXPERIMENTO_2_plan.md`. En corto: el
experimento 1 midió que FLUX Fill llegó a ~38% del cambio de color pedido,
pero después encontramos **cuatro diferencias entre lo que mandamos y lo que
declara el esquema del modelo**. Así que aquello prueba que no pudo *así*, no
que no pueda.

Las cuatro:

  1. Nunca mandamos `CFGScale`, que es la perilla de adherencia al prompt — y el
     esquema **no declara valor por omisión** para ella en este modelo. Es la
     única variable de la que ni sabemos con qué corrió. Además el esquema avisa
     que `negativePrompt` "se ignora cuando la guía está desactivada
     (CFGScale ≤ 1)", o sea que existe un régimen con la guía apagada.
  2. Mandamos `seedImage` y `maskImage` al nivel raíz; el esquema las declara
     dentro de un objeto `inputs`. Funcionó, pero no sabemos si se tratan igual.
  3. Nuestro prompt tiene doce palabras; los ejemplos oficiales del mismo modelo
     tienen ciento veinte.
  4. Generamos a 0.315 MP contra el megapíxel de esos ejemplos.

ES UNA ESCALERA, NO UNA MATRIZ. Cada caso agrega **una sola cosa** al anterior,
así que cada par adyacente atribuye. Seis llamadas en vez de las dieciséis del
producto cartesiano.

MIDE SOLO. Al terminar imprime la tabla de azulidad y la guarda como Markdown al
lado de las imágenes. Medir a ojo fue lo que casi nos hizo concluir "se ve
negro" sobre un caso que sí se había movido.

CUESTA DINERO: seis llamadas, ~$0.008. No corre sin `--confirmar`.

Uso:

    python herramientas/probar_cfg.py --design <uuid>               # ensayo
    python herramientas/probar_cfg.py --design <uuid> --confirmar
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

import numpy as np
from PIL import Image

from probar_inpaint import asset, bajar, encajar, firmar, par_del_diseno
from r2_vs_db import ENV, leer_env

API = "https://api.runware.ai/v1"
MODELO = "runware:102@1"

# El mismo que usó el caso B del experimento 1, para que la escalera arranque de
# algo ya medido (+7.0 de azulidad).
PROMPT_CORTO = (
    "a navy blue t-shirt, cotton fabric, soft folds and natural shading, "
    "white background"
)

# Siguiendo el patrón del ejemplo oficial del ahumador, que es literalmente este
# caso: producto enteramente enmascarado sobre fondo plano. Describe material,
# acabado, qué preservar e iluminación.
#
# Y corrige un error del corto: **no menciona el fondo**. La regla documentada es
# que el prompt describa solo la zona enmascarada, porque el modelo ya ve lo que
# la rodea; decirle "white background" le describe algo que no tiene que pintar.
PROMPT_LARGO = (
    "A deep navy blue cotton t-shirt, saturated navy dye running evenly through "
    "the fabric, matte jersey knit with a visible fine weave, soft natural folds "
    "and gentle shadows in the drape, crisp shoulder seams, ribbed crew neckline, "
    "short sleeves with plain hems, studio product photography lighting with soft "
    "highlights across the chest and shoulders, keeping the exact same shape, "
    "proportions, silhouette, orientation and position as the original garment."
)

# Excluye explícitamente el color del que hay que salir, que es justo lo que el
# modelo venía reproduciendo.
PROMPT_NEGATIVO = (
    "black, dark gray, charcoal, faded color, washed out, desaturated, "
    "color bleeding, visible seam, patch, outline, text, logo, print, "
    "distorted shape, wrinkled plastic"
)

# (etiqueta, CFGScale, negativo, prompt, ancho forzado o None)
ESCALERA = [
    ("E0", None, False, "corto", None),
    ("E1", 2.0, False, "corto", None),
    ("E2", 10.0, False, "corto", None),
    ("E3", 10.0, True, "corto", None),
    ("E4", 10.0, True, "largo", None),
    ("E5", 10.0, True, "largo", 1408),
]

# **La misma semilla para las seis.** Sin esto, cada llamada arranca de un ruido
# distinto y parte de la diferencia entre E0 y E1 no sería el `CFGScale` sino
# azar: se estaría atribuyendo a la variable algo que puede ser suerte. Con la
# semilla fija, lo único que cambia entre casos adyacentes es lo que cambiamos.
#
# El precio de fijarla es que cada celda es **una sola muestra**: dice qué hace
# esa configuración con ESA semilla, no su promedio. Para una ablación que busca
# dirección y magnitud gruesa alcanza; para publicar un número, no.
SEMILLA = 20260917

COSTO_ESTIMADO = 0.0013


def lienzo_de(ancho_forzado: int | None, ancho: int, alto: int) -> tuple[int, int]:
    """
    El tamaño de cada caso.

    E5 tenía que aislar **solo** la resolución, y la primera versión no lo hacía:
    `encajar(1024, ...)` daba 1024×640, cuya proporción (1.600) no es la de
    704×448 (1.571). Eso cambiaba dos cosas a la vez — la resolución y cuánto se
    deforma la prenda, de 9.9% a 8.3%.

    1408×896 es **exactamente el doble lineal** de 704×448: los dos múltiplos de
    64, misma proporción al dígito, cuatro veces los píxeles. Así el único cambio
    es el tamaño.
    """
    if ancho_forzado is None:
        return ancho, alto
    return ancho_forzado, round(alto * ancho_forzado / ancho)


def azulidad(ruta_imagen: Path, mascara: Image.Image) -> tuple[float, float, tuple]:
    """Color promedio DENTRO de la máscara, o sea solo la prenda."""
    with Image.open(ruta_imagen) as im:
        im = im.convert("RGB")
        m = mascara.resize(im.size, Image.BILINEAR)
        pixeles = np.asarray(im, dtype=float)

    dentro = np.asarray(m) > 200
    if not dentro.any():
        return 0.0, 0.0, (0.0, 0.0, 0.0)

    r, g, b = pixeles[dentro].mean(axis=0)
    return b - (r + g) / 2, 0.2126 * r + 0.7152 * g + 0.0722 * b, (r, g, b)


def llamar(env, tarea: dict) -> tuple[dict | None, float, str | None]:
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
        return None, time.monotonic() - comenzo, error.read().decode("utf-8", "replace")[:600]

    tardo = time.monotonic() - comenzo
    if "errors" in cuerpo:
        return None, tardo, json.dumps(cuerpo["errors"], ensure_ascii=False)[:600]
    return cuerpo["data"][0], tardo, None


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirmar", action="store_true")
    parser.add_argument("--design", required=True)
    parser.add_argument("--strength", type=float, default=0.85)
    parser.add_argument("--steps", type=int, default=28)
    parser.add_argument("--salida", default="resultados2")
    args = parser.parse_args()

    env = leer_env(ENV)
    if not env.get("RUNWARE_API_KEY"):
        sys.exit("Falta RUNWARE_API_KEY en .env.local")

    imagen_id, mascara_id = par_del_diseno(env, args.design)
    imagen = asset(env, imagen_id)
    mascara = asset(env, mascara_id)
    ancho, alto = encajar(imagen["width_px"], imagen["height_px"])

    print(f"  seedImage : {imagen['width_px']}×{imagen['height_px']}   {imagen['asset_type']}")
    print(f"  maskImage : {mascara['width_px']}×{mascara['height_px']}")
    coinciden = (mascara["width_px"], mascara["height_px"]) == (
        imagen["width_px"],
        imagen["height_px"],
    )
    if not coinciden:
        sys.exit("  ⚠️  la máscara no mide como la imagen. Pintala de nuevo en la app.")
    print("  ✅ la máscara mide como la imagen")
    print(f"  lienzo    : {ancho}×{alto}   (E5 sube al doble lineal, misma proporción)")
    print(
        f"  strength {args.strength}  ·  steps {args.steps}  ·  semilla {SEMILLA}"
        "  ·  imágenes dentro de `inputs`\n"
    )

    for etiqueta, cfg, negativo, largo, forzar in ESCALERA:
        w, h = lienzo_de(forzar, ancho, alto)
        print(
            f"  [{etiqueta}]  CFGScale {str(cfg or 'por omisión'):<12}"
            f"negativo {'sí' if negativo else 'no ':<4}"
            f"prompt {largo:<7}{w}×{h}"
        )

    if not args.confirmar:
        # E5 corre a cuatro veces los píxeles y el modelo cobra por cómputo, así
        # que estimarla igual que las demás sería subestimar.
        caras = sum(1 for c in ESCALERA if c[4])
        estimado = COSTO_ESTIMADO * (len(ESCALERA) - caras + 4 * caras)
        print(
            f"\nENSAYO — no se llamó a nadie. {len(ESCALERA)} llamadas costarían "
            f"~${estimado:.4f}  (E5 cuesta más: cuatro veces los píxeles)."
        )
        return 0

    carpeta = Path(args.salida)
    carpeta.mkdir(parents=True, exist_ok=True)
    marca = time.strftime("%Y%m%d-%H%M%S")

    # Los originales una vez, para comparar contra los seis.
    ruta_mascara = carpeta / f"{marca}-00-mascara.png"
    ruta_original = carpeta / f"{marca}-00-prenda-original.png"
    ruta_mascara.write_bytes(bajar(firmar(env, mascara["r2_key"])))
    ruta_original.write_bytes(bajar(firmar(env, imagen["r2_key"])))
    mascara_img = Image.open(ruta_mascara).convert("L")

    filas = []
    print()
    for etiqueta, cfg, negativo, largo, forzar in ESCALERA:
        w, h = lienzo_de(forzar, ancho, alto)

        tarea = {
            "taskType": "imageInference",
            "taskUUID": str(uuid.uuid4()),
            "model": MODELO,
            "positivePrompt": PROMPT_LARGO if largo == "largo" else PROMPT_CORTO,
            # La forma que declara el esquema, no la del nivel raíz.
            "inputs": {
                "seedImage": firmar(env, imagen["r2_key"]),
                "maskImage": firmar(env, mascara["r2_key"]),
            },
            "width": w,
            "height": h,
            "strength": args.strength,
            "steps": args.steps,
            "numberResults": 1,
            "outputFormat": "PNG",
            "includeCost": True,
        }
        tarea["seed"] = SEMILLA
        if cfg is not None:
            tarea["CFGScale"] = cfg
        if negativo:
            tarea["negativePrompt"] = PROMPT_NEGATIVO

        resultado, tardo, error = llamar(env, tarea)
        if error:
            print(f"  [{etiqueta}] FALLÓ en {tardo:.1f}s — no se cobró\n       {error}")
            filas.append((etiqueta, cfg, negativo, largo, f"{w}×{h}", None, None, None, tardo))
            continue

        nombre = f"{marca}-{etiqueta}.png"
        (carpeta / nombre).write_bytes(bajar(resultado["imageURL"]))
        azul, luma, _ = azulidad(carpeta / nombre, mascara_img)
        costo = resultado.get("cost")

        print(f"  [{etiqueta}] {tardo:5.1f}s  ${costo}  azulidad {azul:+6.1f}  luma {luma:5.1f}")
        filas.append((etiqueta, cfg, negativo, largo, f"{w}×{h}", azul, luma, costo, tardo))

    # La referencia, medida igual que todo lo demás.
    azul0, luma0, _ = azulidad(ruta_original, mascara_img)

    lineas = [
        f"# Experimento 2 — resultados ({marca})",
        "",
        "Azulidad = `B - (R+G)/2` del promedio **dentro de la máscara**.",
        f"Original: **{azul0:+.1f}**.  Caso B del experimento 1: **+7.0**.  "
        "Un azul marino real medido: **+18.3**.",
        "",
        "| Caso | CFGScale | Negativo | Prompt | Lienzo | Azulidad | Luma | Costo | Latencia |",
        "|---|---|---|---|---|---|---|---|---|",
        f"| — | — | — | — | original | **{azul0:+.1f}** | {luma0:.1f} | — | — |",
    ]
    for e, cfg, neg, largo, lienzo, azul, luma, costo, tardo in filas:
        if azul is None:
            lineas.append(f"| {e} | {cfg or '—'} | {'sí' if neg else 'no'} | {largo} | {lienzo} | falló | | | {tardo:.1f}s |")
        else:
            lineas.append(
                f"| **{e}** | {cfg or 'por omisión'} | {'sí' if neg else 'no'} | {largo} | "
                f"{lienzo} | **{azul:+.1f}** | {luma:.1f} | ${costo} | {tardo:.1f}s |"
            )
    lineas += [
        "",
        "## Qué aísla cada par",
        "",
        "| Comparación | Aísla |",
        "|---|---|",
        "| B (exp. 1) → E0 | la forma de la petición (`inputs` contra nivel raíz) |",
        "| E0 → E1 → E2 | `CFGScale` |",
        "| E2 → E3 | `negativePrompt` |",
        "| E3 → E4 | el detalle del prompt |",
        "| E4 → E5 | la resolución |",
    ]
    (carpeta / f"{marca}-tabla.md").write_text("\n".join(lineas), encoding="utf-8")

    total = sum(f[7] or 0 for f in filas)
    print(f"\n  gastado: ${total:.4f}")
    print(f"  tabla:   {carpeta / f'{marca}-tabla.md'}")
    print(f"  imágenes en {carpeta.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
