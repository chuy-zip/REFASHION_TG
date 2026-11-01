"""
Lo que comparten las dos pruebas de VTON: el banco, la preparación y la lectura.

POR QUÉ UN MÓDULO APARTE. Los dos modelos se piden distinto —uno exige prompt y
el otro no, uno tiene `settings` y el otro no— pero tienen que recibir
**exactamente las mismas imágenes**, o la comparación no compara los modelos
sino las entradas. Esto es lo que garantiza que las reciban iguales.

EL BANCO. Cuatro camisas sobre una persona, y cada camisa está elegida porque
mide algo que las otras no:

| Camisa | Qué mide |
|---|---|
| `white_polo` | un bordado **fino y sin texto**: el caso más fácil de aprobar de lejos y el más fácil de arruinar de cerca |
| `with_logo` | **texto**, que es el criterio duro: o se lee o no se lee |
| `007_shirt` | un **estampado grande de alto contraste**, y además es camiseta y no polo, así que también cambia el cuello |
| `low_qual_polo` | **confección de dos colores** (cuello y mangas azules con vivo rojo) más texto, y encima en baja resolución |

EL CRITERIO SE ESCRIBE ANTES DE MIRAR, que es la regla que la Fase 3 §7 pone
para este experimento. Cada entrada del banco lleva el suyo abajo. Mirar primero
y decidir después qué contaba como éxito es cómo se aprueban resultados malos.

LA MEDICIÓN AUTOMÁTICA ES DELIBERADAMENTE POBRE. Un número no dice si un logo se
lee. Lo que sale de acá es costo real, latencia, resolución de salida y una
lámina de contacto para mirar; el veredicto lo pone el ojo, y por eso el banco
trae los criterios escritos.

> **Ojo con un error que ya se cometió una vez.** Al comparar la cara en la
> prueba de Kontext se recortó por *fracción* de la imagen, y como Kontext
> reencuadra, el recorte cayó en otro lado y pareció otra persona. No lo era.
> Acá los VTON conservan el encuadre, pero si alguna salida viene de otro tamaño
> se reescala al de la entrada **antes** de comparar, y siempre se compara la
> misma caja de píxeles.
"""

from __future__ import annotations

import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

AQUI = Path(__file__).resolve().parent

CAMISAS = AQUI / "shirts_vton"
SALIDA = AQUI / "resultados_vton"

# **Dos fotos del mismo hombre, misma pose, mismo fondo, y esa es la gracia.**
# Entre ellas la única variable es la resolución, así que comparar sus dos
# resultados mide la resolución y nada más. La de antes, `polo_verde_high_res`,
# medía 0.2 MP pese al nombre: un logo ilegible ahí no distinguía entre un
# modelo que falló y unas letras que no cabían.
PERSONAS = {
    "alta": CAMISAS / "high_qual_test.jpg",     # 1280×1920, 2.46 MP
    "normal": CAMISAS / "normal_qual_test.jpg",  # 640×960, 0.61 MP
}
PERSONA = PERSONAS["alta"]

# Fija. Las cuatro camisas corren con la misma, así que una diferencia entre dos
# resultados es de la camisa y no del ruido inicial.
SEMILLA = 20260919

# La documentación de los dos modelos dice que alrededor de 1 MP alcanza para la
# prenda, y FLUX VTO además **cobra por megapíxel de entrada**: mandar una foto
# de 2 MP es pagar de más por algo que igual bajan.
MAX_MP_PRENDA = 1.0

# **1.9 y no 2.0, y el decimal importa.** FLUX VTO deja pasar sin tocar lo que
# está por debajo de 2 MP, y lo que pasa de ahí lo baja a 1 MP de una. La foto
# buena mide 2.46 MP, así que mandarla cruda sería regalar más de la mitad de su
# detalle. Bajarla nosotros a 1.9 la deja del lado bueno del umbral con margen,
# en vez de apoyada justo encima de él.
MAX_MP_PERSONA = 1.9


@dataclass(frozen=True)
class Camisa:
    archivo: str
    etiqueta: str
    # Para el prompt de FLUX VTO, que lo exige. P-Image no lo usa.
    descripcion: str
    # Escrito ANTES de correr nada.
    criterio: str


BANCO = [
    Camisa(
        archivo="white_polo.jpg",
        etiqueta="bordado-fino",
        descripcion=(
            "cream ribbed-collar cotton pique polo shirt with a small embroidered "
            "pony emblem on the left chest"
        ),
        criterio=(
            "¿Queda en el pecho izquierdo una figura reconocible de caballo con jinete, "
            "o quedó una mancha del color correcto?"
        ),
    ),
    Camisa(
        archivo="with_logo.png",
        etiqueta="texto-limpio",
        descripcion=(
            "cream short-sleeve pique polo shirt with a black text logo reading "
            "YOUR LOGO on the left chest"
        ),
        criterio=(
            "¿Se lee YOUR LOGO, en dos renglones, con las letras separadas? "
            "Este es el criterio duro: o se lee o no se lee."
        ),
    ),
    Camisa(
        archivo="007_shirt.jpg",
        etiqueta="estampado-grande",
        descripcion=(
            "yellow crew-neck cotton t-shirt with a large black 007 gun-barrel "
            "graphic across the chest"
        ),
        criterio=(
            "¿Se lee 007 y se reconoce el cañón de la pistola? Y aparte: ¿el cuello "
            "dejó de ser polo y quedó redondo, o le dejó el cuello de la camisa vieja?"
        ),
    ),
    Camisa(
        archivo="low_qual_polo.jpg",
        etiqueta="dos-colores",
        descripcion=(
            "white pique polo shirt with a navy blue collar, navy blue short sleeves "
            "with red trim, and a YOUR DESIGN badge on the left chest"
        ),
        criterio=(
            "¿Sobreviven el cuello azul marino y las mangas azules con el vivo rojo, "
            "o se volvió una camisa blanca lisa? ¿Se lee YOUR DESIGN?"
        ),
    ),
]


def encoger(imagen: Image.Image, max_mp: float) -> Image.Image:
    """Baja a `max_mp` conservando la proporción. Nunca agranda."""
    mp = imagen.width * imagen.height / 1e6
    if mp <= max_mp:
        return imagen
    escala = (max_mp / mp) ** 0.5
    return imagen.resize(
        (max(1, round(imagen.width * escala)), max(1, round(imagen.height * escala))),
        Image.LANCZOS,
    )


def preparar_prenda(ruta: Path) -> Image.Image:
    """
    Deja la prenda como la piden los dos modelos: fondo plano y claro, ~1 MP.

    **Lo importante acá es el fondo transparente.** `with_logo.png` viene en RGBA
    con alfa 0 alrededor de la camisa. Al convertirla a RGB sin más, esos píxeles
    quedan en negro, y le estaríamos mandando al modelo una camisa clara recortada
    sobre un fondo negro cuando su documentación pide justamente lo contrario:
    *"flat-lay packshots on a plain background"*. Se aplana sobre blanco, que es
    el fondo que ya tienen las otras tres, así que las cuatro llegan iguales.
    """
    imagen = Image.open(ruta)
    if imagen.mode in ("RGBA", "LA", "P"):
        imagen = imagen.convert("RGBA")
        fondo = Image.new("RGBA", imagen.size, (255, 255, 255, 255))
        imagen = Image.alpha_composite(fondo, imagen)
    return encoger(imagen.convert("RGB"), MAX_MP_PRENDA)


def preparar_persona(ruta: Path) -> Image.Image:
    return encoger(Image.open(ruta).convert("RGB"), MAX_MP_PERSONA)


def descargar(url: str, destino: Path) -> Image.Image:
    with urllib.request.urlopen(url, timeout=180) as respuesta:
        destino.write_bytes(respuesta.read())
    return Image.open(destino).convert("RGB")


def cambio(entrada: Image.Image, salida: Image.Image) -> tuple[float, float]:
    """
    (cambio medio en toda la imagen, cambio medio en la franja de la cabeza).

    La segunda es **un indicio, no una medición**: la franja superior del 20% es
    donde cae la cabeza en esta foto, y si cambió mucho ahí es señal de que tocó
    la cara. Que haya cambiado poco no prueba que la cara esté bien. Eso se mira.
    """
    if salida.size != entrada.size:
        salida = salida.resize(entrada.size, Image.LANCZOS)
    a = np.asarray(entrada, dtype=float)
    b = np.asarray(salida, dtype=float)
    d = np.abs(b - a).mean(axis=2)
    franja = d[: max(1, int(d.shape[0] * 0.20))]
    return float(d.mean()), float(franja.mean())


def lamina(persona: Image.Image, filas: list[tuple[Image.Image, Image.Image, str]],
           destino: Path, alto: int = 420) -> None:
    """
    Una sola imagen con persona, prenda y resultado, fila por fila.

    Existe porque el veredicto es visual y abrir nueve archivos sueltos para
    compararlos de memoria es cómo se pierden las diferencias chicas.
    """
    def ajustar(im: Image.Image) -> Image.Image:
        escala = alto / im.height
        return im.resize((max(1, round(im.width * escala)), alto), Image.LANCZOS)

    persona_chica = ajustar(persona)
    piezas = [[persona_chica, ajustar(prenda), ajustar(salida)] for prenda, salida, _ in filas]

    ancho = max(sum(p.width for p in fila) + 24 for fila in piezas)
    lienzo = Image.new("RGB", (ancho, (alto + 16) * len(piezas)), (245, 245, 245))
    for i, fila in enumerate(piezas):
        x = 0
        for pieza in fila:
            lienzo.paste(pieza, (x, i * (alto + 16) + 8))
            x += pieza.width + 12
    lienzo.save(destino)


def escribir_tabla(destino: Path, titulo: str, encabezado: list[str],
                   filas: list[list[str]], notas: list[str]) -> None:
    lineas = [f"# {titulo}", "", f"Corrida {time.strftime('%Y-%m-%d %H:%M')}.", ""]
    lineas.append("| " + " | ".join(encabezado) + " |")
    lineas.append("|" + "|".join(["---"] * len(encabezado)) + "|")
    for fila in filas:
        lineas.append("| " + " | ".join(fila) + " |")
    if notas:
        lineas += [""] + notas
    destino.write_text("\n".join(lineas), encoding="utf-8")
