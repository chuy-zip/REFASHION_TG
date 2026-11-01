"""
Genera una máscara aislando lo que es cálido y brillante sobre tela oscura.

PARA QUÉ SIRVE Y PARA QUÉ NO. Esto es una herramienta de diagnóstico, no una
función del producto. Funciona con `dark_polo_high_res.jpg` porque sus emblemas
son **dorados sobre tela negra**, o sea separables por color. No generaliza: un
logo gris sobre tela gris no sale así ni de cerca.

Existe para que la máscara del experimento sea **reproducible y ajustable**, en
vez de un recorte hecho a ojo que nadie pueda repetir.

CÓMO DECIDE. Cuatro pasos, y el cuarto es el que hace el trabajo fino:

  1. Píxeles cálidos y brillantes: `R - B > --calidez` y luma `> --brillo`.
  2. Acotado a una banda vertical, para no arrastrar el fondo.
  3. Componentes conectadas de más de `--minimo` píxeles.
  4. **Se mide la luma del anillo que rodea cada componente.** Un emblema está
     rodeado de tela oscura; la piel del escote y del hombro está rodeada de
     piel. Ese único criterio separó los cuatro bordados de los tres parches de
     piel que los pasos anteriores dejaban pasar.

Después dilata y difumina, porque la documentación de Runware pide bordes
suaves (4-8 px) y porque el bordado proyecta una sombra que también hay que
cubrir.

NO CUESTA NADA. No llama a ningún servicio, no lee `.env.local`.

Uso:

    python herramientas/mascara_por_color.py test_images/dark_polo_high_res.jpg
    python herramientas/mascara_por_color.py <imagen> --calidez 24 --brillo 50
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd
from scipy.spatial import ConvexHull, QhullError


def casco(binaria: np.ndarray, fusion: int = 30) -> np.ndarray:
    """
    Reemplaza cada emblema por su casco convexo: de forma calada a mancha.

    OJO CON `fusion`, QUE ES LO QUE HACE QUE ESTO SIRVA. El escudo no es una
    componente: el ave es una y el anillo de texto es otra. Un casco por
    componente le da a cada parte su propia envolvente y **la silueta sigue
    delatando el logotipo**, que es justo lo que queríamos borrar. Así que
    primero se dilata `fusion` píxeles para que las partes de un mismo emblema
    se toquen, se agrupan, y recién entonces se toma el casco de cada grupo
    sobre sus píxeles originales.

    PARA QUÉ. La estrella (compacidad 0.72) se borró perfecta y el escudo
    (compacidad 0.56, forma calada con alas y un anillo de texto) dejó
    artefactos. La hipótesis es que **la forma de la máscara es información que
    el modelo usa**: un hueco con silueta de logotipo le dice que ahí había un
    logotipo. Una mancha compacta no dice nada.

    Ojo con el contra, porque no es gratis: el casco **agranda el interior sin
    atar**, y el artefacto que quedó estaba justo en la parte más gruesa de la
    máscara (38.7 px contra 16.7 de promedio). Los dos efectos empujan en
    sentidos opuestos. Por eso esto es una celda del experimento y no un arreglo
    que se aplique por omisión.

    Se rasteriza con los semiplanos que devuelve `ConvexHull.equations`
    (`A·x + b <= 0` adentro), que evita depender de scikit-image o matplotlib.
    """
    unidas = nd.binary_dilation(binaria, np.ones((2 * fusion + 1, 2 * fusion + 1)))
    grupos, cuantas = nd.label(unidas, np.ones((3, 3)))
    salida = np.zeros_like(binaria)

    for i in range(1, cuantas + 1):
        ys, xs = np.nonzero(binaria & (grupos == i))
        if len(ys) < 3:
            continue
        puntos = np.column_stack([xs, ys]).astype(float)
        try:
            envolvente = ConvexHull(puntos)
        except QhullError:
            # Degenerada (una línea, un punto): se deja como estaba.
            salida[ys, xs] = True
            continue

        y0, y1 = ys.min(), ys.max() + 1
        x0, x1 = xs.min(), xs.max() + 1
        malla_y, malla_x = np.mgrid[y0:y1, x0:x1]
        candidatos = np.column_stack([malla_x.ravel(), malla_y.ravel()]).astype(float)

        a = envolvente.equations[:, :-1]
        b = envolvente.equations[:, -1]
        adentro = np.all(candidatos @ a.T + b <= 1e-9, axis=1)

        salida[y0:y1, x0:x1] |= adentro.reshape(malla_y.shape)

    return salida


def construir(
    imagen: Image.Image,
    calidez: float,
    brillo: float,
    minimo: int,
    banda: tuple[float, float],
    lados: tuple[float, float],
    anillo_max: float,
    dilatar: int,
    difuminar: float,
    compactar: bool = False,
) -> tuple[Image.Image, list[str]]:
    """Devuelve (máscara, bitácora de lo que decidió sobre cada componente)."""
    a = np.asarray(imagen.convert("RGB"), dtype=float)
    alto, ancho, _ = a.shape
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b

    candidato = ((r - b) > calidez) & (luma > brillo)

    zona = np.zeros_like(candidato)
    zona[
        int(alto * banda[0]) : int(alto * banda[1]),
        int(ancho * lados[0]) : int(ancho * lados[1]),
    ] = True
    candidato &= zona

    etiquetas, cuantas = nd.label(candidato, np.ones((3, 3)))
    bitacora: list[str] = []
    conservar: list[int] = []

    for i in range(1, cuantas + 1):
        componente = etiquetas == i
        tam = int(componente.sum())
        if tam < minimo:
            continue
        # El anillo: dilatar mucho menos dilatar poco deja una rosca alrededor.
        anillo = nd.binary_dilation(componente, np.ones((25, 25))) & ~nd.binary_dilation(
            componente, np.ones((9, 9))
        )
        fondo = float(luma[anillo].mean())
        es_tela = fondo < anillo_max
        bitacora.append(
            f"    componente {i:>3}: {tam:>6} px   luma del anillo {fondo:>6.1f}   "
            + ("TELA, se queda" if es_tela else "PIEL O FONDO, se descarta")
        )
        if es_tela:
            conservar.append(i)

    elegido = np.isin(etiquetas, conservar)
    if compactar:
        antes = int(elegido.sum())
        elegido = casco(elegido)
        bitacora.append(
            f"    casco convexo: {antes} px -> {int(elegido.sum())} px "
            f"({elegido.sum() / max(antes, 1):.2f}x)"
        )
    if dilatar:
        elegido = nd.binary_dilation(elegido, np.ones((9, 9)), iterations=dilatar)

    mascara = Image.fromarray((elegido * 255).astype("uint8"))
    if difuminar:
        mascara = mascara.filter(ImageFilter.GaussianBlur(difuminar))
    return mascara, bitacora


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("imagen", type=Path)
    parser.add_argument("--calidez", type=float, default=28.0, help="R - B mínimo")
    parser.add_argument("--brillo", type=float, default=55.0, help="luma mínima")
    parser.add_argument("--minimo", type=int, default=400, help="píxeles mínimos por componente")
    parser.add_argument("--banda", type=float, nargs=2, default=(0.53, 0.72))
    parser.add_argument("--lados", type=float, nargs=2, default=(0.18, 0.88))
    parser.add_argument("--anillo-max", type=float, default=45.0)
    parser.add_argument("--dilatar", type=int, default=2)
    parser.add_argument("--difuminar", type=float, default=6.0)
    parser.add_argument(
        "--casco",
        action="store_true",
        help="reemplazar cada forma por su casco convexo (ver casco())",
    )
    parser.add_argument("--sufijo", default="__mascara")
    args = parser.parse_args()

    ruta = args.imagen if args.imagen.is_absolute() else Path(__file__).resolve().parent / args.imagen
    if not ruta.exists():
        sys.exit(f"No encontré {ruta}")

    with Image.open(ruta) as imagen:
        imagen.load()
        mascara, bitacora = construir(
            imagen,
            args.calidez,
            args.brillo,
            args.minimo,
            tuple(args.banda),
            tuple(args.lados),
            args.anillo_max,
            args.dilatar,
            args.difuminar,
            args.casco,
        )

        print(f"\n  {ruta.name}  {imagen.width}×{imagen.height}\n")
        for linea in bitacora:
            print(linea)

        cubre = (np.asarray(mascara) > 128).mean() * 100
        salida = ruta.with_name(ruta.stem + args.sufijo + ".png")
        mascara.save(salida)

        # Una vista con la zona marcada, para revisar a ojo antes de gastar.
        m = np.asarray(mascara) > 128
        vista = np.asarray(imagen.convert("RGB")).copy()
        vista[m] = (0.45 * vista[m] + 0.55 * np.array([255, 0, 255])).astype("uint8")
        ruta_vista = ruta.with_name(ruta.stem + args.sufijo + "_vista.png")
        Image.fromarray(vista).save(ruta_vista)

    print(f"\n  MÁSCARA: cubre el {cubre:.2f}% de la imagen")
    print(f"    {salida.name}")
    print(f"    {ruta_vista.name}   <- abrí esta para revisar antes de gastar\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
