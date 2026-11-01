"""
Manga corta a manga larga: la prueba donde la IA hace TODO el trabajo.

POR QUÉ ESTA PRUEBA IMPORTA MÁS QUE LA DE BORRADO. En el borrado apareció una
objeción legítima: el relleno determinista quedó tan bueno que casi no dejaba
trabajo al modelo. Medido: al relleno le falta el **73%** de la textura de la
tela real, así que trabajo hay — pero es síntesis de textura, un oficio modesto.

Acá esa objeción no existe. **Ningún método determinista puede hacer crecer una
manga.** No hay píxeles de tela que copiar, no hay color que trasladar, no hay
región que continuar: hay que inventar el volumen de la tela, cómo cae, dónde
pliega, cómo termina en el puño y cómo se recorta contra el fondo. Si esto sale,
el módulo de difusión tiene un oficio que nada más puede cubrir, y eso es
exactamente lo que pide el objetivo específico: *"ejecutar las modificaciones
visuales sobre una prenda seleccionada"*.

POR QUÉ NO SE RELLENA LA SEMILLA ACÁ. `probar_quitar.py --rellenar` tapa la zona
con el píxel **de tela más cercano**. Alrededor de los brazos lo más cercano no
es tela: es la pared azul y el panel gris. Rellenar metería fondo dentro de la
manga, que es peor que no hacer nada. Si la piel se filtra al resultado —el
mismo fenómeno que dejó el fantasma del escudo—, la respuesta sería rellenar con
un color de tela **muestreado del hombro**, no con el vecino. Eso se construye
si hace falta, no antes.

CÓMO SE LEE EL RESULTADO:

  - **píxeles de piel dentro de la máscara**: si apareció manga, caen a casi
    cero. Es el indicador principal.
  - **luma dentro de la máscara contra la de la manga corta actual**: si la tela
    nueva es la misma tela, se parecen. Si la manga sale más clara o más oscura,
    se va a leer como dos prendas distintas.
  - **cuánto cambió fuera de la máscara**, que debe ser chico.

Y sobre todo: **mirar la imagen.** Ningún número dice si la manga cae como cae
la tela.

CUESTA DINERO: una llamada, ~$0.004. No corre sin `--confirmar`.

Uso:

    python herramientas/probar_manga.py               # ensayo, no gasta
    python herramientas/probar_manga.py --confirmar
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
from scipy import ndimage as nd

from probar_quitar import MODELO, como_uri, lienzo, llamar
from r2_vs_db import ENV, leer_env

AQUI = Path(__file__).resolve().parent

IMAGEN = AQUI / "test_images" / "dark_polo_high_res.jpg"
MASCARA = AQUI / "test_images" / "dark_polo_high_res__mascara_manga.png"

# Misma plantilla que funcionó en el borrado —qué poner, con qué debe concordar,
# qué no debe aparecer— pero pidiendo que aparezca tela donde no había.
#
# Dice "hanging with realistic volume away from the arm" a propósito: sin eso el
# modelo tiende a pintar la manga pegada al brazo, y una manga pegada se lee
# como pintura sobre la piel, no como ropa.
PROMPT = (
    "A long sleeve of the same black pique knit polo shirt, continuing down from the existing "
    "short sleeve and covering the arm all the way to the wrist, ending in a ribbed knit cuff. "
    "Matte black knit fabric matching the shoulder and chest exactly in tone, thread scale and "
    "weave direction, hanging with realistic volume away from the arm, with natural cloth drape, "
    "soft folds gathering at the elbow and a clean silhouette against the background. Match the "
    "ambient lighting, contact shadows, edge sharpness and depth of field of the rest of the "
    "garment. Photorealistic clothing, with no bare skin, no bare forearm, no visible arm, no "
    "seam, no patch, no outline, no text and no retouching artifact."
)

COSTO_ESTIMADO = 0.004


def rellenar_con_tela(imagen: Image.Image, mascara: Image.Image) -> tuple[Image.Image, tuple]:
    """
    Tapa la zona de los brazos con el color de la tela, muestreado del torso.

    POR QUÉ NO SIRVE `rellenar()` DE `probar_quitar.py`. Aquella copia del píxel
    **de tela más cercano**, y alrededor de los brazos lo más cercano no es tela:
    es la pared azul y el panel gris. Metería fondo dentro de la manga.

    QUÉ HACE ESTA. Toma la mediana de los píxeles oscuros del torso —o sea la
    tela del polo, sin la máscara— y pinta con ese color toda la zona
    enmascarada. El modelo deja de ver un brazo y pasa a ver una mancha del color
    de la prenda, con la forma que tendría la manga.

    ES LA ÚLTIMA PALANCA. Es el análogo exacto de lo que mató el fantasma del
    escudo: si los píxeles originales bajo la máscara son los que arrastran el
    resultado, quitarlos debería liberar al modelo. Si aun así devuelve un brazo,
    la conclusión de que **FLUX Fill no introduce semántica nueva** queda sellada
    y no apoyada en una sola llamada.
    """
    a = np.asarray(imagen.convert("RGB"), dtype=float)
    m = np.asarray(mascara.convert("L")) > 128
    alto, _, _ = a.shape

    luma = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    torso = np.zeros_like(m)
    torso[int(alto * 0.40) : int(alto * 0.70)] = True
    tela = torso & (luma < 60) & ~m
    color = np.median(a[tela], axis=0)

    salida = a.copy()
    salida[m] = color
    return Image.fromarray(salida.clip(0, 255).astype("uint8")), tuple(color.round(1))


def piel_en(imagen: Image.Image, zona: np.ndarray) -> tuple[int, float]:
    """(píxeles de piel, luma media) dentro de la zona indicada."""
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
    parser.add_argument("--imagen", type=Path, default=IMAGEN)
    parser.add_argument("--mascara", type=Path, default=MASCARA)
    parser.add_argument("--mp", type=float, default=1.2)
    parser.add_argument("--steps", type=int, default=28)
    parser.add_argument(
        "--rellenar-tela",
        action="store_true",
        help="tapar los brazos con el color del polo antes de mandar",
    )
    parser.add_argument("--seed", type=int, default=20260917)
    parser.add_argument("--salida", default="resultados3")
    args = parser.parse_args()

    for ruta in (args.imagen, args.mascara):
        if not ruta.exists():
            sys.exit(f"No encontré {ruta}\n¿Corriste mascara_manga.py primero?")

    original = Image.open(args.imagen).convert("RGB")
    mascara_grande = Image.open(args.mascara).convert("L")
    if mascara_grande.size != original.size:
        sys.exit(f"La máscara mide {mascara_grande.size} y la imagen {original.size}.")

    w, h, error = lienzo(original.width, original.height, args.mp)
    imagen = original.resize((w, h), Image.LANCZOS)
    mascara = mascara_grande.resize((w, h), Image.LANCZOS)
    dentro = np.asarray(mascara) > 128
    fuera = ~(np.asarray(mascara) > 8)

    # La manga corta actual, para comparar la tela nueva contra la que ya existe.
    hombros = np.zeros_like(dentro)
    hombros[int(h * 0.42) : int(h * 0.58)] = True
    a = np.asarray(imagen, dtype=float)
    oscuro = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) < 60
    tela_actual = hombros & oscuro & ~nd.binary_dilation(dentro, np.ones((9, 9)))

    print(f"\n  imagen   {args.imagen.name}  {original.width}×{original.height}")
    print(f"  máscara  {args.mascara.name}  cubre el {dentro.mean() * 100:.2f}% del lienzo")
    print(f"  lienzo   {w}×{h}  ({w * h / 1e6:.2f} MP)  deformación de proporción {error:.2f}%")
    print(f"  modelo   {MODELO}   steps {args.steps}   sin strength, sin CFGScale")
    if args.rellenar_tela:
        semilla, color = rellenar_con_tela(imagen, mascara)
        print(f"  semilla  brazos tapados con el color del polo RGB {color}")
    else:
        semilla = imagen
        print("  semilla  la imagen tal cual")
    print(f"  seed     {args.seed}\n")

    if not args.confirmar:
        uri = como_uri(semilla, "JPEG")
        print(f"  Se manda como data URI de {len(uri) / 1024:.0f} KB. No se sube nada.")
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
        "inputs": {
            "seedImage": como_uri(semilla, "JPEG"),
            "maskImage": como_uri(mascara, "PNG"),
        },
    }

    resultado, tardo, error_api = llamar(env, tarea)
    if error_api:
        print(f"  FALLÓ en {tardo:.1f}s — no se cobró\n  {error_api}\n")
        return 1

    with urllib.request.urlopen(resultado["imageURL"], timeout=120) as r:
        crudo = r.read()
    suf = "-tela" if args.rellenar_tela else ""
    ruta = carpeta / f"{marca}-manga{suf}-resultado.png"
    ruta.write_bytes(crudo)
    imagen.save(carpeta / f"{marca}-manga{suf}-00-entrada.png")
    mascara.save(carpeta / f"{marca}-manga{suf}-00-mascara.png")
    if args.rellenar_tela:
        semilla.save(carpeta / f"{marca}-manga{suf}-00-semilla.png")

    salida = Image.open(ruta).convert("RGB")
    piel_a, luma_a = piel_en(imagen, dentro)
    piel_d, luma_d = piel_en(salida, dentro)
    _, luma_tela = piel_en(imagen, tela_actual)
    cambio_fuera = float(
        np.abs(np.asarray(salida, dtype=float) - np.asarray(imagen, dtype=float)).mean(axis=2)[
            fuera
        ].mean()
    )

    costo = resultado.get("cost")
    print(f"  Listo en {tardo:.1f}s." + (f"  Costo: ${costo:.4f}" if costo else ""))
    print(f"  Guardado en {carpeta.name}/{ruta.name}\n")
    print("  DENTRO de la máscara:")
    print(f"    {'':16} {'antes':>9} {'después':>9}")
    print(f"    {'px de piel':16} {piel_a:>9d} {piel_d:>9d}")
    print(f"    {'luma':16} {luma_a:>9.1f} {luma_d:>9.1f}")
    print(f"\n  La manga corta que ya existía está en luma {luma_tela:.1f}.")
    print(f"  La tela nueva quedó en {luma_d:.1f}  (diferencia {luma_d - luma_tela:+.1f}).")
    print(f"\n  FUERA de la máscara cambió {cambio_fuera:.2f} / 255\n")
    print("  Si los píxeles de piel cayeron a casi cero, apareció manga.")
    print("  ABRÍ LA IMAGEN: el número no dice si la tela cae como cae la tela.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
