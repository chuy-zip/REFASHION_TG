"""
Máscara para convertir una manga corta en manga larga.

POR QUÉ ES OTRA HERRAMIENTA Y NO UNA OPCIÓN DE `mascara_por_color.py`. Aquella
aísla algo que **está** en la prenda para quitarlo. Esta marca un espacio donde
**no hay nada** para que aparezca tela. Son problemas opuestos y las reglas de
construcción son distintas.

TRES DECISIONES, y las tres importan:

  1. **La máscara es más ancha que el brazo, a propósito.** Una manga tiene
     volumen: cae, se separa del brazo, hace pliegues. Si se enmascara el brazo
     exacto, lo más que puede pintar el modelo es una manga pegada a la piel,
     que se lee como pintura corporal y no como ropa. La tela necesita lugar.
  2. **Se monta sobre la manga corta actual.** Así el modelo tiene el dobladillo
     que ya existe como contexto y **continúa** esa tela, en vez de inventar una
     prenda nueva que arranca de la nada.
  3. **Es deliberadamente tosca.** El pincel de la app no tiene precisión
     quirúrgica, así que medir con una máscara perfecta halagaría al método de
     una forma que el producto después no puede reproducir. Esta se parece a lo
     que un pincel haría.

CÓMO ENCUENTRA EL BRAZO. Piel es cálida y clara: `R > G > B`, `R - B` alto y
luma alta. Se busca solo debajo de `--desde`, o sea por debajo del dobladillo
actual, y se conservan las dos componentes más grandes — que son los dos
antebrazos. Todo lo demás que sea cálido y claro (el emblema dorado, el cuello)
queda afuera por tamaño.

NO CUESTA NADA. No llama a ningún servicio.

Uso:

    python herramientas/mascara_manga.py test_images/dark_polo_high_res.jpg
    python herramientas/mascara_manga.py <imagen> --ensanchar 40 --subir 90
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd


def brazos(imagen: Image.Image, desde: float, cuantos: int) -> np.ndarray:
    """Las `cuantos` componentes de piel más grandes por debajo de `desde`."""
    a = np.asarray(imagen.convert("RGB"), dtype=float)
    alto, _, _ = a.shape
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b

    piel = ((r - b) > 25) & (luma > 60) & (r > g) & (g > b)
    piel[: int(alto * desde)] = False

    etiquetas, cuantas = nd.label(piel, np.ones((3, 3)))
    tam = sorted(
        ((int((etiquetas == i).sum()), i) for i in range(1, cuantas + 1)), reverse=True
    )
    elegidas = [i for _, i in tam[:cuantos]]
    for t, i in tam[:cuantos]:
        print(f"    brazo: {t:>6} px")
    return np.isin(etiquetas, elegidas)


def construir(
    imagen: Image.Image, desde: float, ensanchar: int, subir: int, difuminar: float
) -> Image.Image:
    piel = brazos(imagen, desde, cuantos=2)

    # Ensanchar: la manga cae por fuera del brazo.
    manga = nd.binary_dilation(piel, np.ones((2 * ensanchar + 1, 2 * ensanchar + 1)))
    # Cerrar: los huecos que deja la sombra entre brazo y torso no son parte de
    # la manga, pero dejarlos sin enmascarar haría que el modelo pinte alrededor.
    manga = nd.binary_closing(manga, np.ones((31, 31)))
    # Subir: montarse sobre el dobladillo actual para que continúe esa tela.
    arriba = np.zeros_like(manga)
    arriba[:-subir] = manga[subir:]
    manga |= arriba

    salida = Image.fromarray((manga * 255).astype("uint8"))
    if difuminar:
        salida = salida.filter(ImageFilter.GaussianBlur(difuminar))
    return salida


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("imagen", type=Path)
    parser.add_argument("--desde", type=float, default=0.62, help="fracción de alto donde empezar")
    parser.add_argument("--ensanchar", type=int, default=32, help="px que la manga sobra al brazo")
    parser.add_argument("--subir", type=int, default=80, help="px de solape con la manga actual")
    parser.add_argument("--difuminar", type=float, default=8.0)
    args = parser.parse_args()

    ruta = args.imagen if args.imagen.is_absolute() else Path(__file__).resolve().parent / args.imagen
    if not ruta.exists():
        sys.exit(f"No encontré {ruta}")

    with Image.open(ruta) as imagen:
        imagen.load()
        print(f"\n  {ruta.name}  {imagen.width}×{imagen.height}\n")
        mascara = construir(imagen, args.desde, args.ensanchar, args.subir, args.difuminar)

        m = np.asarray(mascara) > 128
        salida = ruta.with_name(ruta.stem + "__mascara_manga.png")
        mascara.save(salida)

        vista = np.asarray(imagen.convert("RGB")).copy()
        vista[m] = (0.45 * vista[m] + 0.55 * np.array([255, 0, 255])).astype("uint8")
        ruta_vista = ruta.with_name(ruta.stem + "__mascara_manga_vista.png")
        Image.fromarray(vista).save(ruta_vista)

    print(f"\n  MÁSCARA: cubre el {m.mean() * 100:.2f}% de la imagen")
    print(f"    {salida.name}")
    print(f"    {ruta_vista.name}   <- abrí esta antes de gastar\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
