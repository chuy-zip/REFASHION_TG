"""
De dónde sale el garabato blanco: escalera de tres con semilla fija.

EL PROBLEMA. Borrar los emblemas funciona, pero deja un artefacto. Con la
semilla rellenada mejoró mucho —de 1305 píxeles anómalos a 514, y se perdió la
silueta del ave— pero quedó un garabato blanco fino en el escudo. La estrella,
en cambio, sale perfecta las dos veces.

TRES SOSPECHOSOS, y esta escalera los separa:

  1. **El prompt.** El actual termina enumerando "no emblem, badge, logo, star,
     crest, embroidery, stitching, text...", patrón copiado del Ejemplo 1 de la
     documentación. Pero **este modelo ignora `negativePrompt`** (E2 y E3 del
     experimento 2 salieron idénticos byte por byte), así que esas palabras
     viven en el condicionamiento positivo y pueden atraer lo que pretenden
     prohibir. El artefacto parece una puntada; `stitching` está en el prompt.
  2. **La forma de la máscara.** Compacidad de la estrella 0.72 y cero
     artefactos; la del escudo 0.56 y 514 artefactos. La forma de la máscara es
     información: un hueco con silueta de logotipo dice que ahí había uno.
  3. **El grosor de la máscara.** El artefacto cayó donde la máscara mide
     38.7 px de grosor, contra 16.7 de promedio y un p90 de 32. Cuanto más lejos
     está un píxel enmascarado de la tela real, menos atado está.

Ojo con que 2 y 3 **empujan en sentidos opuestos**: el casco convexo borra la
silueta delatora (bueno para 2) pero agranda el interior sin atar (malo para 3).
Cuál gana no se discute, se mide.

| | Máscara | Prompt |
|---|---|---|
| **A** | detallada | completo, con la lista de negativos |
| **B** | detallada | **limpio**, solo descripción de tela |
| **C** | **casco convexo** | limpio |

A→B aísla el prompt. B→C aísla la forma de la máscara. Las tres con la MISMA
SEMILLA, que es lo que faltaba: sin fijarla, si el garabato desaparece no se
sabe si fue el cambio o fue suerte. Y las tres con la semilla rellenada, que ya
demostró que ayuda.

CÓMO SE MIDE. Píxeles "anómalos" dentro de la máscara: los que quedan más de 25
de luma por encima de la tela que rodea a la máscara. Es el mismo criterio con
el que se midieron las dos corridas anteriores, así que los números son
comparables contra 1305 (sin rellenar) y 514 (con relleno).

CUESTA DINERO: tres llamadas, ~$0.012. No corre sin `--confirmar`.

Uso:

    python herramientas/probar_fantasma.py               # ensayo, no gasta
    python herramientas/probar_fantasma.py --confirmar
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

from probar_quitar import (
    MODELO,
    PROMPTS,
    SEMILLA,
    como_uri,
    lienzo,
    llamar,
    rellenar,
)
from r2_vs_db import ENV, leer_env

AQUI = Path(__file__).resolve().parent
IMAGEN = AQUI / "test_images" / "dark_polo_high_res.jpg"

MASCARAS = {
    "detallada": AQUI / "test_images" / "dark_polo_high_res__mascara.png",
    "casco": AQUI / "test_images" / "dark_polo_high_res__mascara_casco.png",
}

# (etiqueta, máscara, prompt)
ESCALERA = [
    ("A", "detallada", "completo"),
    ("B", "detallada", "limpio"),
    ("C", "casco", "limpio"),
]

COSTO_ESTIMADO = 0.004


def anomalos(imagen: Image.Image, dentro: np.ndarray, anillo: np.ndarray) -> tuple[int, float]:
    """Píxeles claramente más claros que la tela vecina, y la luma de la zona."""
    a = np.asarray(imagen.convert("RGB"), dtype=float)
    luma = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    umbral = luma[anillo].mean() + 25
    return int(((luma > umbral) & dentro).sum()), float(luma[dentro].mean())


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirmar", action="store_true")
    parser.add_argument("--mp", type=float, default=1.2)
    parser.add_argument("--steps", type=int, default=28)
    parser.add_argument("--seed", type=int, default=SEMILLA)
    parser.add_argument("--suavizado", type=float, default=12.0)
    parser.add_argument("--salida", default="resultados3")
    args = parser.parse_args()

    if not IMAGEN.exists():
        sys.exit(f"No encontré {IMAGEN}")
    for nombre, ruta in MASCARAS.items():
        if not ruta.exists():
            sys.exit(
                f"Falta la máscara '{nombre}': {ruta.name}\n"
                "Generala con mascara_por_color.py (la del casco con --casco)."
            )

    original = Image.open(IMAGEN).convert("RGB")
    w, h, deform = lienzo(original.width, original.height, args.mp)
    imagen = original.resize((w, h), Image.LANCZOS)

    print(f"\n  imagen   {IMAGEN.name}  {original.width}×{original.height}")
    print(f"  lienzo   {w}×{h}  ({w * h / 1e6:.2f} MP)  deformación {deform:.2f}%")
    print(f"  modelo   {MODELO}   steps {args.steps}   semilla FIJA {args.seed}")
    print("  semilla  rellenada en las tres\n")

    preparado = {}
    for nombre, ruta in MASCARAS.items():
        mascara = Image.open(ruta).convert("L").resize((w, h), Image.LANCZOS)
        dentro = np.asarray(mascara) > 128
        anillo = nd.binary_dilation(dentro, np.ones((41, 41))) & ~nd.binary_dilation(
            dentro, np.ones((9, 9))
        )
        preparado[nombre] = (mascara, dentro, anillo, rellenar(imagen, mascara, args.suavizado))
        print(f"  máscara '{nombre}': cubre el {dentro.mean() * 100:.2f}% del lienzo")

    print()
    for etiqueta, mascara, prompt in ESCALERA:
        print(f"  [{etiqueta}]  máscara {mascara:<10} prompt {prompt}")

    if not args.confirmar:
        print(f"\n  ENSAYO: no se mandó nada, no se gastó nada "
              f"(~${COSTO_ESTIMADO * len(ESCALERA):.4f}).")
        print("  Agregá --confirmar para correrlo de verdad.\n")
        return 0

    env = leer_env(ENV)
    carpeta = AQUI / args.salida
    carpeta.mkdir(exist_ok=True)
    marca = time.strftime("%Y%m%d-%H%M%S")
    filas = []

    print()
    for etiqueta, nombre_mascara, nombre_prompt in ESCALERA:
        mascara, dentro, anillo, semilla_img = preparado[nombre_mascara]

        tarea = {
            "taskType": "imageInference",
            "taskUUID": str(uuid.uuid4()),
            "model": MODELO,
            "positivePrompt": PROMPTS[nombre_prompt],
            "seed": args.seed,
            "width": w,
            "height": h,
            "steps": args.steps,
            "numberResults": 1,
            "outputFormat": "PNG",
            "includeCost": True,
            "inputs": {
                "seedImage": como_uri(semilla_img, "JPEG"),
                "maskImage": como_uri(mascara, "PNG"),
            },
        }

        resultado, tardo, error = llamar(env, tarea)
        if error:
            print(f"  [{etiqueta}] FALLÓ en {tardo:.1f}s — no se cobró\n       {error}")
            filas.append((etiqueta, nombre_mascara, nombre_prompt, None, None, None, tardo))
            continue

        with urllib.request.urlopen(resultado["imageURL"], timeout=120) as r:
            crudo = r.read()
        ruta = carpeta / f"{marca}-fantasma-{etiqueta}.png"
        ruta.write_bytes(crudo)

        salida = Image.open(ruta).convert("RGB")
        raros, luma = anomalos(salida, dentro, anillo)
        costo = resultado.get("cost")
        porcentaje = raros / dentro.sum() * 100
        print(
            f"  [{etiqueta}]  {raros:>5} px anómalos ({porcentaje:5.2f}%)   "
            f"luma {luma:5.1f}   ${costo:.4f}   {tardo:4.1f}s"
        )
        filas.append((etiqueta, nombre_mascara, nombre_prompt, raros, porcentaje, luma, tardo))

    tabla = [
        f"# Escalera del fantasma ({marca})",
        "",
        f"Semilla fija **{args.seed}**, semilla de imagen rellenada, {args.steps} pasos, "
        f"lienzo {w}×{h}.",
        "",
        "Píxeles anómalos = más de 25 de luma por encima de la tela que rodea la máscara.",
        "Referencias de las corridas anteriores, sin semilla fija: **1305** sin rellenar, "
        "**514** con relleno.",
        "",
        "| Caso | Máscara | Prompt | Px anómalos | % de la máscara | Luma | Latencia |",
        "|---|---|---|---|---|---|---|",
    ]
    for etiqueta, msk, prm, raros, pct, luma, tardo in filas:
        if raros is None:
            tabla.append(f"| **{etiqueta}** | {msk} | {prm} | falló | — | — | {tardo:.1f}s |")
        else:
            tabla.append(
                f"| **{etiqueta}** | {msk} | {prm} | **{raros}** | {pct:.2f}% | "
                f"{luma:.1f} | {tardo:.1f}s |"
            )
    tabla += [
        "",
        "| Comparación | Aísla |",
        "|---|---|",
        "| A → B | el prompt: quitarle la lista de negativos |",
        "| B → C | la forma de la máscara: detallada contra casco convexo |",
    ]
    (carpeta / f"{marca}-fantasma-tabla.md").write_text("\n".join(tabla), encoding="utf-8")

    print(f"\n  Tabla en {carpeta.name}/{marca}-fantasma-tabla.md")
    print("  ABRÍ LAS TRES IMÁGENES: el conteo dice cuánto quedó, no si se ve bien.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
