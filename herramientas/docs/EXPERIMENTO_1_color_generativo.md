# Experimento 1 — ¿FLUX Fill respeta un color pedido por prompt?

**16 de septiembre de 2026.** Cinco llamadas reales a Runware, **$0.0058 en total**.
Las primeras llamadas pagas del proyecto.

> Registro de resultados, no de conclusiones finales. Lo que decide el capítulo de Resultados
> es el experimento completo; esto es el primer contacto, y su
> valor está en que **acotó qué hay que medir después**.

---

## Montaje

| | |
|---|---|
| Modelo | `runware:102@1` — FLUX.1 Fill [dev] |
| Prenda | `64ffd2fd` · camiseta **negra**, frente y espalda, fondo blanco, **731×419** |
| Máscara | `df763bbc` · **731×419**, la prenda entera seleccionada con la varita |
| Lienzo pedido | **704×448** (múltiplos de 64; la prenda no lo es) |
| Pasos | 28 |
| Color objetivo | azul marino / navy blue |
| Herramienta | `herramientas/probar_inpaint.py` |

**Lo que se midió:** el color promedio de los píxeles **dentro de la máscara**, o sea solo la
prenda. La *azulidad* es `B − (R+G)/2`: cero es gris neutro.

> **CORREGIDO el 17-sep-2026.** Acá decía que *"un azul marino real ronda +40 a +70"*. Ese
> número salía de un **hexadecimal** de azul marino, no de una prenda fotografiada, y estaba
> inflado. Medido sobre un polo azul marino real
> (`herramientas/test_images/polo-de-hombre-oscura.jpg`), la tela da **+18.3** — RGB
> 52.2 / 51.8 / 70.3, luma 53.2. Se excluyeron los rombos del estampado, que son el 1.4% del
> recorte y no movían el número (+18.4 con ellos, +18.3 sin ellos).
>
> **Por qué el hueco es tan grande.** Un navy puro como `#1B2A5E` da +59.5 y `#000080` da +128.
> Pero la tela real fotografiada está **mucho menos saturada** que el pigmento que elegirías en
> un selector de color: la luz de ambiente, la dispersión del tejido y el revelado de la cámara
> la lavan. Vale la pena retenerlo porque también aplica al recoloreado determinista — el
> hexadecimal exacto se ve *más saturado* de lo que se vería esa misma prenda fotografiada.
>
> **Es una sola foto y un solo recorte.** Para el informe hay que medir dos o tres prendas navy
> reales y reportar un rango propio, no un número derivado de un hexadecimal ni uno solo.

---

## Resultados

| Caso | Forma | Idioma | `strength` | R | G | B | **Azulidad** | Luma | Costo | Latencia |
|---|---|---|---|---|---|---|---|---|---|---|
| — | **ORIGINAL** | — | — | 47.1 | 47.1 | 47.1 | **0.0** | 47.1 | — | — |
| 1ra | orden | es | 0.85 | 48.5 | 48.7 | 50.6 | **+2.0** | 48.8 | $0.0013 | 5.9 s |
| **A** | descriptivo | es | 0.85 | 45.0 | 44.3 | 43.9 | **−0.8** | 44.4 | $0.0013 | 19.2 s |
| **B** | descriptivo | **en** | 0.85 | 37.0 | 40.7 | 45.8 | **+7.0** | 40.3 | $0.0013 | 5.3 s |
| **C** | descriptivo | en | **0.45** | 44.6 | 44.2 | 44.1 | **−0.3** | 44.3 | $0.0006 | 19.5 s |
| **D** | **orden** | en | 0.85 | 39.3 | 38.9 | 38.9 | **−0.1** | 39.0 | $0.0013 | 5.5 s |

Los archivos están en `herramientas/resultados/`, con la prenda y la máscara originales
guardadas al lado con el prefijo `20260916-224542-00-`.

---

## Qué dice cada comparación

Cada par difiere en **una sola variable**, que es lo que permite atribuir.

| Comparación | Aísla | Resultado |
|---|---|---|
| **A vs B** | idioma | **es −0.8 → en +7.0.** El inglés es el único que produjo algo de azul |
| **D vs B** | forma del prompt | **orden −0.1 → descripción +7.0.** Describir le gana a ordenar |
| **C vs B** | *ver la advertencia de abajo* | 0.45 −0.3 → 0.85 +7.0, pero **no es atribuible a `strength`** |

Las dos primeras apuntan en la dirección correcta y **ninguna alcanza**: el mejor de los cinco
llegó a **+7.0 contra los +18.3 que mide un navy real**, o sea alrededor del **38%** de lo
necesario. (Acá decía 10-15%, calculado contra la referencia inflada que se corrigió arriba.)

> **RETRACTADO el 17-sep-2026: la comparación C vs B no mide `strength`.**
>
> La documentación de Runware dice que FLUX Fill *"does not use the strength parameter, as they
> automatically determine the optimal approach"*, y ninguno de los tres ejemplos oficiales del
> modelo lo manda. Pero nuestros propios datos de facturación dicen otra cosa: **C costó
> $0.0006 y B costó $0.0013**, una razón de 0.46 contra una razón de `strength` de 0.53. Eso es
> lo que se espera si Runware aplica `strength` como **multiplicador del número de pasos**
> (28 × 0.45 ≈ 13 contra 28 × 0.85 ≈ 24).
>
> O sea que `strength` sí hace algo, pero **no lo que creíamos**: C no tuvo "menos libertad para
> desviarse", tuvo **la mitad de los pasos**. La diferencia está confundida y no se puede
> atribuir a ninguna de las dos causas por separado. Para desconfundirla habría que repetirla
> fijando los pasos efectivos, y no vale la pena: lo que sigue muestra que el camino entero no
> lleva a ningún lado.

Y fijate en la luma: **todos bajaron** (47.1 → 37-45). El modelo **oscureció la camisa en vez
de teñirla**, que es lo que hace cuando no logra imponer el color pedido: se queda cerca de lo
que ya había.

---

## Hallazgos que no eran el objetivo

**La máscara se respetó y la alineación funcionó.** El fondo blanco quedó intacto en las cinco
y las camisas no se movieron. Eso valida el arreglo del 17-sep —máscara e imagen del mismo
tamaño— con datos y no con razonamiento.

**`strength` hace lo que dice la documentación.** *"Lower values result in more influence from
the original input"*: C con 0.45 se quedó pegada al original. El parámetro no era el culpable.

**El costo baja con `strength`.** C costó **$0.0006**, la mitad que las demás. Es serverless y
se cobra por cómputo: menos transformación, menos pasos efectivos, menos dinero. Vale saberlo
para presupuestar el experimento grande.

**La latencia es ruidosa.** Entre 5.3 y 19.5 segundos con los mismos parámetros. Probablemente
cola o arranque en frío. **No sirve como medición** hasta correr varias repeticiones.

---

## Lo que esto vale para el informe

**No es un fracaso: es el resultado.** El diseño del proyecto decidió que el color fuera
determinista citando literatura sobre que los modelos de difusión no respetan códigos de color.
Esto mide algo más fuerte que lo citado: **no respetó ni el nombre del color** — ni en inglés,
ni describiendo en vez de ordenando.

Con una tabla, con una variable aislada por comparación, reproducible con un comando, y por
menos de un centavo.

---

## Lo que quedó sin descartar

La investigación posterior (ver `EXPERIMENTO_2`) encontró **cuatro diferencias entre lo que
mandamos y lo que declara el esquema del modelo**, así que estos números **no prueban que FLUX
no pueda**: prueban que no pudo **así**.

1. **`CFGScale` nunca se mandó.** Es la perilla de adherencia al prompt, y el esquema **no
   declara valor por omisión** para ella en este modelo — es la única variable de la que ni
   siquiera sabemos con qué corrió. El esquema además avisa que `negativePrompt` *"se ignora
   cuando la guía está desactivada (CFGScale ≤ 1)"*, o sea que existe un régimen con la guía
   apagada.
2. **Las imágenes se mandaron al nivel raíz**, y el esquema las declara dentro de un objeto
   `inputs`. Funcionó, así que Runware acepta la forma vieja — pero no sabemos si la trata
   igual.
3. **El prompt es diez veces más corto** que los ejemplos oficiales del mismo modelo, uno de
   los cuales es literalmente este caso: recolorear un producto enteramente enmascarado sobre
   fondo plano.
4. **Se generó a 0.315 MP** (704×448) contra el megapíxel de los ejemplos, que es donde FLUX
   está entrenado.
