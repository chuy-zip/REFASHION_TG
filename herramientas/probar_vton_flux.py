"""
FLUX Virtual Try-On (`bfl:flux@vto`): la persona de la foto, con nuestra prenda.

QUÉ PREGUNTA CONTESTA. Una sola, y es la que decide el proveedor del Módulo 3:
**¿sobrevive el logotipo?** La calidad general no desempata, porque el producto
acá es un uniforme corporativo y un uniforme con el logo borroso no es el
producto. Por eso el banco son cuatro camisas con marcas distintas y no una
camisa linda (`vton_comun.BANCO`).

CÓMO SE PIDE, que no se parece en nada a Fill:

  - **No hay máscara ni `seedImage`.** Las dos imágenes van en
    `inputs.referenceImages`, cada una con su `role`: `person` y `garment`.
    Exactamente dos, una de cada rol.
  - **No se manda `width` ni `height`.** No hay lienzo que pedir, así que
    tampoco hay múltiplos de 64 ni encajado: la salida la decide la entrada.
    Por debajo de 2 MP pasa sin tocarse; por encima la bajan a 1 MP.
  - **`positivePrompt` es obligatorio**, confirmado en el esquema
    (`runware model schema bfl:flux@vto`). El que se usa acá está modelado sobre
    los ejemplos oficiales del modelo y no sobre la frase corta de su guía: ver
    `PLANTILLA`.
  - `steps` va de 1 a 4 y trae 4 por omisión. Se deja en el valor por omisión:
    no hay ninguna medición que justifique moverlo y esta corrida no es para
    eso.

SE PIDE PNG A PROPÓSITO. El formato por omisión es JPG, y sus artefactos caen
justo donde está el criterio: los bordes de alto contraste de un texto. Un logo
ilegible por culpa de nuestra propia compresión se le habría achacado al modelo.

CUÁNTO CUESTA. **$0.0475 por llamada según el catálogo**, verificado con
`runware model pricing bfl:flux@vto` y confirmado por el `cost` que traen las
respuestas de los ejemplos oficiales. La ficha del modelo describe además una
fórmula por megapíxel que con nuestras imágenes, más chicas, predice menos. El
ensayo muestra los dos números y después los compara contra `includeCost`, que
es el único que cuenta.

CUESTA DINERO: cuatro llamadas. No corre sin `--confirmar`.

Uso:

    python herramientas/probar_vton_flux.py                       # ensayo, no gasta
    python herramientas/probar_vton_flux.py --confirmar
    python herramientas/probar_vton_flux.py --persona normal --camisas texto-limpio --confirmar
"""

from __future__ import annotations

import argparse
import sys
import time
import uuid
from pathlib import Path

from probar_quitar import como_uri, llamar
from r2_vs_db import ENV, leer_env
from vton_comun import (
    BANCO,
    CAMISAS,
    PERSONAS,
    SALIDA,
    SEMILLA,
    Camisa,
    cambio,
    descargar,
    escribir_tabla,
    lamina,
    preparar_persona,
    preparar_prenda,
)

MODELO = "bfl:flux@vto"

# **Modelado sobre los ejemplos oficiales del propio modelo**, no sobre la frase
# corta de su guía.
#
# La guía propone una sola oración: *"The person of image 1, maintaining exactly
# their face and pose, wearing the X of image 2."* Pero los ejemplos que Runware
# publica para este modelo (`runware model examples bfl:flux@vto`) usan prompts
# de párrafo entero, y hacen tres cosas que la frase corta no: enumeran qué
# preservar de la persona y de la escena, describen la prenda por sus rasgos de
# confección, y piden explícitamente que la caída y las sombras sean creíbles.
#
# Eso coincide con lo que este proyecto ya midió en el experimento 3: el prompt
# que nombraba diez propiedades ganó al que nombraba cinco. Acá además importa
# por el criterio: **se pide de forma positiva que las marcas del pecho queden
# legibles**, que es justo lo que la prueba mide. Nunca al revés: enumerar lo que
# no se quiere fue lo que dejó 542 píxeles de artefacto en Fill.
PLANTILLA = (
    "Dress the person in the exact {descripcion} from the garment reference image. "
    "Preserve their identity, facial features, hairstyle, expression, body shape, "
    "proportions, pose, hand positions, trousers, camera viewpoint and composition. "
    "Preserve the original background and its lighting exactly. Reproduce the garment "
    "faithfully, including its cut, collar, buttons, seams, sleeve length, fabric "
    "texture and colour, and keep every printed or embroidered mark on the chest sharp "
    "and fully legible. Fit it naturally over the body with credible folds at the "
    "shoulders, chest and waist, matching the scene lighting with realistic contact "
    "shadows."
)

# **Del catálogo, no de la ficha del modelo**, y confirmado dos veces: lo devuelve
# `runware model pricing bfl:flux@vto` y también aparece como `cost` en la
# respuesta de los ejemplos oficiales. Una configuración del catálogo sube a
# $0.0625, que es el techo que publica la página de producto.
PRECIO_CATALOGO = 0.0475

# La ficha del modelo describe además una fórmula por megapíxel: $0.0375 el
# primero de entrada, $0.005 cada megapíxel de entrada adicional y $0.005 por
# megapíxel de salida. Con un megapíxel de cada cosa da exactamente $0.0475, o
# sea que el precio del catálogo **es esa fórmula en su caso de referencia**.
# Nuestras imágenes son más chicas, así que la fórmula predice menos. Cuál de
# los dos rige lo decide `includeCost` y no esta discusión: se muestran los dos
# y después se comparan contra lo que se cobró.
PRIMER_MP_USD = 0.0375
MP_EXTRA_USD = 0.005
MP_SALIDA_USD = 0.005


def estimar_por_mp(mp_persona: float, mp_prenda: float) -> float:
    entrada = mp_persona + mp_prenda
    extra = max(0.0, entrada - 1.0)
    # La salida sigue a la persona, que es lo que define el encuadre.
    return PRIMER_MP_USD + extra * MP_EXTRA_USD + mp_persona * MP_SALIDA_USD


def main() -> int:
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirmar", action="store_true")
    parser.add_argument("--camisas", nargs="*", default=None,
                        help="etiquetas del banco; por omisión, las cuatro")
    parser.add_argument("--seed", type=int, default=SEMILLA)
    parser.add_argument("--persona", choices=sorted(PERSONAS), default="alta",
                        help="cuál foto de persona: alta (2.46 MP) o normal (0.61 MP)")
    args = parser.parse_args()

    ruta_persona = PERSONAS[args.persona]
    if not ruta_persona.exists():
        sys.exit(f"No encontré la foto de persona: {ruta_persona}")

    banco: list[Camisa] = [c for c in BANCO if args.camisas is None or c.etiqueta in args.camisas]
    if not banco:
        sys.exit("Ninguna camisa coincide con --camisas.")

    faltan = [c.archivo for c in banco if not (CAMISAS / c.archivo).exists()]
    if faltan:
        sys.exit("Faltan camisas en shirts_vton/: " + ", ".join(faltan))

    persona = preparar_persona(ruta_persona)
    mp_persona = persona.width * persona.height / 1e6

    print(f"\n  modelo   {MODELO}")
    print(f"  persona  {ruta_persona.name} ({args.persona})  "
          f"{persona.width}×{persona.height}  ({mp_persona:.2f} MP)")
    print("  SIN máscara y SIN width/height: la salida la decide la entrada\n")

    preparadas: list[tuple[Camisa, object, float, float]] = []
    total_mp = 0.0
    for camisa in banco:
        prenda = preparar_prenda(CAMISAS / camisa.archivo)
        mp_prenda = prenda.width * prenda.height / 1e6
        costo = estimar_por_mp(mp_persona, mp_prenda)
        total_mp += costo
        preparadas.append((camisa, prenda, mp_prenda, costo))
        print(f"  [{camisa.etiqueta:<17}] {camisa.archivo:<20} "
              f"{prenda.width}×{prenda.height} ({mp_prenda:.2f} MP)   "
              f"por fórmula ~${costo:.4f}")

    n = len(banco)
    print(f"\n  {n} llamadas. Catálogo ${PRECIO_CATALOGO:.4f} cada una "
          f"(total ${PRECIO_CATALOGO * n:.4f}); por la fórmula de megapíxeles, "
          f"total ${total_mp:.4f}.")
    print("  El que vale es el que devuelva includeCost.\n")
    print("  CRITERIOS, escritos antes de mirar nada:")
    for camisa in banco:
        print(f"    [{camisa.etiqueta}] {camisa.criterio}")

    if not args.confirmar:
        print("\n  ENSAYO: no se mandó nada, no se gastó nada.")
        print("  Agregá --confirmar para correrlo de verdad.\n")
        return 0

    env = leer_env(ENV)
    SALIDA.mkdir(exist_ok=True)
    marca = time.strftime("%Y%m%d-%H%M%S")
    filas: list[list[str]] = []
    para_lamina: list[tuple[object, object, str]] = []
    gastado = 0.0

    print()
    for camisa, prenda, mp_prenda, estimado in preparadas:
        tarea = {
            "taskType": "imageInference",
            "taskUUID": str(uuid.uuid4()),
            "model": MODELO,
            "positivePrompt": PLANTILLA.format(descripcion=camisa.descripcion),
            "seed": args.seed,
            "numberResults": 1,
            "outputFormat": "PNG",
            "includeCost": True,
            "inputs": {
                "referenceImages": [
                    {"image": como_uri(persona, "JPEG"), "role": "person"},
                    # PNG para la prenda: es la que lleva el logo, y el criterio
                    # de esta prueba es si el logo se lee. Comprimirla nosotros
                    # sería ensuciar justo lo que se está midiendo.
                    {"image": como_uri(prenda, "PNG"), "role": "garment"},
                ]
            },
        }

        resultado, tardo, error = llamar(env, tarea)
        if error:
            print(f"  [{camisa.etiqueta:<17}] FALLÓ en {tardo:.1f}s, no se cobró\n       {error}")
            filas.append([camisa.etiqueta, "falló", "—", "—", "—", f"{tardo:.1f}s"])
            continue

        ruta = SALIDA / f"{marca}-flux-{args.persona}-{camisa.etiqueta}.png"
        salida = descargar(resultado["imageURL"], ruta)
        medio, cabeza = cambio(persona, salida)
        costo = resultado.get("cost")
        gastado += costo or 0.0

        print(f"  [{camisa.etiqueta:<17}] {salida.width}×{salida.height}   "
              f"${costo:.4f} (estimado ${estimado:.4f})   {tardo:4.1f}s   "
              f"cambio medio {medio:.1f}, cabeza {cabeza:.1f}")
        filas.append([
            camisa.etiqueta,
            f"{salida.width}×{salida.height}",
            f"${costo:.4f}" if costo is not None else "no reportado",
            f"${estimado:.4f}",
            f"{medio:.1f} / {cabeza:.1f}",
            f"{tardo:.1f}s",
        ])
        para_lamina.append((prenda, salida, camisa.etiqueta))

    if para_lamina:
        ruta_lamina = SALIDA / f"{marca}-flux-{args.persona}-lamina.png"
        lamina(persona, para_lamina, ruta_lamina)
        print(f"\n  Lámina de contacto: {ruta_lamina.name}")

    escribir_tabla(
        SALIDA / f"{marca}-flux-{args.persona}-tabla.md",
        f"VTON con {MODELO} (persona {args.persona})",
        ["Camisa", "Salida", "Costo real", "Por fórmula", "Cambio medio / cabeza", "Latencia"],
        filas,
        [
            f"Semilla fija **{args.seed}**. Persona `{ruta_persona.name}`, mandada a "
            f"{persona.width}×{persona.height}. Catálogo: ${PRECIO_CATALOGO:.4f} por llamada.",
            "",
            "**El cambio en la cabeza es un indicio, no una medición.** Que sea bajo no "
            "prueba que la cara esté bien; que sea alto sí avisa que la tocó.",
            "",
            "## Criterios, escritos antes de mirar",
            "",
            *[f"- **{c.etiqueta}**: {c.criterio}" for c in banco],
        ],
    )

    print(f"  Gastado en esta corrida: ${gastado:.4f}")
    print(f"  Tabla en {SALIDA.name}/{marca}-flux-tabla.md")
    print("  ABRÍ LA LÁMINA: el número no dice si el logo se lee.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
