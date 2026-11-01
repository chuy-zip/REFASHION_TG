"""
Por qué "Textura" no cambia nada en la app, y qué hay que cambiar.

EL PUNTO DE PARTIDA, MEDIDO. En la app se pidieron rayas verticales sobre una
camisa negra y volvió la misma camisa negra. `auditar_mascara.py` descartó a la
máscara: cubría la prenda entera, del tamaño correcto, y el modelo repintó
adentro (27.7% de los píxeles cambiaron algo) pero repintó lo mismo. Es la regla
que ya estaba escrita en `EXPERIMENTO_3`:

    FLUX Fill no contradice lo que ve debajo de la máscara.

Y ese mismo documento termina con un pendiente que nunca se cumplió: "la técnica
de preparar la semilla es lo que hay que llevar a la app". La app manda la
imagen de trabajo tal cual, así que Textura y Forma le están pidiendo al modelo
justo lo único que sabemos que no hace.

LAS CUATRO CELDAS. Misma semilla de imagen, misma máscara, mismo prompt, misma
semilla numérica. Cambia UNA cosa por celda, que es lo que permite atribuir.

    a  base            como manda la app hoy                        $0.0038
    b  semilla_lisa    la zona enmascarada aplanada a un tono liso   $0.0038
    c  true_cfg        `trueCFGScale`, declarado por el esquema y
                       nunca probado: activa la guía real           $0.0038
    d  kontext         el modelo que edita, con la misma orden       $0.0130

`CFGScale` sí se probó y no movió nada (`EXPERIMENTO_2`). `trueCFGScale` es otro
parámetro: el esquema oficial de `runware:102@1` lo declara aparte y dice que
sube la adherencia al prompt. No se envía `negativePrompt` en ninguna celda: no
tiene canal negativo y las palabras actúan de imán (`EXPERIMENTO_3`).

QUÉ SE MIDE. Contra la semilla de cada celda, dentro de la máscara: diferencia
media, porcentaje de píxeles que cambiaron de verdad, y cuánta varianza de color
tiene el resultado, que es lo que distingue "rayas" de "tela lisa". Y una lámina
para mirarlas.

CUESTA DINERO: $0.0244 en total. No corre sin `--confirmar`.

Uso:

    python herramientas/probar_textura.py                 # ensayo en seco
    python herramientas/probar_textura.py --confirmar
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
MODELO_KONTEXT = "runware:106@1"
PASOS = 28

# Fija, para que la comparación entre celdas sea de una variable y no del azar.
SEMILLA = 20260925

# Las imágenes reales del caso que falló, bajadas de R2 por `auditar_mascara.py`.
CASO = RAIZ / "herramientas" / "auditoria_mascaras" / "543e40ac"
SALIDA = RAIZ / "herramientas" / "textura"

# El tamaño al que la app encajó este pedido. Se reescala acá para que el
# proveedor no tenga que hacerlo por su cuenta: una variable menos.
ANCHO, ALTO = 896, 1344
# Kontext solo acepta tamaños de una lista cerrada, y este es el de la semilla.
ANCHO_KONTEXT, ALTO_KONTEXT = 832, 1248

# El mismo texto que se escribió en la app.
PROMPT = (
    "Fine vertical navy and white striped cotton fabric. The stripes follow "
    "the drape of the garment and curve with the folds, with a fine weave, a "
    "matte finish, and the same shading, ambient lighting and edge sharpness "
    "as the cloth around it."
)

# Kontext recibe una orden, no una descripción de lo que va en un hueco. Sin
# cláusula de preservación: nombrar lo que se quiere conservar lo invoca.
ORDEN = (
    "Change the fabric of the shirt to fine vertical navy and white stripes. "
    "The stripes follow the drape of the cloth and curve with the folds."
)

TRUE_CFG = 4.0


def cargar():
    from PIL import Image

    semilla = Image.open(CASO / "semilla.png").convert("RGB")
    mascara = Image.open(CASO / "mascara.png").convert("L")
    return semilla, mascara


def preparar_semilla(semilla, mascara):
    """
    Tapa la zona enmascarada con un tono liso, que es la técnica medida.

    `EXPERIMENTO_3` lo hizo con el color de la prenda para que el modelo viera
    paño en vez de un brazo. Acá el objetivo es el contrario: lo que estorba ES
    la prenda, porque una camisa negra lisa desmiente unas rayas azules y
    blancas. Así que el relleno es un gris medio neutro, que no afirma ni color
    ni trama y deja al prompt sin nada que contradecir.
    """
    import numpy as np
    from PIL import Image

    base = np.asarray(semilla, dtype=np.uint8).copy()
    m = np.asarray(mascara, dtype=np.float32) / 255.0
    base[m > 0.5] = (128, 128, 128)
    return Image.fromarray(base)


def como_datos(imagen, formato: str = "PNG") -> str:
    """Data URI. El esquema las acepta y evita subir a ningún lado."""
    memoria = _io.BytesIO()
    imagen.save(memoria, format=formato)
    return "data:image/png;base64," + base64.b64encode(memoria.getvalue()).decode()


def llamar(clave: str, tarea: dict):
    """Devuelve (resultado, segundos, error). Un rechazo NO se cobra."""
    pedido = urllib.request.Request(
        API,
        method="POST",
        data=json.dumps([tarea]).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + clave,
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


def bajar(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=180) as respuesta:
        return respuesta.read()


def medir(nombre, semilla, resultado, mascara):
    """Cuánto cambió dentro de la máscara, y cuánta estructura tiene ahora."""
    import numpy as np
    from PIL import Image

    if resultado.size != semilla.size:
        semilla = semilla.resize(resultado.size, Image.LANCZOS)
    m = mascara
    if m.size != resultado.size:
        m = m.resize(resultado.size, Image.NEAREST)

    mask = np.asarray(m, dtype=np.float32) / 255.0 > 0.5
    a = np.asarray(semilla, dtype=np.float32)
    b = np.asarray(resultado, dtype=np.float32)
    dif = np.abs(a - b).mean(axis=2)

    gris = b.mean(axis=2)
    # Desviación local: una tela lisa la tiene cerca de cero, unas rayas no.
    recorte = gris[mask]
    print(
        "  %-14s cambio medio %6.2f   >8 %5.1f%%   >32 %5.1f%%   "
        "desviacion dentro %6.2f"
        % (
            nombre,
            dif[mask].mean(),
            float((dif[mask] > 8).mean()) * 100,
            float((dif[mask] > 32).mean()) * 100,
            recorte.std(),
        )
    )


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirmar", action="store_true", help="llama de verdad y gasta")
    parser.add_argument("--celdas", default="a,b,c,d")
    args = parser.parse_args()

    from PIL import Image

    if not (CASO / "semilla.png").exists():
        sys.exit("Faltan las imagenes del caso. Corre antes auditar_mascara.py")

    env = leer_env(ENV)
    clave = env.get("RUNWARE_API_KEY")
    if args.confirmar and not clave:
        sys.exit("Falta RUNWARE_API_KEY en .env.local")

    semilla_orig, mascara_orig = cargar()
    semilla = semilla_orig.resize((ANCHO, ALTO), Image.LANCZOS)
    mascara = mascara_orig.resize((ANCHO, ALTO), Image.NEAREST)
    lisa = preparar_semilla(semilla, mascara)

    SALIDA.mkdir(parents=True, exist_ok=True)
    lisa.save(SALIDA / "semilla_lisa.png")

    comun = {
        "taskType": "imageInference",
        "seed": SEMILLA,
        "steps": PASOS,
        "numberResults": 1,
        "outputFormat": "PNG",
        "includeCost": True,
    }

    celdas = {
        "a": {
            "nombre": "base",
            "semilla": semilla,
            "tarea": dict(
                comun,
                model=MODELO_FILL,
                positivePrompt=PROMPT,
                width=ANCHO,
                height=ALTO,
                inputs={
                    "seedImage": como_datos(semilla),
                    "maskImage": como_datos(mascara),
                },
            ),
        },
        "b": {
            "nombre": "semilla_lisa",
            "semilla": lisa,
            "tarea": dict(
                comun,
                model=MODELO_FILL,
                positivePrompt=PROMPT,
                width=ANCHO,
                height=ALTO,
                inputs={
                    "seedImage": como_datos(lisa),
                    "maskImage": como_datos(mascara),
                },
            ),
        },
        "c": {
            "nombre": "true_cfg",
            "semilla": semilla,
            "tarea": dict(
                comun,
                model=MODELO_FILL,
                positivePrompt=PROMPT,
                width=ANCHO,
                height=ALTO,
                trueCFGScale=TRUE_CFG,
                inputs={
                    "seedImage": como_datos(semilla),
                    "maskImage": como_datos(mascara),
                },
            ),
        },
        "d": {
            "nombre": "kontext",
            "semilla": semilla_orig,
            "tarea": dict(
                comun,
                model=MODELO_KONTEXT,
                positivePrompt=ORDEN,
                width=ANCHO_KONTEXT,
                height=ALTO_KONTEXT,
                inputs={"referenceImages": [como_datos(semilla_orig)]},
            ),
        },
    }

    pedidas = [c.strip() for c in args.celdas.split(",") if c.strip()]
    print("\nCeldas: " + ", ".join(pedidas))
    for c in pedidas:
        celda = celdas[c]
        tarea = celda["tarea"]
        print(
            "  %s %-14s modelo %-18s %dx%d  pasos %s%s"
            % (
                c,
                celda["nombre"],
                tarea["model"],
                tarea["width"],
                tarea["height"],
                tarea["steps"],
                "  trueCFGScale " + str(tarea["trueCFGScale"])
                if "trueCFGScale" in tarea
                else "",
            )
        )

    if not args.confirmar:
        print("\nENSAYO EN SECO. Nada se envio, nada se cobro.")
        print("Para correrlo de verdad: --confirmar\n")
        return 0

    total = 0.0
    resultados = {}
    for c in pedidas:
        celda = celdas[c]
        tarea = dict(celda["tarea"], taskUUID=str(uuid.uuid4()))
        print("\n[" + c + "] " + celda["nombre"] + " ...")
        datos, tardo, error = llamar(clave, tarea)
        if error:
            print("  ERROR (no se cobra): " + error)
            continue
        costo = datos.get("cost")
        total += costo or 0.0
        print("  ok en %.1fs   costo %s" % (tardo, costo))
        imagen = Image.open(_io.BytesIO(bajar(datos["imageURL"]))).convert("RGB")
        destino = SALIDA / (c + "_" + celda["nombre"] + ".png")
        imagen.save(destino)
        resultados[c] = imagen
        print("  " + str(destino.name) + "  " + str(imagen.size))

    print("\nGASTADO: $%.4f\n" % total)

    print("Medidas dentro de la mascara, contra la semilla de cada celda:")
    for c, imagen in resultados.items():
        medir(celdas[c]["nombre"], celdas[c]["semilla"], imagen, mascara)

    # La lamina: semilla, semilla lisa y cada resultado, para mirarlas juntas.
    tiras = [("semilla", semilla), ("lisa", lisa)]
    tiras += [(celdas[c]["nombre"], img) for c, img in resultados.items()]
    alto = 520
    escaladas = [
        im.resize((int(im.width * alto / im.height), alto)) for _, im in tiras
    ]
    lienzo = Image.new(
        "RGB", (sum(i.width for i in escaladas) + 10 * len(escaladas), alto), "white"
    )
    x = 0
    for im in escaladas:
        lienzo.paste(im, (x, 0))
        x += im.width + 10
    lienzo.save(SALIDA / "lamina.png")
    print("\nLamina: " + str(SALIDA / "lamina.png"))
    print("Orden: " + ", ".join(n for n, _ in tiras) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
