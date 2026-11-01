"""
¿Aceptan WEBP como ENTRADA los cuatro modelos que reciben imágenes?

POR QUÉ. Guardar las generaciones en WEBP en vez de PNG las achica entre 16 y
26 veces (medido con Pillow sobre una generación real: 3.45 MB contra 0.13 MB a
calidad 95). Un diseño pasa de 22 MB a menos de 1, que es la espera de siete
segundos al abrir la pantalla de diseño.

Pero en esta cadena **cada generación es la entrada de la siguiente**, así que
el formato de salida solo sirve si también se acepta de entrada. Y eso no está
documentado: la página de image-to-image no menciona formatos, y la de Media
Storage solo dice "URL, Data URI o Base64". Si un solo modelo lo rechaza, ese
camino de la app se rompe en el segundo paso.

QUÉ PRUEBA, uno por modelo que recibe imágenes:

    102  FLUX Fill          seedImage WEBP + maskImage PNG
    101  FLUX dev, máscara  seedImage WEBP + maskImage PNG, con strength
    106  Kontext            referenceImages WEBP
    p-image  prueba virtual  dos referenceImages WEBP

**Por URL firmada de R2, no por Data URI.** Es el camino real: el proveedor
tiene que buscar la URL, reconocer el tipo por el `Content-Type` que pusimos al
subir, y recién ahí decodificar. Un Data URI probaría solo el decodificador.

Las máscaras van en PNG a propósito: las hace el navegador y seguirían siendo
PNG, así que la mezcla de formatos es la que va a ocurrir de verdad.

DE PASO contesta dos cosas más, gratis: qué devuelve el proveedor con
`outputFormat: "WEBP"` y cuánto pesa con SU codificador, y si la cabecera de
ese WEBP cae dentro de los primeros 64 bytes, que es lo que `measureObject`
puede leer sin descargar la imagen.

Pasos y tamaño al mínimo: acá importa si acepta, no qué tan lindo sale.

CUESTA DINERO: unos $0.020, con techo de $0.030. No corre sin `--confirmar`.
Los objetos de prueba se borran de R2 al terminar.

Uso:

    python herramientas/probar_webp.py
    python herramientas/probar_webp.py --confirmar
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

from r2_vs_db import ENV, RAIZ, leer_env

API = "https://api.runware.ai/v1"
PASOS = 10
SEMILLA = 20260925

ORIGEN = RAIZ / "herramientas" / "auditoria_mascaras" / "543e40ac"
SALIDA = RAIZ / "herramientas" / "webp"

# Cuadrado y chico: multiplo de 64 para Fill y dev, y para Kontext se usa el
# tamano de su lista cerrada que menos se aleja.
LADO = 512
KONTEXT = (1024, 1024)

PREFIJO = "pruebas/webp-" + uuid.uuid4().hex[:8]


def cliente_r2(env):
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=env["R2_ENDPOINT"],
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def subir(cliente, bucket, clave, datos, tipo):
    cliente.put_object(Bucket=bucket, Key=clave, Body=datos, ContentType=tipo)


def firmar(cliente, bucket, clave, minutos=60):
    return cliente.generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": clave},
        ExpiresIn=minutos * 60,
    )


def llamar(clave_api, tarea):
    pedido = urllib.request.Request(
        API, method="POST", data=json.dumps([tarea]).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + clave_api},
    )
    comenzo = time.monotonic()
    try:
        with urllib.request.urlopen(pedido, timeout=300) as respuesta:
            cuerpo = json.loads(respuesta.read())
    except urllib.error.HTTPError as error:
        return None, time.monotonic() - comenzo, error.read().decode("utf-8", "replace")[:400]
    tardo = time.monotonic() - comenzo
    if "errors" in cuerpo:
        return None, tardo, json.dumps(cuerpo["errors"], ensure_ascii=False)[:400]
    return cuerpo["data"][0], tardo, None


def cabecera(datos: bytes) -> str:
    """Qué es y si sus medidas caben en los primeros 64 bytes."""
    if datos[:8] == b"\x89PNG\r\n\x1a\n":
        ancho = int.from_bytes(datos[16:20], "big")
        alto = int.from_bytes(datos[20:24], "big")
        return "PNG %dx%d, medidas en el byte 16" % (ancho, alto)
    if datos[:4] == b"RIFF" and datos[8:12] == b"WEBP":
        tipo = datos[12:16].decode("ascii", "replace")
        if tipo == "VP8 ":
            ancho = int.from_bytes(datos[26:28], "little") & 0x3FFF
            alto = int.from_bytes(datos[28:30], "little") & 0x3FFF
            return "WEBP con perdida (VP8), %dx%d, medidas en el byte 26" % (ancho, alto)
        if tipo == "VP8L":
            bits = int.from_bytes(datos[21:25], "little")
            return "WEBP sin perdida (VP8L), %dx%d, medidas en el byte 21" % (
                (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1)
        if tipo == "VP8X":
            ancho = int.from_bytes(datos[24:27], "little") + 1
            alto = int.from_bytes(datos[27:30], "little") + 1
            return "WEBP extendido (VP8X), %dx%d, medidas en el byte 24" % (ancho, alto)
        return "WEBP de tipo " + tipo + ", NO reconocido"
    return "formato desconocido: " + repr(datos[:12])


def vton_real(env, confirmar: bool) -> int:
    """
    Una prueba virtual con entradas WEBP y un par que tiene sentido.

    Misma foto de persona y misma prenda que el experimento 4, para que el
    resultado se pueda comparar contra el que ya está documentado en PNG. Lo
    único que cambia es el formato de las dos entradas.
    """
    from PIL import Image

    persona = RAIZ / "herramientas" / "shirts_vton" / "high_qual_test.jpg"
    prenda = RAIZ / "herramientas" / "shirts_vton" / "007_shirt.jpg"

    entradas = {}
    for nombre, ruta in (("persona", persona), ("prenda", prenda)):
        im = Image.open(ruta).convert("RGB")
        memoria = _io.BytesIO()
        im.save(memoria, format="WEBP", quality=95)
        entradas[nombre] = memoria.getvalue()
        print("%-8s %s  %dx%d  JPG %.0f KB  ->  WEBP %.0f KB" % (
            nombre, ruta.name, im.width, im.height,
            ruta.stat().st_size / 1024, len(entradas[nombre]) / 1024))

    if not confirmar:
        print("\nENSAYO EN SECO. Nada se subio, nada se envio, nada se cobro.\n")
        return 0

    clave_api = env["RUNWARE_API_KEY"]
    cliente = cliente_r2(env)
    bucket = env["R2_BUCKET"]
    subidas = []
    try:
        urls = {}
        for nombre, datos in entradas.items():
            clave = "%s/%s.webp" % (PREFIJO, nombre)
            subir(cliente, bucket, clave, datos, "image/webp")
            subidas.append(clave)
            urls[nombre] = firmar(cliente, bucket, clave)

        tarea = {
            "taskType": "imageInference",
            "taskUUID": str(uuid.uuid4()),
            "model": "prunaai:p-image@try-on",
            "seed": SEMILLA,
            "numberResults": 1,
            "outputFormat": "WEBP",
            "includeCost": True,
            "inputs": {"referenceImages": [
                {"image": urls["persona"], "role": "person"},
                {"image": urls["prenda"], "role": "garment"},
            ]},
            "settings": {"preserveInputSize": True},
        }
        print("\n[prueba virtual con entradas WEBP]")
        datos, tardo, error = llamar(clave_api, tarea)
        if error:
            print("  RECHAZADO (no se cobra): " + error)
            return 1
        print("  ok en %.1fs   costo %s" % (tardo, datos.get("cost")))
        with urllib.request.urlopen(datos["imageURL"], timeout=180) as r:
            salida = r.read()
        destino = SALIDA / "vton_webp.webp"
        destino.write_bytes(salida)
        print("  %.0f KB  ->  %s" % (len(salida) / 1024, cabecera(salida)))
        print("  " + str(destino))
    finally:
        for clave in subidas:
            try:
                cliente.delete_object(Bucket=bucket, Key=clave)
            except Exception as error:  # noqa: BLE001
                print("no pude borrar " + clave)
        print("Entradas de prueba borradas de R2: %d" % len(subidas))
    return 0


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirmar", action="store_true")
    # Una prueba virtual de verdad, con entradas WEBP: la de aceptación usa la
    # misma foto como persona y como prenda, que alcanza para saber si el
    # formato entra pero produce un engendro. Esta usa un par real.
    parser.add_argument("--vton", action="store_true")
    args = parser.parse_args()

    from PIL import Image

    env = leer_env(ENV)
    clave_api = env.get("RUNWARE_API_KEY")
    if args.confirmar and not clave_api:
        sys.exit("Falta RUNWARE_API_KEY en .env.local")

    SALIDA.mkdir(parents=True, exist_ok=True)

    if args.vton:
        return vton_real(env, args.confirmar)

    # Las entradas: un recorte cuadrado de una generación real, en WEBP, y su
    # máscara en PNG, que es la mezcla que la app va a producir.
    base = Image.open(ORIGEN / "semilla.png").convert("RGB")
    lado = min(base.size)
    recorte = base.crop((
        (base.width - lado) // 2, (base.height - lado) // 2,
        (base.width - lado) // 2 + lado, (base.height - lado) // 2 + lado,
    )).resize((LADO, LADO), Image.LANCZOS)

    semilla_webp = _io.BytesIO()
    recorte.save(semilla_webp, format="WEBP", quality=95)
    semilla_webp = semilla_webp.getvalue()

    kontext_webp = _io.BytesIO()
    recorte.resize(KONTEXT, Image.LANCZOS).save(kontext_webp, format="WEBP", quality=95)
    kontext_webp = kontext_webp.getvalue()

    mascara = Image.new("L", (LADO, LADO), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mascara).rectangle(
        [LADO // 4, LADO // 4, LADO * 3 // 4, LADO * 3 // 4], fill=255)
    mascara_png = _io.BytesIO()
    mascara.save(mascara_png, format="PNG")
    mascara_png = mascara_png.getvalue()

    print("\nEntradas: semilla WEBP %.0f KB, kontext WEBP %.0f KB, mascara PNG %.0f KB"
          % (len(semilla_webp) / 1024, len(kontext_webp) / 1024, len(mascara_png) / 1024))

    if not args.confirmar:
        print("\nENSAYO EN SECO. Nada se subio, nada se envio, nada se cobro.")
        print("Para correrlo de verdad: --confirmar\n")
        return 0

    cliente = cliente_r2(env)
    bucket = env["R2_BUCKET"]
    subidas = []

    def poner(nombre, datos, tipo):
        clave = "%s/%s" % (PREFIJO, nombre)
        subir(cliente, bucket, clave, datos, tipo)
        subidas.append(clave)
        return firmar(cliente, bucket, clave)

    try:
        url_semilla = poner("semilla.webp", semilla_webp, "image/webp")
        url_kontext = poner("kontext.webp", kontext_webp, "image/webp")
        url_mascara = poner("mascara.png", mascara_png, "image/png")
        print("Subidas %d entradas a %s\n" % (len(subidas), PREFIJO))

        comun = {
            "taskType": "imageInference",
            "taskUUID": None,
            "seed": SEMILLA,
            "numberResults": 1,
            "outputFormat": "WEBP",
            "includeCost": True,
        }

        celdas = [
            ("102 Fill", dict(
                comun, model="runware:102@1", positivePrompt="plain black fabric",
                width=LADO, height=LADO, steps=PASOS,
                inputs={"seedImage": url_semilla, "maskImage": url_mascara})),
            ("101 dev+mascara", dict(
                comun, model="runware:101@1", positivePrompt="a black patch pocket",
                width=LADO, height=LADO, steps=PASOS, strength=0.85,
                inputs={"seedImage": url_semilla, "maskImage": url_mascara})),
            ("106 Kontext", dict(
                comun, model="runware:106@1", positivePrompt="make the shirt navy blue",
                width=KONTEXT[0], height=KONTEXT[1], steps=PASOS,
                inputs={"referenceImages": [url_kontext]})),
            ("p-image try-on", dict(
                comun, model="prunaai:p-image@try-on",
                inputs={"referenceImages": [
                    {"image": url_semilla, "role": "person"},
                    {"image": url_semilla, "role": "garment"},
                ]},
                settings={"preserveInputSize": True})),
        ]

        total = 0.0
        for nombre, tarea in celdas:
            tarea = dict(tarea, taskUUID=str(uuid.uuid4()))
            print("[" + nombre + "]")
            datos, tardo, error = llamar(clave_api, tarea)
            if error:
                print("  RECHAZADO (no se cobra): " + error + "\n")
                continue
            costo = datos.get("cost")
            total += costo or 0.0
            print("  ACEPTA WEBP. %.1fs, costo %s" % (tardo, costo))
            with urllib.request.urlopen(datos["imageURL"], timeout=180) as r:
                salida = r.read()
            destino = SALIDA / (nombre.split()[0] + ".webp")
            destino.write_bytes(salida)
            print("  devolvio %.0f KB  ->  %s" % (len(salida) / 1024, cabecera(salida)))
            print("")

        print("GASTADO: $%.4f\n" % total)
        print("Resultados en " + str(SALIDA))
    finally:
        for clave in subidas:
            try:
                cliente.delete_object(Bucket=bucket, Key=clave)
            except Exception as error:  # noqa: BLE001
                print("no pude borrar " + clave + ": " + type(error).__name__)
        print("Entradas de prueba borradas de R2: %d" % len(subidas))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
