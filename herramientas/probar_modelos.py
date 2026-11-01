"""
Generar personas con FLUX.1 [dev], para usarlas como modelo en la prueba virtual.

QUÉ PREGUNTA CONTESTA. No "¿sabe dibujar una persona?", que se da por sabido,
sino **¿sabe dibujar una persona que este pipeline pueda usar?** El experimento
4 dejó escrito qué necesita el VTON de su foto de persona:

  - cuerpo entero o tres cuartos, sin recortes apretados;
  - fondo despejado, que ayuda al modelo a separar a la persona de la escena;
  - ropa ajustada y lisa, que da resultados más limpios.

Así que las cuatro corridas piden exactamente eso, y lo que se mide después es
si salió: el fondo se mide, el encuadre se mira.

POR QUÉ ESTE MODELO Y NO KONTEXT. Kontext es un modelo de **edición**: recibe
una imagen y una instrucción. Generar una persona desde cero no edita nada, y
cuesta $0.0098 contra los $0.0013 de este, o sea 7.5 veces por una capacidad
que no hace falta. Schnell (`runware:100@1`) cuesta la mitad de este, pero es la
versión destilada a cuatro pasos y lo que se está generando son **caras**, que
es justo donde se nota. Se paga una vez y la foto se reutiliza en varios
diseños, así que la diferencia de $0.0007 no decide.

QUÉ SE VARÍA Y QUÉ NO. Solo el prompt, que es lo que distingue a una persona de
otra. El lienzo, los pasos y el resto quedan fijos: variar dos cosas a la vez y
después atribuirle la diferencia a una es el error que el experimento 1 cometió
y el 2 corrigió. Cada persona lleva **su propia semilla fija**, así que
cualquiera de las cuatro se puede volver a generar idéntica.

LO QUE NO SE MANDA:

  - **`negativePrompt`.** El esquema dice que este modelo sí lo acepta con la
    guía encendida, a diferencia de Fill, pero el proyecto tiene medido que
    enumerar lo que no se quiere funciona como imán, y esa medición todavía no
    se ha repetido acá. Meterlo sería agregar una variable sin validar a la
    única corrida que hay.
  - **`CFGScale`.** El esquema no declara valor por omisión, así que mandarlo
    sería elegir un número sin base. Se usa el del proveedor, que es el mismo
    con el que está cotizada la configuración de referencia.

EL LIENZO. 832×1216, los dos múltiplos de 64, 1.01 MP y proporción 1.46, cerca
de 2:3. Es el tamaño que le conviene al paso siguiente: P-Image devuelve la
salida al tamaño de la foto de persona, y FLUX VTO deja pasar sin tocar todo lo
que esté por debajo de 2 MP.

CUESTA DINERO: cuatro llamadas, ~$0.0052. No corre sin `--confirmar`.

Uso:

    python herramientas/probar_modelos.py               # ensayo, no gasta
    python herramientas/probar_modelos.py --confirmar
    python herramientas/probar_modelos.py --idioma es --personas hombre-adulto mujer-adulta --confirmar
"""

from __future__ import annotations

import argparse
import sys
import time
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from probar_quitar import llamar
from r2_vs_db import ENV, leer_env

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI / "resultados_modelos"

MODELO = "runware:101@1"
ANCHO, ALTO = 832, 1216
PASOS = 28
PRECIO_CATALOGO = 0.0013


@dataclass(frozen=True)
class Persona:
    etiqueta: str
    semilla: int
    quien: dict[str, str]


# Todas dicen lo mismo sobre el encuadre, el fondo y la ropa, porque eso es lo
# que el pipeline necesita; lo que cambia es quién es la persona.
#
# **Los zapatos son parte del texto base**, y lo son porque la primera corrida
# devolvió dos personas descalzas de cuatro. Un modelo descalzo no descalifica
# la prueba virtual —la prenda va en el torso— pero sí arruina la foto como
# material de presentación, que es para lo que existe. Se piden lisos por la
# misma razón que la ropa: cualquier cosa estampada compite con el uniforme.
#
# **Y son más específicos que la primera versión en tres puntos**, porque la
# primera corrida mostró exactamente dónde afloja la instrucción: la pose (dos
# personas salieron de perfil o de espaldas), los zapatos (una descalza) y el
# fondo (gris oscuro con sombra en vez de gris claro parejo).
#
# Los tres refuerzos están dichos **en positivo**, que es la regla que el
# proyecto tiene medida: nombrar algo es pedirlo, así que se describe la pose
# que se quiere y no la que se rechaza.
COMUN_CON_PIES = {
    "en": (
        "Full-body studio photograph against a plain light grey seamless backdrop "
        "lit evenly from the front with no visible shadow behind the person. "
        "Standing upright in a frontal view, shoulders square to the camera, face "
        "fully visible and looking straight into the lens, arms relaxed at the "
        "sides. Wearing a plain close-fitting t-shirt, plain trousers, and plain "
        "low-top shoes on both feet, all in solid colours with no prints or "
        "patterns. The whole body from the top of the head to the soles of the "
        "shoes is inside the frame. Sharp focus, natural skin texture, "
        "photorealistic."
    ),
    # Traducción literal, no una versión mejorada: si el español se escribiera
    # mejor que el inglés, la comparación mediría al traductor y no al idioma.
    "es": (
        "Fotografía de estudio de cuerpo entero sobre un fondo continuo gris claro "
        "y liso, iluminado de frente de manera pareja y sin sombra visible detrás "
        "de la persona. De pie y erguida, en vista frontal, con los hombros "
        "paralelos a la cámara, la cara completamente visible y mirando "
        "directamente al lente, los brazos relajados a los costados. Lleva una "
        "camiseta lisa y ajustada, pantalón liso y zapatos bajos lisos en los dos "
        "pies, todo en colores planos y sin estampados ni patrones. El cuerpo "
        "entero, desde la coronilla hasta la suela de los zapatos, está dentro del "
        "encuadre. Enfoque nítido, textura de piel natural, fotorrealista."
    ),
}

# **La misma frase sin la palabra "pies".**
#
# Hipótesis de Ricardo, y tiene precedente medido: en la escalera del fantasma,
# pedir "sin bordado" dibujó un bordado, porque este tipo de modelo no tiene
# canal negativo y cualquier sustantivo que se nombre entra al condicionamiento
# positivo. Si "pies" funciona igual, entonces `zapatos ... en los dos pies` está
# pidiendo zapatos y **pies descalzos a la vez**, y la mujer salió descalza dos
# de dos veces en español pidiéndolo así.
#
# Cambia **una sola cosa**: se quita "en los dos pies" y "on both feet". El resto
# es idéntico palabra por palabra, incluida la mención de las prendas, para que
# una diferencia no tenga dos explicaciones posibles.
COMUN_SIN_PIES = {
    "en": COMUN_CON_PIES["en"].replace(
        "plain low-top shoes on both feet, all in solid colours",
        "plain low-top shoes, all in solid colours",
    ),
    "es": COMUN_CON_PIES["es"].replace(
        "zapatos bajos lisos en los dos pies, todo en colores planos",
        "zapatos bajos lisos, todo en colores planos",
    ),
}

VARIANTES = {"con-pies": COMUN_CON_PIES, "sin-pies": COMUN_SIN_PIES}

BANCO = [
    Persona("hombre-adulto", 20260920, {
        "en": "A man in his thirties with short dark hair and a trimmed beard.",
        "es": "Un hombre de unos treinta años, con el pelo oscuro y corto y la barba recortada.",
    }),
    Persona("mujer-adulta", 20260921, {
        "en": "A woman in her thirties with shoulder-length dark hair.",
        "es": "Una mujer de unos treinta años, con el pelo oscuro hasta los hombros.",
    }),
    Persona("hombre-mayor", 20260922, {
        "en": "A man in his fifties with grey hair, glasses and a slim build.",
        "es": "Un hombre de unos cincuenta años, con canas, anteojos y complexión delgada.",
    }),
    Persona("mujer-joven", 20260923, {
        "en": "A young woman in her twenties with long curly hair.",
        "es": "Una mujer joven de unos veinte años, con el pelo largo y rizado.",
    }),
]


def texto(persona: Persona, idioma: str, variante: str) -> str:
    return f"{persona.quien[idioma]} {VARIANTES[variante][idioma]}"


def fondo(imagen: Image.Image) -> tuple[float, float]:
    """
    (luma media del borde, desviación).

    **La desviación es la que dice si el fondo es liso**, que es una de las tres
    condiciones que el VTON pide de su foto de persona. Un valor alto significa
    que el borde tiene cosas: una pared con textura, una sombra dura, un mueble.
    La media sola no distinguiría un gris parejo de un degradado.
    """
    a = np.asarray(imagen.convert("RGB"), dtype=float)
    luma = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    borde = np.concatenate([luma[0], luma[-1], luma[:, 0], luma[:, -1]])
    return float(borde.mean()), float(borde.std())


def lamina(imagenes: list[tuple[Image.Image, str]], destino: Path, alto: int = 520) -> None:
    """
    Una sola imagen con todas las corridas, cada una rotulada.

    **El rótulo no es decoración**: en una comparación de idiomas, dos fotos sin
    etiqueta obligan a recordar cuál era cuál, y eso es justo lo que hace que
    una comparación se cuente mal al día siguiente.
    """
    from PIL import ImageDraw, ImageFont

    try:
        fuente = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        fuente = ImageFont.load_default()

    piezas = []
    for imagen, etiqueta in imagenes:
        escala = alto / imagen.height
        piezas.append(
            (imagen.resize((max(1, round(imagen.width * escala)), alto), Image.LANCZOS),
             etiqueta)
        )

    margen, rotulo = 12, 30
    ancho = sum(p.width for p, _ in piezas) + margen * (len(piezas) + 1)
    lienzo = Image.new("RGB", (ancho, alto + rotulo + margen * 2), (245, 245, 245))
    dibujo = ImageDraw.Draw(lienzo)

    x = margen
    for pieza, etiqueta in piezas:
        lienzo.paste(pieza, (x, margen))
        dibujo.text((x, margen + alto + 6), etiqueta, fill=(40, 40, 40), font=fuente)
        x += pieza.width + margen

    lienzo.save(destino)


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirmar", action="store_true")
    parser.add_argument("--steps", type=int, default=PASOS)
    parser.add_argument("--idioma", choices=["en", "es", "ambos"], default="en",
                        help="'ambos' corre cada persona en los dos idiomas, "
                             "misma semilla, para comparar solo el idioma")
    parser.add_argument("--texto", choices=sorted(VARIANTES), default="con-pies",
                        help="qué redacción del texto común usar")
    parser.add_argument("--personas", nargs="*", default=None,
                        help="etiquetas del banco; por omisión, las cuatro")
    args = parser.parse_args()

    banco = [p for p in BANCO if args.personas is None or p.etiqueta in args.personas]
    if not banco:
        sys.exit("Ninguna persona coincide con --personas.")

    idiomas = ["es", "en"] if args.idioma == "ambos" else [args.idioma]
    # Persona por persona y dentro de cada una los dos idiomas, para que en la
    # lámina el par quede pegado: la comparación es entre vecinos, no entre
    # extremos de una fila.
    corridas = [(p, i) for p in banco for i in idiomas]
    n = len(corridas)
    print(f"\n  modelo   {MODELO}")
    print(f"  lienzo   {ANCHO}×{ALTO}  ({ANCHO * ALTO / 1e6:.2f} MP)  "
          f"proporción {ALTO / ANCHO:.2f}")
    print(f"  pasos    {args.steps}   sin negativePrompt, sin CFGScale")
    print(f"  idioma   {args.idioma}   texto {args.texto}\n")

    for persona, idioma in corridas:
        print(f"  [{persona.etiqueta:<15}] {idioma}   semilla {persona.semilla}")

    print(f"\n  {n} llamadas a ${PRECIO_CATALOGO:.4f} del catálogo, "
          f"total ${PRECIO_CATALOGO * n:.4f}.")
    print("  El que vale es el que devuelva includeCost.\n")
    print("  QUÉ SE MIRA, escrito antes de generar:")
    print("    1. ¿Se ve el cuerpo entero, sin recortar cabeza ni pies?")
    print("    2. ¿El fondo es liso? (la desviación del borde lo mide)")
    print("    3. ¿La ropa es lisa y ajustada, sin estampados que estorben?")
    print("    4. ¿La cara es creíble de cerca, que es donde falla lo barato?")

    if not args.confirmar:
        print("\n  ENSAYO: no se mandó nada, no se gastó nada.")
        print("  Agregá --confirmar para correrlo de verdad.\n")
        return 0

    env = leer_env(ENV)
    SALIDA.mkdir(exist_ok=True)
    marca = time.strftime("%Y%m%d-%H%M%S")
    gastado = 0.0
    imagenes: list[tuple[Image.Image, str]] = []
    filas: list[str] = []

    print()
    for persona, idioma in corridas:
        tarea = {
            "taskType": "imageInference",
            "taskUUID": str(uuid.uuid4()),
            "model": MODELO,
            "positivePrompt": texto(persona, idioma, args.texto),
            "seed": persona.semilla,
            "width": ANCHO,
            "height": ALTO,
            "steps": args.steps,
            "numberResults": 1,
            "outputFormat": "PNG",
            "includeCost": True,
        }

        resultado, tardo, error = llamar(env, tarea)
        if error:
            print(f"  [{persona.etiqueta:<15}] {idioma} FALLÓ en {tardo:.1f}s, "
                  f"no se cobró\n       {error}")
            filas.append(f"| {persona.etiqueta} | {idioma} | falló | — | — | {tardo:.1f}s |")
            continue

        ruta = SALIDA / f"{marca}-{args.texto}-{idioma}-{persona.etiqueta}.png"
        with urllib.request.urlopen(resultado["imageURL"], timeout=180) as r:
            ruta.write_bytes(r.read())

        imagen = Image.open(ruta).convert("RGB")
        media, desviacion = fondo(imagen)
        costo = resultado.get("cost")
        gastado += costo or 0.0
        imagenes.append((imagen, f"{persona.etiqueta} · {idioma}"))

        print(f"  [{persona.etiqueta:<15}] {idioma}  {imagen.width}×{imagen.height}   "
              f"${costo:.4f}   {tardo:4.1f}s   "
              f"fondo luma {media:5.1f} ± {desviacion:4.1f}")
        filas.append(
            f"| {persona.etiqueta} | {idioma} | {imagen.width}×{imagen.height} | "
            f"${costo:.4f} | {media:.1f} ± {desviacion:.1f} | {tardo:.1f}s |"
        )

    if imagenes:
        ruta_lamina = SALIDA / f"{marca}-{args.texto}-{args.idioma}-lamina.png"
        lamina(imagenes, ruta_lamina)
        print(f"\n  Lámina de contacto: {ruta_lamina.name}")

    tabla = [
        f"# Generación de modelos con {MODELO}, en {args.idioma}, texto {args.texto} ({marca})",
        "",
        f"Lienzo {ANCHO}×{ALTO}, {args.steps} pasos, semilla fija por persona, "
        "sin `negativePrompt` ni `CFGScale`.",
        "",
        "| Persona | Idioma | Salida | Costo real | Fondo (luma ± desv.) | Latencia |",
        "|---|---|---|---|---|---|",
        *filas,
        "",
        f"**Gastado: ${gastado:.4f}** en {n} llamadas "
        f"(catálogo: ${PRECIO_CATALOGO * n:.4f}).",
        "",
        "## Qué se mira, escrito antes de generar",
        "",
        "1. ¿Se ve el cuerpo entero, sin recortar cabeza ni pies?",
        "2. ¿El fondo es liso? La desviación del borde lo mide: alta significa "
        "que hay cosas ahí.",
        "3. ¿La ropa es lisa y ajustada?",
        "4. ¿La cara es creíble de cerca?",
        "",
        "La desviación es **un indicio del fondo, no del encuadre**. Un fondo "
        "perfecto con la cabeza cortada mide igual de bien.",
    ]
    (SALIDA / f"{marca}-{args.texto}-{args.idioma}-tabla.md").write_text("\n".join(tabla), encoding="utf-8")

    print(f"  Gastado en esta corrida: ${gastado:.4f}")
    print(f"  Tabla en {SALIDA.name}/{marca}-tabla.md")
    print("  ABRÍ LA LÁMINA: el número del fondo no dice si la cara sirve.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
