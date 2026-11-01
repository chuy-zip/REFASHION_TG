"""
Primera prueba de lo que FLUX Fill SÍ sabe hacer: quitar, no recolorear.

POR QUÉ ESTA PRUEBA. Los experimentos 1 y 2 y el control positivo dejaron una
conclusión medida: **FLUX.1 Fill dev no recolorea**, ni siquiera en el ejemplo
de vitrina de su propio fabricante. Lo que sí hace, y con ganas, es regenerar
estructura concordando con lo que la rodea. El Ejemplo 1 de su documentación
—borrar una tarjeta de calibración de una losa de terrazo— es su caso real, y
ese sí funciona.

Así que esta prueba le pide eso: **borrar los emblemas bordados del polo** y
dejar tela negra continua en su lugar.

QUÉ CAMBIA RESPECTO DE TODO LO ANTERIOR, y es a propósito:

  1. **La máscara cubre el 0.89% de la imagen, no el 44.5%.** Esa es la variable
     que medimos como dominante: inpainting funciona mejor cuanto más contexto
     intacto rodea al hueco. Veníamos operando cerca del peor caso posible.
  2. **La foto es natural**, no un recorte de producto sobre fondo blanco. Luz de
     ambiente, pliegues reales, un entorno detrás.
  3. **No se manda `strength`.** Ninguno de los tres ejemplos oficiales lo manda,
     y su efecto está confundido con el número de pasos (ver la retractación en
     `EXPERIMENTO_1_color_generativo.md`).
  4. **No se manda `CFGScale`.** El experimento 2 lo midió: +3.6 con 2 contra
     +5.1 con 10. Ninguno de los dos sirve.
  5. **La proporción no se deforma.** 1280×1920 es exactamente 2:3, y 896×1344
     también (896 y 1344 son múltiplos de 64 y su razón es 1.5 al dígito). Por
     primera vez pedimos un lienzo sin estirar la prenda.
  6. **Nada se sube a ningún lado.** La API acepta `data:` URI, así que imagen y
     máscara van codificadas desde el disco. No toca R2, ni Supabase, ni la app.

CÓMO SE LEE EL RESULTADO. No a ojo. Se mide dentro de la máscara:

  - **calidez** (`R - B`): el bordado es dorado, o sea cálido; la tela negra es
    neutra. Si el emblema se fue, la calidez cae hacia cero.
  - **píxeles dorados que sobreviven**, con el mismo detector que hizo la máscara.
  - **cuánto cambió FUERA de la máscara**, que debe ser casi nada. Si cambió
    mucho, el modelo reescribió cosas que no le pedimos.

LO QUE DIO LA PRIMERA CORRIDA (17-sep, $0.0038, `20260917-183329-*`): los 3073
píxeles dorados de la máscara quedaron en **cero**, pero el resultado no fue
uniforme. **La estrella se borró limpia; el escudo dejó un fantasma en relieve**
con su propia silueta, texto incluido. No fue falta de cobertura —se verificó
que la máscara lo tapaba entero—, así que la explicación es que los píxeles
originales bajo la máscara siguen influyendo. De ahí salió `--rellenar`, que
está explicado en la función del mismo nombre.

CUESTA DINERO: una llamada, ~$0.004. No corre sin `--confirmar`. Un rechazo no
se cobra, así que el ensayo sirve también para comprobar que acepta base64.

Uso:

    python herramientas/probar_quitar.py                          # ensayo, no gasta
    python herramientas/probar_quitar.py --rellenar               # ensayo, guarda la semilla
    python herramientas/probar_quitar.py --rellenar --confirmar
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as nd

from r2_vs_db import ENV, leer_env

API = "https://api.runware.ai/v1"
MODELO = "runware:102@1"

AQUI = Path(__file__).resolve().parent

IMAGEN = AQUI / "test_images" / "dark_polo_high_res.jpg"
MASCARA = AQUI / "test_images" / "dark_polo_high_res__mascara.png"

# Sigue la plantilla del Ejemplo 1 de la documentación, que es el de borrado y
# es el que sí funciona: primero qué poner en su lugar, después con qué material
# y luz debe concordar, y al final qué NO debe aparecer.
#
# Ojo con una cosa que se aprendió por las malas: el prompt describe **solo la
# zona enmascarada**. El modelo ya ve lo que la rodea. Mencionar el fondo o la
# persona le describe algo que no tiene que pintar.
PROMPT = (
    "Remove the embroidered emblem completely and replace the entire masked area with a "
    "seamless, photorealistic continuation of the surrounding black pique knit polo fabric. "
    "Reconstruct the fine knit texture, the direction of the weave, the soft fabric folds and "
    "the gradual shading of the surrounding cloth, matching its exact tone, matte finish, "
    "thread scale, ambient lighting and depth of field. The repair must look like uninterrupted "
    "original fabric, with no emblem, badge, logo, star, crest, embroidery, stitching, text, "
    "outline, patch, seam, discoloration or retouching artifact."
)

# Sin negativos, a propósito. El prompt de arriba enumera "no emblem, badge,
# logo, star, crest, embroidery, stitching, text...", copiado del Ejemplo 1 de
# la documentación. Pero **este modelo ignora `negativePrompt`** (E2 y E3 del
# experimento 2 salieron byte por byte idénticos), así que esas palabras viven
# en el condicionamiento POSITIVO y pueden funcionar como imanes en vez de como
# prohibiciones. El artefacto que quedó es un garabato blanco fino que parece
# una puntada, y `stitching` está escrito ahí adentro.
PROMPT_LIMPIO = (
    "Plain black pique knit polo shirt fabric, a smooth uninterrupted expanse of matte black "
    "cotton knit. Fine even knit texture with a consistent weave direction, soft natural folds "
    "and gradual shading, matching the tone, thread scale, ambient lighting, edge sharpness and "
    "depth of field of the surrounding cloth."
)

PROMPTS = {"completo": PROMPT, "limpio": PROMPT_LIMPIO}

# Fija por omisión. Sin esto cada corrida arranca de un ruido distinto y al
# comparar dos variantes no se sabe si la diferencia fue el cambio o fue suerte
# — el error del experimento 1, que el 2 corrigió.
SEMILLA = 20260917

COSTO_ESTIMADO = 0.004  # medido: la primera corrida costo $0.0038


def lienzo(ancho: int, alto: int, objetivo_mp: float) -> tuple[int, int, float]:
    """
    El múltiplo de 64 más cercano al megapíxel objetivo, cuidando la proporción.

    FLUX solo genera sobre lienzos cuyos lados son múltiplos de 64. Redondear
    cada lado por separado deforma: 731×419 pedido como 704×448 cambió la
    proporción un 9.9%, y esa distorsión después parece culpa del modelo.

    Acá se busca la escala que deje los dos lados en múltiplos de 64 con el
    menor error de proporción posible, y se informa cuánto quedó.
    """
    razon = alto / ancho
    mejor = None
    for w in range(128, 2049, 64):
        for h in range(128, 2049, 64):
            mp = w * h / 1e6
            if not 0.5 <= mp <= 2.1:
                continue
            error = abs((h / w) - razon) / razon
            puntaje = (error, abs(mp - objetivo_mp))
            if mejor is None or puntaje < mejor[0]:
                mejor = (puntaje, w, h, error)
    _, w, h, error = mejor
    return w, h, error * 100


def rellenar(imagen: Image.Image, mascara: Image.Image, suavizado: float) -> Image.Image:
    """
    Borra la estructura de la zona enmascarada ANTES de mandarla.

    POR QUÉ EXISTE. La primera corrida quitó la estrella limpiamente pero dejó
    un **fantasma en relieve** con la silueta exacta del escudo. No fue falta de
    cobertura: se verificó que la máscara lo tapaba entero, texto incluido. Lo
    que pasa es que los píxeles originales debajo de la máscara **siguen
    influyendo** en lo que el modelo genera, y cuanta más estructura tenía el
    original, más sobrevive. Por eso la estrella (1583 px, forma compacta)
    desapareció y el escudo (9147 px, intrincado, con texto fino) no.

    Runware no expone el ajuste que resolvería esto del lado del modelo (el
    "latent noise" en vez de "original" de las interfaces locales). Pero se
    puede resolver de este lado: si le mandamos una camisa que **ya no tiene el
    emblema**, no hay estructura que se filtre.

    CÓMO. Dos pasos:

      1. Cada píxel enmascarado toma el color del píxel de tela **más cercano**
         que quedó fuera de la máscara. Eso arrastra hacia adentro el degradado
         de luz de la prenda, que es lo que hay que conservar.
      2. Ese primer paso deja costuras de Voronoi, así que se desenfoca. Queda
         el degradado sin textura — **a propósito**: la textura de punto es
         justo lo que le vamos a pedir al modelo que ponga.

    Es determinista y no cuesta nada, así que se puede revisar antes de gastar.
    """
    a = np.asarray(imagen.convert("RGB"), dtype=float)
    m = np.asarray(mascara.convert("L")) > 128
    if not m.any():
        return imagen

    _, indices = nd.distance_transform_edt(m, return_indices=True)
    vecino = a.copy()
    vecino[m] = a[indices[0][m], indices[1][m]]

    suave = np.stack(
        [nd.gaussian_filter(vecino[..., c], suavizado) for c in range(3)], axis=-1
    )
    salida = a.copy()
    salida[m] = suave[m]
    return Image.fromarray(salida.clip(0, 255).astype("uint8"))


def como_uri(imagen: Image.Image, formato: str) -> str:
    """La API acepta `data:<tipo>;base64,...`, así que no hay que subir nada."""
    import io as _io

    buffer = _io.BytesIO()
    imagen.save(buffer, format=formato)
    tipo = "image/png" if formato == "PNG" else "image/jpeg"
    return f"data:{tipo};base64," + base64.b64encode(buffer.getvalue()).decode()


def llamar(env: dict, tarea: dict) -> tuple[dict | None, float, str | None]:
    pedido = urllib.request.Request(
        API,
        method="POST",
        data=json.dumps([tarea]).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {env['RUNWARE_API_KEY']}",
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


def medir(imagen: Image.Image, dentro: np.ndarray) -> tuple[float, float, int]:
    """(calidez, luma, píxeles dorados) dentro de la región indicada."""
    a = np.asarray(imagen.convert("RGB"), dtype=float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    dorado = ((r - b) > 28) & (luma > 55) & dentro
    return float((r - b)[dentro].mean()), float(luma[dentro].mean()), int(dorado.sum())


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirmar", action="store_true")
    parser.add_argument("--imagen", type=Path, default=IMAGEN)
    parser.add_argument("--mascara", type=Path, default=MASCARA)
    parser.add_argument("--mp", type=float, default=1.2, help="megapíxeles objetivo")
    parser.add_argument("--steps", type=int, default=28)
    parser.add_argument(
        "--rellenar",
        action="store_true",
        help="borrar la estructura bajo la máscara antes de mandarla (ver rellenar())",
    )
    parser.add_argument("--suavizado", type=float, default=12.0)
    parser.add_argument("--seed", type=int, default=SEMILLA)
    parser.add_argument("--prompt", choices=sorted(PROMPTS), default="completo")
    parser.add_argument("--salida", default="resultados3")
    args = parser.parse_args()

    for ruta in (args.imagen, args.mascara):
        if not ruta.exists():
            sys.exit(f"No encontré {ruta}\n¿Corriste mascara_por_color.py primero?")

    original = Image.open(args.imagen).convert("RGB")
    mascara_grande = Image.open(args.mascara).convert("L")
    if mascara_grande.size != original.size:
        sys.exit(
            f"La máscara mide {mascara_grande.size} y la imagen {original.size}. "
            "Tienen que medir igual."
        )

    w, h, error = lienzo(original.width, original.height, args.mp)
    imagen = original.resize((w, h), Image.LANCZOS)
    mascara = mascara_grande.resize((w, h), Image.LANCZOS)
    dentro = np.asarray(mascara) > 128
    fuera = ~(np.asarray(mascara) > 8)

    print(f"\n  imagen   {args.imagen.name}  {original.width}×{original.height}")
    print(f"  máscara  {args.mascara.name}  cubre el {dentro.mean() * 100:.2f}% del lienzo")
    print(f"  lienzo   {w}×{h}  ({w * h / 1e6:.2f} MP)  deformación de proporción {error:.2f}%")
    print(f"  modelo   {MODELO}   steps {args.steps}   sin strength, sin CFGScale")
    print(f"  prompt   {args.prompt}   ·   semilla {args.seed}")

    # La imagen que se manda. Con --rellenar ya no lleva el emblema, así que no
    # hay estructura original que se filtre al resultado.
    semilla = rellenar(imagen, mascara, args.suavizado) if args.rellenar else imagen
    if args.rellenar:
        print(f"  semilla  RELLENADA antes de mandarla (suavizado {args.suavizado:g})")
    else:
        print("  semilla  la imagen tal cual, sin rellenar")
    print()

    if not args.confirmar:
        uri = como_uri(semilla, "JPEG")
        print(f"  La imagen se manda como data URI de {len(uri) / 1024:.0f} KB. No se sube nada.")
        if args.rellenar:
            vista = args.imagen.with_name(args.imagen.stem + "__semilla_rellenada.png")
            semilla.save(vista)
            print(f"  Semilla guardada en {vista.name}  <- revisala antes de gastar")
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
        "positivePrompt": PROMPTS[args.prompt],
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
    sufijo = "-rellenada" if args.rellenar else ""
    ruta = carpeta / f"{marca}-quitar{sufijo}-resultado.png"
    ruta.write_bytes(crudo)
    imagen.save(carpeta / f"{marca}-quitar{sufijo}-00-entrada.png")
    mascara.save(carpeta / f"{marca}-quitar{sufijo}-00-mascara.png")
    if args.rellenar:
        semilla.save(carpeta / f"{marca}-quitar{sufijo}-00-semilla.png")

    salida = Image.open(ruta).convert("RGB")
    cal_a, luma_a, oro_a = medir(imagen, dentro)
    cal_d, luma_d, oro_d = medir(salida, dentro)
    cambio_fuera = float(
        np.abs(
            np.asarray(salida, dtype=float) - np.asarray(imagen, dtype=float)
        ).mean(axis=2)[fuera].mean()
    )

    costo = resultado.get("cost")
    print(f"  Listo en {tardo:.1f}s." + (f"  Costo: ${costo:.4f}" if costo else ""))
    print(f"  Guardado en {carpeta.name}/{ruta.name}\n")
    print("  DENTRO de la máscara:")
    print(f"    {'':12} {'antes':>9} {'después':>9}")
    print(f"    {'calidez':12} {cal_a:>9.1f} {cal_d:>9.1f}    (tela negra ≈ 0)")
    print(f"    {'luma':12} {luma_a:>9.1f} {luma_d:>9.1f}")
    print(f"    {'px dorados':12} {oro_a:>9d} {oro_d:>9d}")
    print(f"\n  FUERA de la máscara cambió {cambio_fuera:.2f} / 255  (debe ser casi cero)\n")
    print("  Si la calidez cayó cerca de cero y los dorados desaparecieron, lo quitó.")
    print("  ABRÍ LA IMAGEN igual: el número dice si se fue, no si quedó creíble.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
