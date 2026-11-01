"""
FLUX.1 Kontext dev: edición por instrucción, sin máscara.

POR QUÉ SE PRUEBA OTRO MODELO. El experimento 3 dejó una línea clara: **FLUX Fill
continúa el contexto, no introduce semántica nueva.** Quitar un emblema sale
perfecto; recolorear y agregar una manga larga no salen, y en el caso de la manga
se verificó que **no era la máscara** (43% de la máscara ya era tela, el
dobladillo estaba adentro, y aun así devolvió un brazo desnudo).

Kontext es de otra clase: se le da la imagen y una **instrucción en lenguaje
natural**, sin máscara, y él decide qué píxeles toca. *"Make the sleeves long"*
es literalmente su caso de uso.

QUÉ PREGUNTA CONTESTA, y es solo una: ¿existe un modelo que sí pueda agregar
confección sobre una foto real? No contesta si conviene meterlo al proyecto.

> **OJO CON EL ENCUADRE, Y ESTO ES DECISIÓN DEL PROYECTO, NO TÉCNICA.** El
> objetivo específico nombra **inpainting** como uno de los tres módulos. Kontext
> **no es inpainting con máscara**: no recibe máscara. Si funciona, hay que
> decidir si entra como un cuarto módulo, si reemplaza algo, o si se deja
> documentado como alternativa evaluada y descartada. Quitar elementos ya cumple
> el objetivo con evidencia medida; esto es una exploración, no un reemplazo.

DIFERENCIAS DE FORMA CON TODO LO ANTERIOR:

  - El modelo es `runware:106@1`, no `runware:102@1`.
  - La imagen va en **`inputs.referenceImages`** (una lista), no en `seedImage`.
  - **No hay `maskImage`.** Esa es la diferencia conceptual entera.
  - El prompt es una **instrucción** ("cambiá esto"), no una descripción de lo
    que debe haber en la zona enmascarada. Es al revés que en Fill.

Cuesta más: **$0.0098** contra los $0.0038 de Fill, o sea unas 2.6 veces.

CÓMO SE LEE. La misma métrica de la prueba de manga —píxeles de piel en la zona
de los antebrazos— para que los números sean comparables cabeza a cabeza, más
cuánto cambió el resto de la imagen, que en un modelo sin máscara es la
preocupación principal: puede cambiarle la cara, el fondo o los emblemas.

CUESTA DINERO: una llamada, ~$0.0098. No corre sin `--confirmar`.

Uso:

    python herramientas/probar_kontext.py               # ensayo, no gasta
    python herramientas/probar_kontext.py --confirmar
"""

from __future__ import annotations

import argparse
import sys
import time
import urllib.request
import uuid
from pathlib import Path

import numpy as np
from PIL import Image

from probar_quitar import como_uri, llamar
from r2_vs_db import ENV, leer_env

AQUI = Path(__file__).resolve().parent

MODELO = "runware:106@1"
IMAGEN = AQUI / "test_images" / "dark_polo_high_res.jpg"
# Solo para MEDIR la misma zona que midió probar_manga.py. No se manda.
MASCARA = AQUI / "test_images" / "dark_polo_high_res__mascara_manga.png"

# Una instrucción, no una descripción. Y dice explícitamente qué preservar,
# porque sin máscara nada le impide cambiar la cara, el fondo o los emblemas.
PROMPT = (
    "Change the man's short-sleeve polo shirt into a long-sleeve polo shirt, with the black "
    "knit fabric continuing down both arms to the wrists and ending in ribbed cuffs. Keep "
    "everything else in the photograph exactly as it is: the same man, the same face and "
    "expression, the same pose, the same background, the same lighting, and the same collar, "
    "buttons and gold embroidered emblems on the chest."
)

COSTO_ESTIMADO = 0.0098

# Kontext NO acepta cualquier múltiplo de 64, a diferencia de Fill. La primera
# llamada se rechazó con `unsupportedDimensions` (sin cobro) y el propio error
# devolvió la lista permitida. Se guarda acá para no volver a gastar un viaje.
#
# Suerte nuestra: 832×1248 da razón 1.5 exacta, que es la de 1280×1920. O sea que
# esta prueba también corre con deformación cero.
DIMENSIONES = [
    (1568, 672), (1504, 688), (1456, 720), (1392, 752), (1328, 800),
    (1248, 832), (1184, 880), (1104, 944), (1024, 1024), (944, 1104),
    (880, 1184), (832, 1248), (800, 1328), (752, 1392), (720, 1456),
    (688, 1504), (672, 1568),
]


def lienzo_kontext(ancho: int, alto: int) -> tuple[int, int, float]:
    """La dimensión permitida que menos deforma la proporción original."""
    razon = alto / ancho
    w, h = min(DIMENSIONES, key=lambda d: abs((d[1] / d[0]) - razon))
    return w, h, abs((h / w) - razon) / razon * 100


def piel_en(imagen: Image.Image, zona: np.ndarray) -> tuple[int, float]:
    """Igual que en probar_manga.py, para que los números sean comparables."""
    a = np.asarray(imagen.convert("RGB"), dtype=float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    piel = ((r - b) > 25) & (luma > 60) & (r > g) & (g > b) & zona
    return int(piel.sum()), float(luma[zona].mean())


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirmar", action="store_true")
    parser.add_argument("--mp", type=float, default=1.2)
    parser.add_argument("--steps", type=int, default=28)
    parser.add_argument("--seed", type=int, default=20260917)
    parser.add_argument("--salida", default="resultados3")
    args = parser.parse_args()

    if not IMAGEN.exists():
        sys.exit(f"No encontré {IMAGEN}")

    original = Image.open(IMAGEN).convert("RGB")
    w, h, deform = lienzo_kontext(original.width, original.height)
    imagen = original.resize((w, h), Image.LANCZOS)

    brazos = np.asarray(Image.open(MASCARA).convert("L").resize((w, h), Image.LANCZOS)) > 128

    print(f"\n  imagen   {IMAGEN.name}  {original.width}×{original.height}")
    print(f"  lienzo   {w}×{h}  ({w * h / 1e6:.2f} MP)  deformación {deform:.2f}%")
    print(f"  modelo   {MODELO}   steps {args.steps}   seed {args.seed}")
    print("  SIN MÁSCARA: el modelo decide qué toca\n")

    if not args.confirmar:
        uri = como_uri(imagen, "JPEG")
        print(f"  Se manda como data URI de {len(uri) / 1024:.0f} KB en inputs.referenceImages.")
        print(f"\n  ENSAYO: no se mandó nada, no se gastó nada (~${COSTO_ESTIMADO:.4f}).")
        print("  Agregá --confirmar para correrlo de verdad.\n")
        return 0

    env = leer_env(ENV)
    carpeta = AQUI / args.salida
    carpeta.mkdir(exist_ok=True)
    marca = time.strftime("%Y%m%d-%H%M%S")

    tarea = {
        "taskType": "imageInference",
        "taskUUID": str(uuid.uuid4()),
        "model": MODELO,
        "positivePrompt": PROMPT,
        "seed": args.seed,
        "width": w,
        "height": h,
        "steps": args.steps,
        "numberResults": 1,
        "outputFormat": "PNG",
        "includeCost": True,
        "inputs": {"referenceImages": [como_uri(imagen, "JPEG")]},
    }

    resultado, tardo, error = llamar(env, tarea)
    if error:
        print(f"  FALLÓ en {tardo:.1f}s — no se cobró\n  {error}\n")
        return 1

    with urllib.request.urlopen(resultado["imageURL"], timeout=120) as r:
        crudo = r.read()
    ruta = carpeta / f"{marca}-kontext-resultado.png"
    ruta.write_bytes(crudo)
    imagen.save(carpeta / f"{marca}-kontext-00-entrada.png")

    salida = Image.open(ruta).convert("RGB")
    if salida.size != imagen.size:
        print(f"  OJO: devolvió {salida.size} y mandamos {imagen.size}. Se reescala para medir.")
        salida = salida.resize(imagen.size, Image.LANCZOS)

    piel_a, luma_a = piel_en(imagen, brazos)
    piel_d, luma_d = piel_en(salida, brazos)
    d = np.abs(np.asarray(salida, dtype=float) - np.asarray(imagen, dtype=float)).mean(axis=2)

    costo = resultado.get("cost")
    print(f"  Listo en {tardo:.1f}s." + (f"  Costo: ${costo:.4f}" if costo else ""))
    print(f"  Guardado en {carpeta.name}/{ruta.name}\n")
    print("  EN LA ZONA DE LOS ANTEBRAZOS (la misma que midió probar_manga.py):")
    print(f"    {'':14} {'antes':>9} {'después':>9}")
    print(f"    {'px de piel':14} {piel_a:>9d} {piel_d:>9d}")
    print(f"    {'luma':14} {luma_a:>9.1f} {luma_d:>9.1f}")
    print(f"\n  Cambio medio: en los brazos {d[brazos].mean():5.2f}, "
          f"en el RESTO {d[~brazos].mean():5.2f}")
    print("  Sin máscara nada le impide cambiar la cara, el fondo o los emblemas:")
    print(f"    porción del resto que cambió más de 25/255: {(d[~brazos] > 25).mean() * 100:.1f}%\n")
    print("  ABRÍ LA IMAGEN y mirá la cara y los emblemas, no solo las mangas.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
