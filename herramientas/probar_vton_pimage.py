"""
P-Image-Try-On (`prunaai:p-image@try-on`): el mismo banco, el modelo barato.

QUÉ PREGUNTA CONTESTA. La misma que `probar_vton_flux.py`, con las mismas cuatro
camisas, la misma persona y la misma semilla, porque lo único que puede cambiar
entre las dos corridas es el modelo. Si cambia algo más, la comparación no vale.

EN QUÉ SE DIFERENCIA DE FLUX VTO, y son tres cosas de forma:

  1. **El prompt es opcional**, y acá va vacío. El esquema lo describe como
     *"experimental guidance for non-flatlay garment images"*, o sea que sirve
     para desambiguar cuando la referencia **no** es un flat lay limpio. Las
     cuatro nuestras lo son. Esto hay que anotarlo en la tabla y no leerlo como
     una desventaja: no es que se le dio menos ayuda, es que no la pide.
  2. **Acepta de 1 a 11 prendas** y una imagen de pose opcional. Acá va una sola
     prenda por llamada, que es lo que hace comparables las dos corridas.
  3. **Tiene `settings.preserveInputSize`**, en `true` por omisión. Ver abajo,
     porque en nuestro caso no es un detalle.

EL PRECIO QUEDÓ RESUELTO: **$0.0069**. Lo dice `runware model pricing
prunaai:p-image@try-on` y lo confirma el `cost` de las respuestas en los
ejemplos oficiales. La ficha del modelo publica $0.015, o sea más del doble.
Queda confirmada la regla que ya traía el diseño del proyecto: **el catálogo es la
fuente, la página de producto es publicidad.** Una configuración del catálogo
sube a $0.0093.

SOBRE `preserveInputSize`. El esquema explica que, apagado, la salida conserva
*"the model's internal working resolution, which may differ from the input
because inputs are dynamically resized"*. Encendido, que es como viene, el
resultado vuelve al tamaño de la foto de la persona. Con la foto buena eso ya no
es un problema, pero con `--persona normal` sí vuelve a serlo, y ahí
`--sin-preservar-tamano` sirve para ver a qué resolución trabaja de verdad.

CUESTA DINERO: cuatro llamadas, ~$0.0276. No corre sin `--confirmar`.

Uso:

    python herramientas/probar_vton_pimage.py                       # ensayo, no gasta
    python herramientas/probar_vton_pimage.py --confirmar
    python herramientas/probar_vton_pimage.py --persona normal --camisas texto-limpio --confirmar
"""

from __future__ import annotations

import argparse
import sys
import time
import uuid

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

MODELO = "prunaai:p-image@try-on"

# Del catálogo, verificado con `runware model pricing` y confirmado por el
# `cost` de los ejemplos oficiales. La ficha del modelo publica $0.015.
PRECIO_CATALOGO = 0.0069
PRECIO_FICHA = 0.015


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
    parser.add_argument("--sin-preservar-tamano", action="store_true",
                        dest="sin_preservar",
                        help="apaga preserveInputSize: devuelve la resolución "
                             "interna del modelo en vez de la de la persona")
    args = parser.parse_args()
    preservar = not args.sin_preservar

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
    print("  SIN prompt: sus prendas son flat lays limpios y no lo necesita")
    print(f"  preserveInputSize en {str(preservar).lower()}: " + (
        "la salida sale del tamaño de la persona"
        if preservar else "la salida sale de la resolución interna del modelo") + "\n")

    preparadas = []
    for camisa in banco:
        prenda = preparar_prenda(CAMISAS / camisa.archivo)
        preparadas.append((camisa, prenda))
        print(f"  [{camisa.etiqueta:<17}] {camisa.archivo:<20} "
              f"{prenda.width}×{prenda.height} "
              f"({prenda.width * prenda.height / 1e6:.2f} MP)")

    n = len(banco)
    print(f"\n  {n} llamadas a ${PRECIO_CATALOGO:.4f} del catálogo, "
          f"total ${PRECIO_CATALOGO * n:.4f}.")
    print(f"  (La ficha del modelo publica ${PRECIO_FICHA:.4f}, más del doble. "
          "Manda includeCost.)\n")
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
    para_lamina = []
    gastado = 0.0

    print()
    for camisa, prenda in preparadas:
        tarea = {
            "taskType": "imageInference",
            "taskUUID": str(uuid.uuid4()),
            "model": MODELO,
            "seed": args.seed,
            "numberResults": 1,
            "outputFormat": "PNG",
            "includeCost": True,
            "inputs": {
                "referenceImages": [
                    {"image": como_uri(persona, "JPEG"), "role": "person"},
                    {"image": como_uri(prenda, "PNG"), "role": "garment"},
                ]
            },
            "settings": {"preserveInputSize": preservar},
        }

        resultado, tardo, error = llamar(env, tarea)
        if error:
            print(f"  [{camisa.etiqueta:<17}] FALLÓ en {tardo:.1f}s, no se cobró\n       {error}")
            filas.append([camisa.etiqueta, "falló", "—", "—", f"{tardo:.1f}s"])
            continue

        ruta = SALIDA / f"{marca}-pimage-{args.persona}-{camisa.etiqueta}.png"
        salida = descargar(resultado["imageURL"], ruta)
        medio, cabeza = cambio(persona, salida)
        costo = resultado.get("cost")
        gastado += costo or 0.0

        print(f"  [{camisa.etiqueta:<17}] {salida.width}×{salida.height}   "
              f"${costo:.4f}   {tardo:4.1f}s   "
              f"cambio medio {medio:.1f}, cabeza {cabeza:.1f}")
        filas.append([
            camisa.etiqueta,
            f"{salida.width}×{salida.height}",
            f"${costo:.4f}" if costo is not None else "no reportado",
            f"{medio:.1f} / {cabeza:.1f}",
            f"{tardo:.1f}s",
        ])
        para_lamina.append((prenda, salida, camisa.etiqueta))

    if para_lamina:
        ruta_lamina = SALIDA / f"{marca}-pimage-{args.persona}-lamina.png"
        lamina(persona, para_lamina, ruta_lamina)
        print(f"\n  Lámina de contacto: {ruta_lamina.name}")

    escribir_tabla(
        SALIDA / f"{marca}-pimage-{args.persona}-tabla.md",
        f"VTON con {MODELO} (persona {args.persona})",
        ["Camisa", "Salida", "Costo real", "Cambio medio / cabeza", "Latencia"],
        filas,
        [
            f"Semilla fija **{args.seed}**, sin prompt, `preserveInputSize` en "
            f"{str(preservar).lower()}. Persona `{ruta_persona.name}`, mandada a "
            f"{persona.width}×{persona.height}.",
            "",
            f"Precio antes de correr: catálogo ${PRECIO_CATALOGO:.4f}, ficha "
            f"${PRECIO_FICHA:.4f}. **Gastado real: ${gastado:.4f}** en {n} llamadas.",
            "",
            "## Criterios, escritos antes de mirar",
            "",
            *[f"- **{c.etiqueta}**: {c.criterio}" for c in banco],
        ],
    )

    print(f"  Gastado en esta corrida: ${gastado:.4f}")
    print(f"  Tabla en {SALIDA.name}/{marca}-pimage-tabla.md")
    print("  ABRÍ LA LÁMINA: el número no dice si el logo se lee.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
