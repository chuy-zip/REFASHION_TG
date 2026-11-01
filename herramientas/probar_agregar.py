"""
Qué SÍ puede hacer la difusión con máscara, además de quitar.

DE DÓNDE VIENE. `probar_textura.py` cerró tres puertas midiendo: con FLUX Fill,
cambiar la textura por prompt no funciona, preparar la semilla con un tono liso
tampoco, y `trueCFGScale` no mueve nada. La regla quedó afilada así:

    Fill no obedece órdenes, renderiza lo que la semilla ya afirma. Preparar la
    semilla no libera al modelo, cambia lo que no va a contradecir.

Queda entonces la pregunta que importa para el Módulo 2: si lo único que sabe
hacer es quitar, o si también sabe AGREGAR. Y una segunda, que salió de la
documentación oficial de FLUX.1 [dev]: ese modelo también acepta máscara, y en
él `strength` sí significa algo ("lower values result in more influence from
the original input"). Con `strength` alto la zona enmascarada se llena de ruido,
y sin evidencia debajo, la regla que nos bloqueó deja de aplicar.

LAS CINCO CELDAS. Una pregunta cada una, una variable cada una.

    a  bufanda_fill    semilla pintada de rojo, Fill
                       -> ¿Fill acepta un objeto ajeno si la semilla lo afirma?
    b  bolsillo_fill   semilla pintada con el color de la prenda, Fill
                       -> ¿Fill hace confección?
    c  bolsillo_margen igual que b, mas `maskMargin` 128
                       -> ¿acercarse mejora una zona chica? Se compara con b
    d  rayas_dev       FLUX dev con la misma máscara, `strength` 1.0
                       -> ¿otro modelo con máscara sí reemplaza textura?
    e  bufanda_dev     FLUX dev, `strength` 0.9, semilla SIN preparar
                       -> ¿dev necesita la semilla preparada, o no?

Las máscaras de a, e y d son las que pintó el usuario en la app, bajadas de R2
por `auditar_mascara.py`. La del bolsillo se construye acá, dentro de la prenda.

CUESTA DINERO: $0.019 de catálogo, con techo de $0.028 porque el cobro real
viene saliendo entre 46% y 55% por encima. No corre sin `--confirmar`.

Uso:

    python herramientas/probar_agregar.py               # ensayo, arma la lamina
    python herramientas/probar_agregar.py --confirmar
"""

from __future__ import annotations

import argparse
import base64
import io as _io
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from r2_vs_db import ENV, RAIZ, leer_env

API = "https://api.runware.ai/v1"

MODELO_FILL = "runware:102@1"
MODELO_DEV = "runware:101@1"
PASOS = 28
SEMILLA = 20260925

AUDITORIA = RAIZ / "herramientas" / "auditoria_mascaras"
BASE = AUDITORIA / "be045a99" / "semilla.png"      # la foto, 896x1344
MASCARA_BUFANDA = AUDITORIA / "be045a99" / "mascara.png"
MASCARA_PRENDA = AUDITORIA / "543e40ac" / "mascara.png"
SALIDA = RAIZ / "herramientas" / "agregar"

ANCHO, ALTO = 896, 1344

# Rojo de tela, no rojo de semáforo: la semilla tiene que afirmar algo que
# pueda existir bajo esta luz, si no el modelo tiene que elegir entre el color
# y la iluminación.
ROJO = (140, 28, 32)

# Gris claro de contraste: no es un color que se quiera en la prenda, es la
# forma hecha visible. Lo que se aprende de acá es si el color del resultado
# viene de lo pintado o del prompt.
GRIS = (150, 152, 155)

BUFANDA = (
    "A red wool scarf around the neck and falling over the chest, in soft "
    "knitted wool with visible fibres, natural folds where it drapes over "
    "itself, and the same ambient lighting, shading and edge sharpness as the "
    "cloth around it."
)

BOLSILLO = (
    "A patch pocket on the chest, in the same black knit fabric as the shirt, "
    "with a straight hemmed top edge and a stitched seam down each side, a "
    "soft shadow where it sits against the cloth, and the same weave, matte "
    "finish, thread scale and ambient lighting as the fabric around it."
)

# Los dos prompts del bolsillo con contraste. **La unica diferencia entre ellos
# es si el color se nombra o no**, y los dos empiezan por el bolsillo: en la
# celda anterior la frase arrancaba con "in the same black knit fabric" y el
# concepto visual mas fuerte gano, que es la regla del iman de siempre.
BOLSILLO_SIN_COLOR = (
    "A patch pocket sewn onto the chest of the shirt, with a straight hemmed "
    "top edge, a stitched seam down each side and along the bottom, and a soft "
    "shadow where it sits against the cloth, in the same knit fabric and the "
    "same ambient lighting as the garment around it."
)

BOLSILLO_CON_COLOR = (
    "A patch pocket sewn onto the chest of the shirt, with a straight hemmed "
    "top edge, a stitched seam down each side and along the bottom, and a soft "
    "shadow where it sits against the cloth, in black knit fabric and the same "
    "ambient lighting as the garment around it."
)

CUELLO = (
    "A mandarin collar, a narrow upright band of the same knit fabric "
    "standing around the neck and closed at the front, with a clean hemmed "
    "edge, soft folds where it meets the shoulders, and the same tone, matte "
    "finish and ambient lighting as the garment."
)

GORRA = (
    "A black baseball cap worn on the head, its rounded crown covering the "
    "hair with visible panel seams and a stitched button at the top, a short "
    "curved brim at the front, in the same ambient lighting and with the same "
    "edge sharpness as the rest of the photograph."
)

SERIGRAFIA = (
    "A screen printed cat graphic on the chest of the shirt, a simple flat "
    "illustration in white ink, its outline following the folds of the cloth "
    "and stretching with them, with the slightly absorbed matte look of ink "
    "printed on knit fabric, under the same ambient lighting as the garment."
)

# La escalera del prompt, contra la celda q como control. q es el prompt
# completo SIN color y devolvio un bolsillo celeste. Estas tres nombran el
# color y van quitando lo demas, para ver que componente hace falta de verdad.
BOLSILLO_COMPLETO_NEGRO = (
    "A black patch pocket sewn onto the chest of the shirt, with a straight "
    "hemmed top edge, a stitched seam down each side and along the bottom, "
    "and a soft shadow where it sits against the cloth, in the same knit "
    "fabric and the same ambient lighting as the garment around it."
)

BOLSILLO_MEDIO_NEGRO = (
    "A black patch pocket on the chest of the shirt, in the same knit fabric "
    "as the garment."
)

BOLSILLO_MINIMO_NEGRO = "A black patch pocket on the chest of the shirt."

RAYAS = (
    "Fine vertical navy and white striped cotton fabric. The stripes follow "
    "the drape of the garment and curve with the folds, with a fine weave, a "
    "matte finish, and the same shading, ambient lighting and edge sharpness "
    "as the cloth around it."
)


def color_de_la_prenda(base, prenda):
    """
    La mediana de los píxeles oscuros de la prenda, como en EXPERIMENTO_3.

    La mediana y no el promedio porque un reflejo brillante arrastra el
    promedio hacia un gris que la prenda no tiene en ninguna parte.
    """
    import numpy as np

    pix = np.asarray(base, dtype=np.float32)[prenda]
    luma = pix.mean(axis=1)
    oscuros = pix[luma <= np.percentile(luma, 60)]
    return tuple(int(v) for v in np.median(oscuros, axis=0))


def mascara_bufanda(prenda):
    """
    Una banda de bufanda alrededor del cuello y sobre el pecho alto.

    NO se usa la que pintó el usuario en la app, y la razón importa: esa cubría
    la mandíbula y se salía al fondo, porque fue pintada sobre la camisa y no
    alrededor del cuello. Rellenarla de rojo afirmaría "hay algo rojo sobre la
    cara", y el modelo lo habría obedecido. La celda habría fallado por una
    razón que no es la que se está preguntando.

    Se deriva de la prenda: arranca un poco por encima del hombro, donde va el
    cuello, baja al pecho alto, y se limita a las columnas centrales del cuerpo
    para no invadir el fondo.
    """
    import numpy as np

    ys, xs = np.nonzero(prenda)
    y0, y1 = ys.min(), ys.max()
    alto = y1 - y0

    columnas = prenda.any(axis=0)
    cx = np.nonzero(columnas)[0]
    centro, ancho = (cx.min() + cx.max()) // 2, cx.max() - cx.min()

    banda = np.zeros_like(prenda)
    # Arranca EN el borde superior de la prenda, nunca por encima. Medido: la
    # prenda empieza en la fila 546 de 1344, y una banda que subia 40 px caia
    # sobre la barbilla. Y se recorta contra la prenda, con lo que no puede
    # tocar ni la cara ni el fondo por construccion.
    iy0 = int(y0)
    iy1 = int(y0 + 0.16 * alto)
    ix0 = int(centro - 0.32 * ancho)
    ix1 = int(centro + 0.32 * ancho)
    banda[iy0:iy1, ix0:ix1] = True
    return banda & prenda


def mascara_bolsillo(prenda):
    """
    Un bolsillo de parche, con su forma, recortado contra la prenda.

    DOS CORRECCIONES sobre la primera versión, y las dos vienen de mirar el
    resultado:

    1. Estaba demasiado arriba, pegado al cuello. Un bolsillo de pecho va bien
       por debajo de la costura del hombro, así que baja del 16% al 30% de la
       altura de la prenda.

    2. Era un cuadrado perfecto. **Si la forma pintada es la instrucción,
       entonces la forma importa**: un bolsillo es un poco más alto que ancho y
       tiene las esquinas de abajo redondeadas. Pedirle a un cuadrado que se
       convierta en bolsillo es pedirle al modelo que corrija la instrucción.
    """
    import numpy as np

    ys, xs = np.nonzero(prenda)
    x0, x1 = xs.min(), xs.max()
    y0, y1 = ys.min(), ys.max()
    ancho, alto = x1 - x0, y1 - y0

    ix0 = int(x0 + 0.56 * ancho)
    ancho_b = int(0.15 * ancho)
    alto_b = int(ancho_b * 1.15)
    iy0 = int(y0 + 0.30 * alto)

    caja = np.zeros_like(prenda)
    caja[iy0:iy0 + alto_b, ix0:ix0 + ancho_b] = True

    # Las esquinas de abajo, redondeadas a mano: un cuarto de circulo de radio
    # un quinto del ancho, que es la proporcion de un bolsillo real.
    radio = max(2, ancho_b // 5)
    yy, xx = np.mgrid[0:prenda.shape[0], 0:prenda.shape[1]]
    for cx in (ix0 + radio, ix0 + ancho_b - radio):
        cy = iy0 + alto_b - radio
        fuera = ((yy > cy) & (((xx - cx) ** 2 + (yy - cy) ** 2) > radio ** 2))
        lado = (xx < ix0 + radio) if cx == ix0 + radio else (xx > ix0 + ancho_b - radio)
        caja &= ~(fuera & lado)

    return caja & prenda


def mascara_cuello(prenda):
    """
    La franja del cuello de la prenda.

    NO se mide desde el borde superior de la máscara, y esa fue una correccion
    cara de encontrar: **la seleccion de la prenda incluye el cuello de la
    persona**, porque en sombra es casi tan oscuro como la camisa y el relleno
    por inundacion lo tomo. Medir desde ahi ponia la banda sobre la barbilla.

    La referencia buena es la linea de hombros, definida como la primera fila
    donde la prenda alcanza la mitad de su ancho maximo. Eso no depende de
    pixeles sueltos ni de lo que la seleccion haya arrastrado de mas.
    """
    import numpy as np

    anchos = prenda.sum(axis=1)
    hombros = int(np.nonzero(anchos >= anchos.max() * 0.5)[0].min())
    ys = np.nonzero(anchos)[0]
    alto = ys.max() - ys.min()
    columnas = np.nonzero(prenda.any(axis=0))[0]
    centro, ancho = (columnas.min() + columnas.max()) // 2, columnas.max() - columnas.min()

    banda = np.zeros_like(prenda)
    banda[int(hombros - 0.05 * alto):int(hombros + 0.09 * alto),
          int(centro - 0.22 * ancho):int(centro + 0.22 * ancho)] = True
    return banda


def mascara_gorra(base, prenda):
    """
    La corona de la cabeza y la frente, donde se apoya una gorra.

    La cara se ubica por piel, pero **no por el primer pixel de piel**: cuatro
    pixeles sueltos en una fila corren la referencia decenas de pixeles. Se usa
    la primera fila que tiene al menos un quinto del maximo de piel por fila,
    que es donde empieza la frente de verdad.
    """
    import numpy as np

    pix = np.asarray(base, np.float32)
    r, g, b = pix[..., 0], pix[..., 1], pix[..., 2]
    piel = (r > 95) & (g > 40) & (b > 20) & (r > g) & (g > b) & ((r - b) > 15)
    piel[np.nonzero(prenda.sum(axis=1))[0].min():, :] = False

    por_fila = piel.sum(axis=1)
    if por_fila.max() == 0:
        raise SystemExit("No encontre la cara para ubicar la gorra")
    filas = np.nonzero(por_fila >= por_fila.max() * 0.2)[0]
    frente, menton = int(filas.min()), int(filas.max())
    cara = menton - frente
    columnas = np.nonzero(piel.any(axis=0))[0]
    centro, ancho = (columnas.min() + columnas.max()) // 2, columnas.max() - columnas.min()

    caja = np.zeros_like(prenda)
    # Medido mirando la lamina: a 0.60 por encima de la frente la caja flotaba
    # sobre el fondo y cortaba el pelo por la mitad. Una gorra va de la corona
    # a las cejas, no del aire a la mitad del craneo.
    caja[max(0, int(frente - 0.32 * cara)):int(frente + 0.25 * cara),
         int(centro - 0.72 * ancho):int(centro + 0.72 * ancho)] = True
    return caja


def mascara_pecho(prenda):
    """
    El centro del pecho, donde va una serigrafia.

    Centrada sobre la prenda y no sobre la imagen: el hombre no esta centrado
    en la foto, y una estampa corrida media cabeza a un lado se veria mal por
    una razon que no tiene nada que ver con el modelo.
    """
    import numpy as np

    anchos = prenda.sum(axis=1)
    hombros = int(np.nonzero(anchos >= anchos.max() * 0.5)[0].min())
    ys = np.nonzero(anchos)[0]
    alto = ys.max() - ys.min()

    # El centro del torso a la altura del pecho, no el centro del recorte
    # entero: las mangas caidas corren el promedio hacia un lado.
    fila = int(hombros + 0.30 * alto)
    columnas = np.nonzero(prenda[fila])[0]
    centro = (columnas.min() + columnas.max()) // 2
    ancho = columnas.max() - columnas.min()

    caja = np.zeros_like(prenda)
    # Mas o menos cuadrada, que es la proporcion de una estampa de pecho: la
    # primera version salio apaisada y una serigrafia apaisada no existe.
    caja[int(hombros + 0.15 * alto):int(hombros + 0.50 * alto),
         int(centro - 0.17 * ancho):int(centro + 0.17 * ancho)] = True
    return caja & prenda


def mascara_bolsillo_ancha(prenda, bolsillo):
    """
    El bolsillo mas el pecho alrededor, para aislar el contexto.

    La pregunta que contesta: si dev no dibujo el bolsillo porque la zona era
    chica y estaba rodeada de tela uniforme, una zona mas grande deberia
    cambiar el resultado. Si tampoco, el tamano no era la causa.
    """
    import numpy as np

    ys, xs = np.nonzero(bolsillo)
    alto = ys.max() - ys.min()
    ancho = xs.max() - xs.min()
    caja = np.zeros_like(prenda)
    caja[max(0, int(ys.min() - 0.55 * alto)):int(ys.max() + 0.55 * alto),
         max(0, int(xs.min() - 0.55 * ancho)):int(xs.max() + 0.55 * ancho)] = True
    return caja & prenda


def como_datos(imagen) -> str:
    memoria = _io.BytesIO()
    imagen.save(memoria, format="PNG")
    return "data:image/png;base64," + base64.b64encode(memoria.getvalue()).decode()


def llamar(clave: str, tarea: dict):
    pedido = urllib.request.Request(
        API,
        method="POST",
        data=json.dumps([tarea]).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + clave},
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


def bajar(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=180) as respuesta:
        return respuesta.read()


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirmar", action="store_true")
    parser.add_argument("--celdas", default="a,b,c,d,e")
    # La carpeta se elige: una sola con veinte imagenes de cinco preguntas
    # distintas deja de ser revisable, y revisar es la mitad del experimento.
    parser.add_argument("--carpeta", default="agregar")
    args = parser.parse_args()

    import numpy as np
    from PIL import Image

    if not BASE.exists():
        sys.exit("Falta la base. Corre antes auditar_mascara.py")

    env = leer_env(ENV)
    clave = env.get("RUNWARE_API_KEY")
    if args.confirmar and not clave:
        sys.exit("Falta RUNWARE_API_KEY en .env.local")

    global SALIDA
    SALIDA = RAIZ / "herramientas" / args.carpeta
    SALIDA.mkdir(parents=True, exist_ok=True)

    base = Image.open(BASE).convert("RGB")
    m_prenda = Image.open(MASCARA_PRENDA).convert("L").resize(base.size, Image.NEAREST)

    prenda = np.asarray(m_prenda, np.float32) / 255.0 > 0.5
    bufanda = mascara_bufanda(prenda)
    m_bufanda = Image.fromarray((bufanda * 255).astype(np.uint8))
    bolsillo = mascara_bolsillo(prenda)

    tela = color_de_la_prenda(base, prenda)
    print("\nColor de la prenda (mediana de lo oscuro): " + str(tela))
    print("Cobertura: bufanda %.2f%%   prenda %.2f%%   bolsillo %.2f%%" % (
        bufanda.mean() * 100, prenda.mean() * 100, bolsillo.mean() * 100))

    # Las dos semillas preparadas: pintar es afirmar.
    pix = np.asarray(base, np.uint8).copy()
    pix[bufanda] = ROJO
    semilla_bufanda = Image.fromarray(pix)

    pix = np.asarray(base, np.uint8).copy()
    pix[bolsillo] = tela
    semilla_bolsillo = Image.fromarray(pix)

    pix = np.asarray(base, np.uint8).copy()
    pix[bolsillo] = GRIS
    semilla_bolsillo_gris = Image.fromarray(pix)
    semilla_bolsillo_gris.save(SALIDA / "entrada_semilla_bolsillo_gris.png")

    # La escalera de contraste: el mismo bolsillo, pintado con el tono de la
    # prenda mas 35 y mas 70 de luz. Todo lo medido hasta acá fue en los
    # extremos, cero contraste (falla) y gris claro (funciona); esto busca el
    # piso, que es el dato que sirve para la interfaz.
    semillas_contraste = {}
    for salto in (35, 70):
        pix = np.asarray(base, np.uint8).copy()
        pix[bolsillo] = tuple(min(255, c + salto) for c in tela)
        semillas_contraste[salto] = Image.fromarray(pix)
        semillas_contraste[salto].save(SALIDA / ("entrada_semilla_bolsillo_%d.png" % salto))

    m_cuello = Image.fromarray((mascara_cuello(prenda) * 255).astype(np.uint8))
    m_gorra = Image.fromarray((mascara_gorra(base, prenda) * 255).astype(np.uint8))
    m_cuello.save(SALIDA / "entrada_mascara_cuello.png")
    m_gorra.save(SALIDA / "entrada_mascara_gorra.png")

    m_bolsillo = Image.fromarray((bolsillo * 255).astype(np.uint8))
    m_bolsillo_ancha = Image.fromarray(
        (mascara_bolsillo_ancha(prenda, bolsillo) * 255).astype(np.uint8))
    m_pecho = Image.fromarray((mascara_pecho(prenda) * 255).astype(np.uint8))
    m_bolsillo_ancha.save(SALIDA / "entrada_mascara_bolsillo_ancha.png")
    m_pecho.save(SALIDA / "entrada_mascara_pecho.png")
    m_bufanda.save(SALIDA / "entrada_mascara_bufanda.png")

    semilla_bufanda.save(SALIDA / "entrada_semilla_bufanda.png")
    semilla_bolsillo.save(SALIDA / "entrada_semilla_bolsillo.png")
    m_bolsillo.save(SALIDA / "entrada_mascara_bolsillo.png")

    comun = {
        "taskType": "imageInference",
        "seed": SEMILLA,
        "steps": PASOS,
        "numberResults": 1,
        "outputFormat": "PNG",
        "includeCost": True,
        "width": ANCHO,
        "height": ALTO,
    }

    celdas = {
        "a": ("bufanda_fill", semilla_bufanda, m_bufanda, dict(
            comun, model=MODELO_FILL, positivePrompt=BUFANDA,
            inputs={"seedImage": como_datos(semilla_bufanda),
                    "maskImage": como_datos(m_bufanda)})),
        "b": ("bolsillo_fill", semilla_bolsillo, m_bolsillo, dict(
            comun, model=MODELO_FILL, positivePrompt=BOLSILLO,
            inputs={"seedImage": como_datos(semilla_bolsillo),
                    "maskImage": como_datos(m_bolsillo)})),
        "c": ("bolsillo_margen", semilla_bolsillo, m_bolsillo, dict(
            comun, model=MODELO_FILL, positivePrompt=BOLSILLO, maskMargin=128,
            inputs={"seedImage": como_datos(semilla_bolsillo),
                    "maskImage": como_datos(m_bolsillo)})),
        "d": ("rayas_dev", base, m_prenda, dict(
            comun, model=MODELO_DEV, positivePrompt=RAYAS, strength=1.0,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_prenda)})),
        "e": ("bufanda_dev", base, m_bufanda, dict(
            comun, model=MODELO_DEV, positivePrompt=BUFANDA, strength=0.9,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_bufanda)})),
        # La escalera de `strength`, buscando donde el prompt manda sin que la
        # prenda se pierda. Los valores no son al azar: la documentacion de
        # inpainting de Runware muestra una escalera de 0.1 a 1.0 y dice que el
        # sujeto pedido aparece "at around 0.7 to 0.8", que por debajo no
        # alcanza y que por encima se pierde la composicion. Medido acá: 1.0
        # destruyo la prenda. Estas dos celdas caen a los lados de ese rango.
        "f": ("rayas_dev_070", base, m_prenda, dict(
            comun, model=MODELO_DEV, positivePrompt=RAYAS, strength=0.70,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_prenda)})),
        # El bolsillo otra vez, ahora con dev. La celda b fallo con Fill porque
        # un parche del color de la prenda afirma "tela lisa". dev no necesita
        # que le preparen la semilla: la llena de ruido en proporcion a
        # `strength`. Y la mascara es CHICA, 1.16% contra el 46.74% de la
        # prenda entera: si el corte se perdio en f y g fue porque se enmascaro
        # la prenda completa, no por el modelo.
        #
        # La segunda celda agrega `maskMargin`, que dev si acepta. La
        # documentacion dice que recorta la zona con ese margen, genera a mayor
        # resolucion efectiva y la reintegra, y que 32 a 64 es lo optimo.
        # Con CONTRASTE: el rectangulo va en gris claro, no del color de la
        # prenda. Lo que hizo funcionar la bufanda fue que la semilla afirmaba
        # un contorno; un parche negro sobre tela negra no afirma ninguno.
        "j": ("bolsillo_gris_sin_color", semilla_bolsillo_gris, m_bolsillo, dict(
            comun, model=MODELO_FILL, positivePrompt=BOLSILLO_SIN_COLOR,
            inputs={"seedImage": como_datos(semilla_bolsillo_gris),
                    "maskImage": como_datos(m_bolsillo)})),
        "k": ("bolsillo_gris_con_color", semilla_bolsillo_gris, m_bolsillo, dict(
            comun, model=MODELO_FILL, positivePrompt=BOLSILLO_CON_COLOR,
            inputs={"seedImage": como_datos(semilla_bolsillo_gris),
                    "maskImage": como_datos(m_bolsillo)})),
        "l": ("bolsillo_mas35", semillas_contraste[35], m_bolsillo, dict(
            comun, model=MODELO_FILL, positivePrompt=BOLSILLO_SIN_COLOR,
            inputs={"seedImage": como_datos(semillas_contraste[35]),
                    "maskImage": como_datos(m_bolsillo)})),
        "m": ("bolsillo_mas70", semillas_contraste[70], m_bolsillo, dict(
            comun, model=MODELO_FILL, positivePrompt=BOLSILLO_SIN_COLOR,
            inputs={"seedImage": como_datos(semillas_contraste[70]),
                    "maskImage": como_datos(m_bolsillo)})),
        # Cuello y gorra con dev: Fill no contradice lo que ve, asi que sobre
        # un cuello devolveria el mismo cuello y sobre el pelo, pelo. dev a
        # 0.85 ya demostro que redibuja lo enmascarado, y la mascara es chica,
        # que es lo que evita que reinterprete la prenda entera.
        "n": ("cuello_dev", base, m_cuello, dict(
            comun, model=MODELO_DEV, positivePrompt=CUELLO, strength=0.85,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_cuello)})),
        "o": ("gorra_dev", base, m_gorra, dict(
            comun, model=MODELO_DEV, positivePrompt=GORRA, strength=0.85,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_gorra)})),
        # p y q separan por que la gorra funciono sin pintar y el bolsillo no.
        # Mismo modelo, mismo strength, ninguna semilla preparada: lo unico
        # que cambia entre p y la celda h es el PROMPT, y entre p y q, el
        # tamano de la mascara.
        "p": ("bolsillo_dev_prompt", base, m_bolsillo, dict(
            comun, model=MODELO_DEV, positivePrompt=BOLSILLO_SIN_COLOR,
            strength=0.85,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_bolsillo)})),
        "q": ("bolsillo_dev_ancha", base, m_bolsillo_ancha, dict(
            comun, model=MODELO_DEV, positivePrompt=BOLSILLO_SIN_COLOR,
            strength=0.85,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_bolsillo_ancha)})),
        "r": ("serigrafia_gato", base, m_pecho, dict(
            comun, model=MODELO_DEV, positivePrompt=SERIGRAFIA, strength=0.85,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_pecho)})),
        "s": ("prompt_completo", base, m_bolsillo_ancha, dict(
            comun, model=MODELO_DEV, positivePrompt=BOLSILLO_COMPLETO_NEGRO,
            strength=0.85,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_bolsillo_ancha)})),
        "t": ("prompt_medio", base, m_bolsillo_ancha, dict(
            comun, model=MODELO_DEV, positivePrompt=BOLSILLO_MEDIO_NEGRO,
            strength=0.85,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_bolsillo_ancha)})),
        "u": ("prompt_minimo", base, m_bolsillo_ancha, dict(
            comun, model=MODELO_DEV, positivePrompt=BOLSILLO_MINIMO_NEGRO,
            strength=0.85,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_bolsillo_ancha)})),
        "h": ("bolsillo_dev", base, m_bolsillo, dict(
            comun, model=MODELO_DEV, positivePrompt=BOLSILLO, strength=0.85,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_bolsillo)})),
        "i": ("bolsillo_dev_margen", base, m_bolsillo, dict(
            comun, model=MODELO_DEV, positivePrompt=BOLSILLO, strength=0.85,
            maskMargin=64,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_bolsillo)})),
        "g": ("rayas_dev_085", base, m_prenda, dict(
            comun, model=MODELO_DEV, positivePrompt=RAYAS, strength=0.85,
            inputs={"seedImage": como_datos(base),
                    "maskImage": como_datos(m_prenda)})),
    }

    pedidas = [c.strip() for c in args.celdas.split(",") if c.strip()]
    print("")
    for c in pedidas:
        nombre, _, _, tarea = celdas[c]
        extra = ""
        if "strength" in tarea:
            extra += "  strength " + str(tarea["strength"])
        if "maskMargin" in tarea:
            extra += "  maskMargin " + str(tarea["maskMargin"])
        print("  %s %-16s %s%s" % (c, nombre, tarea["model"], extra))

    if not args.confirmar:
        # La lamina de ENTRADAS, para poder mirar lo que se va a mandar antes
        # de mandarlo: una semilla mal preparada arruina la celda y se paga.
        tiras = [base, semilla_bufanda, semilla_bolsillo,
                 m_bufanda.convert("RGB"), m_bolsillo.convert("RGB")]
        alto = 480
        esc = [t.resize((int(t.width * alto / t.height), alto)) for t in tiras]
        lienzo = Image.new("RGB", (sum(e.width for e in esc) + 10 * len(esc), alto), "white")
        x = 0
        for e in esc:
            lienzo.paste(e, (x, 0))
            x += e.width + 10
        lienzo.save(SALIDA / "entradas.png")
        print("\nENSAYO EN SECO. Nada se envio, nada se cobro.")
        print("Entradas para mirar: " + str(SALIDA / "entradas.png"))
        print("Orden: base, semilla bufanda, semilla bolsillo, mascara bufanda, mascara bolsillo\n")
        return 0

    total = 0.0
    resultados = {}
    for c in pedidas:
        nombre, semilla, mascara, tarea = celdas[c]
        tarea = dict(tarea, taskUUID=str(uuid.uuid4()))
        print("\n[" + c + "] " + nombre + " ...")
        datos, tardo, error = llamar(clave, tarea)
        if error:
            print("  ERROR (no se cobra): " + error)
            continue
        costo = datos.get("cost")
        total += costo or 0.0
        print("  ok en %.1fs   costo %s" % (tardo, costo))
        imagen = Image.open(_io.BytesIO(bajar(datos["imageURL"]))).convert("RGB")
        imagen.save(SALIDA / (c + "_" + nombre + ".png"))
        resultados[c] = (nombre, semilla, mascara, imagen)

    print("\nGASTADO: $%.4f\n" % total)

    print("Dentro de la mascara, contra la semilla que se le entrego:")
    for c, (nombre, semilla, mascara, imagen) in resultados.items():
        if imagen.size != semilla.size:
            semilla = semilla.resize(imagen.size, Image.LANCZOS)
        mk = np.asarray(mascara.resize(imagen.size, Image.NEAREST), np.float32) / 255.0 > 0.5
        a = np.asarray(semilla, np.float32)
        b = np.asarray(imagen, np.float32)
        dif = np.abs(a - b).mean(axis=2)
        rojez = (b[..., 0] - b[..., 1:].mean(axis=2))[mk].mean()
        print("  %-16s cambio %6.2f   >32 %5.1f%%   desviacion %6.2f   rojez %6.2f"
              % (nombre, dif[mk].mean(), float((dif[mk] > 32).mean()) * 100,
                 b.mean(axis=2)[mk].std(), rojez))

    tiras = [("base", base)] + [(n, i) for _, (n, _, _, i) in resultados.items()]
    alto = 480
    esc = [im.resize((int(im.width * alto / im.height), alto)) for _, im in tiras]
    lienzo = Image.new("RGB", (sum(e.width for e in esc) + 10 * len(esc), alto), "white")
    x = 0
    for e in esc:
        lienzo.paste(e, (x, 0))
        x += e.width + 10
    lienzo.save(SALIDA / "lamina.png")
    print("\nLamina: " + str(SALIDA / "lamina.png"))
    print("Orden: " + ", ".join(n for n, _ in tiras) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
