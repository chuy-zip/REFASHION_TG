# Experimento 6 — qué puede hacer el inpainting además de quitar

**Corrido el 25-sep-2026.** Veinticinco celdas, veinticuatro cobradas, **$0.0962**.
Herramientas: `auditar_mascara.py`, `probar_textura.py`, `probar_agregar.py`.
Imágenes en `herramientas/textura/`, `herramientas/agregar/`,
`herramientas/agregar2/` y `herramientas/auditoria_mascaras/`.

El Módulo 2 llegaba a este punto sabiendo **quitar** y nada más. "Textura" y
"Forma" existían en la interfaz sin prueba y sin desmentido, y la primera vez
que se usaron de verdad no cambiaron nada. Esto averigua por qué, y termina con
seis tareas que sí se pueden hacer.

> **Resultado en una línea.** El inpainting con máscara sirve para mucho más que
> borrar, pero **la técnica depende del modelo**: con FLUX Fill hay que pintar
> la forma, porque lo pintado es la instrucción; con FLUX dev y `strength` 0.85
> no hace falta pintar nada, pero **la máscara tiene que ser más grande que el
> objeto**. Cambiar la textura por prompt con Fill es imposible, y eso quedó
> descartado en tres frentes.

---

## Parte 0 — Descartar a la máscara antes de acusar al modelo

Cuando la interfaz devolvió una camisa sin cambios, había dos sospechas que a
simple vista se confunden: que la máscara estuviera mal, o que el modelo
hubiera decidido no cambiar nada. `auditar_mascara.py` las separa: baja de R2 la
máscara, la semilla y el resultado de cada generación real, y mide la diferencia
**dentro** y **fuera** de la máscara por separado.

| Generación en la app | Dentro de la máscara | Fuera |
|---|---|---|
| "add a red scarf made of wool" | media 6.48/255, cambió 19.6% | 0.3% |
| Rayas sobre la prenda entera | media 6.78/255, cambió 27.7% | 1.7% |

La máscara llegó perfecta: del tamaño correcto, en el lugar pintado, y **el
modelo repintó adentro**. Repintó lo mismo. Midiendo por separado el borde y el
interior (la máscara comida 24 px hacia adentro) el cambio es parejo, así que
tampoco es una costura mal pegada.

> **No hacía falta un botón de "confirmar máscara".** La máscara que llega al
> proveedor es, píxel por píxel, la que se pintó. Un paso más en la interfaz
> habría cobrado un clic por un problema que estaba en otro lado.

**Hallazgo lateral:** la selección automática de la prenda **incluyó el cuello
de la persona**. En sombra es casi tan oscuro como la camisa y el relleno por
inundación lo tomó. No afecta a lo medido acá, pero la selección necesita un
límite por arriba o el usuario enmascara piel sin enterarse.

---

## Parte 1 — Textura con Fill: tres puertas cerradas

Misma semilla de imagen, misma máscara, mismo prompt, misma semilla numérica.
Una variable por celda. **Estas cuatro son de `probar_textura.py`**; las de las
partes 2 y 3 son de `probar_agregar.py` y llevan letras propias, así que una
celda se cita siempre con su script.

| Celda | Qué cambia | Resultado | Medida dentro |
|---|---|---|---|
| a | nada, como manda la app | camisa negra, sin rayas | 0.8% de píxeles cambiaron fuerte |
| b | **semilla preparada** con gris liso | **devolvió el gris liso** | saturación 5.58/255 |
| c | `trueCFGScale` 4.0 | igual que la base | diferencia contra a: **0.20/255** |
| d | **Kontext** con la misma orden | **rayas, bien hechas** | 19.4% fuerte |

**`trueCFGScale` no sirve.** El esquema oficial lo declara y dice que sube la
adherencia al prompt. La imagen no es idéntica a la base pero la diferencia
media entre las dos es 0.20 sobre 255: nada que se pueda ver. Queda descartado
junto a `CFGScale`, que ya se había medido en el experimento 2.

**Y la celda b es la que enseña.** `EXPERIMENTO_3` había dejado escrito que
preparar la semilla era la técnica a llevar a la app. Acá no funcionó: se tapó
la camisa con gris plano y volvió gris plano. Eso no contradice la regla vieja,
la afila:

> **Preparar la semilla no libera al modelo, cambia lo que no va a
> contradecir.** Una mancha gris lisa también es evidencia, y Fill la respeta
> igual que respetaba la camisa negra.

Por eso la manga larga sí funcionó en el experimento 3: ahí se tapó con el color
de la prenda y después se pidió tela de ese color. Semilla y pedido decían lo
mismo.

**Kontext funciona pero cobra dos veces.** Además del precio, repintó a la
persona: la cara cambió 24.73 de media con 15.9% de píxeles fuertes, y convirtió
el polo en camisa de botones. Kontext no recibe máscara, así que la promesa de
"esta zona y nada más" no existe en ese camino.

---

## Parte 2 — Agregar con Fill: lo pintado es la instrucción

Todas de `probar_agregar.py`.

| Celda | Semilla preparada | Resultado |
|---|---|---|
| a | bufanda pintada de **rojo** sobre los hombros | **bufanda de lana roja**, con pliegues |
| b | bolsillo pintado del **color de la prenda** | **el parche desapareció**, tela lisa |
| j | bolsillo pintado de **gris claro**, prompt sin color | **bolsillo gris**, con pretina y costura |
| k | igual que j, prompt **nombrando "black"** | bolsillo gris igual |
| l | bolsillo pintado a **+35 de luz** sobre la prenda | **bolsillo del color de la prenda** |
| m | bolsillo pintado a **+70 de luz** | bolsillo claramente más claro |

**El color sale de lo pintado, no del prompt.** Las celdas j y k solo se
diferencian en que k nombra el color. Medido dentro del bolsillo:

| | Color medio |
|---|---|
| j, sin nombrar color | (131, 137, 156) |
| k, nombrando "black knit fabric" | (127, 133, 150) |

Nombrar el color en el prompt movió el resultado **cuatro unidades sobre 255**.
No ganó; no compitió.

**Y el contraste tiene piso, medido entre 0 y 35.** Con cero contraste el
parche se borra, con +35 aparece un bolsillo **del color de la camisa**: (29, 33,
41) contra (26, 31, 37) de la tela alrededor, tres unidades de diferencia, con
su costura visible. No hace falta teñir después ni arreglar halos.

> **Con Fill: lo que pintás define la forma y el color, el prompt define el
> material y la confección. Sin contraste no hay forma.**

La forma también importa por sí misma: el primer intento fue un cuadrado
perfecto pegado al cuello y no salió nada; el segundo, un bolsillo con las
esquinas de abajo redondeadas y bien ubicado, salió a la primera.

---

## Parte 3 — Agregar con dev: la máscara tiene que sobrar

FLUX dev acepta máscara y **sí usa `strength`**. El mecanismo es otro: la zona
enmascarada se llena de ruido en proporción a ese valor, y sin evidencia debajo
la regla de Fill deja de aplicar.

### La escalera de `strength`, sobre la prenda entera

| Valor | Resultado | Desviación dentro |
|---|---|---|
| 0.70 | sin rayas; el polo pasó a camisa negra de botones | 20.97 |
| **0.85** | **camisa a rayas, persona, pose, luz y fondo intactos** | 33.72 |
| 1.00 | tela rayada envolviendo al hombre, prenda destruida | 67.02 |

Coincide casi al valor con lo que dice la documentación de Runware sobre esta
familia: el prompt toma el control cerca de 0.8 y por encima se pierde la
composición.

**Salvedad que hay que decir en pantalla:** a 0.85 la prenda cambia de tipo. El
polo salió convertido en camisa de botones con puños. Conserva a la persona y el
fondo, que era lo que Kontext rompía, pero no conserva el corte. Lo honesto es
llamarlo *cambiar la tela y dejar que reinterprete la confección*.

### Por qué la gorra funcionó sin pintar y el bolsillo no

Esta es la pregunta que casi deja el documento con una conclusión equivocada.
Misma configuración, dos resultados opuestos, y tres sospechosos: el prompt, el
tamaño de la máscara y lo que la escena hace probable.

| Celda | Máscara | Prompt | Resultado |
|---|---|---|---|
| h | bolsillo, 1.16% | arrancaba por la tela | nada |
| p | bolsillo, 1.52% | **corregido**, arranca por el bolsillo | una **etiqueta plana** con texto inventado |
| q | bolsillo **ancho**, 6.69% | el mismo de p | **bolsillo de verdad**, con costura y volumen |
| o | cabeza, 4.52% | arranca por la gorra | **gorra**, con costuras de panel y visera |

El prompt no alcanzaba: p lo corrigió y siguió sin haber bolsillo. Lo decisivo
fue el tamaño.

> **dev necesita que la máscara sea más grande que el objeto que va a dibujar.**
> Con la zona justa dibuja algo plano que quepa ahí. Con margen alrededor,
> dibuja el objeto con su relieve y su sombra.

La gorra tenía la cabeza entera con espacio de sobra; el bolsillo terminaba
exactamente en el borde del bolsillo.

### Pedirle el color a dev, y cuánto prompt hace falta

Cuatro celdas sobre la misma máscara ancha, sin pintar nada. La q es el control:
prompt completo **sin** nombrar color.

| Celda | Prompt | Color del bolsillo | Azulidad (B menos R) |
|---|---|---|---|
| q | completo, sin color | (49, 77, 106) | 57 |
| s | completo, **"black"** | (54, 71, 83) | 29 |
| t | medio, "black" + tela | (52, 68, 80) | 28 |
| u | **mínimo**, "A black patch pocket on the chest of the shirt." | (49, 64, 75) | 26 |

La prenda es (26, 31, 37).

**El color se pide pero no se obedece.** Nombrar "black" partió la azulidad al
medio, de 57 a 26, y bajó la luminancia un 19%. Pero el bolsillo quedó gris
medio, lejísimos del negro de la prenda. Es el mismo techo que midió el
experimento 1 para el color generativo, ahora medido en dev con máscara: la
palabra empuja, no manda.

> Para un color exacto hay que pintar. A dev se le **sugiere** el color.

**Y el prompt largo no aporta nada en dev.** Entre el completo de 50 palabras y
el mínimo de 10 hay 1600 píxeles de objeto de diferencia y menos de 5 unidades
de color. Los tres bolsillos son igual de buenos. Coincide con lo que dice la
documentación de Runware: en zonas chicas el modelo **deriva el material y la
iluminación de lo que rodea a la máscara**, así que describirlos es repetirle lo
que ya ve.

Eso invierte la práctica que veníamos arrastrando de Fill, donde el prompt de
diez propiedades sí cambiaba el resultado: **con dev, prompt corto**. Para la
interfaz es una diferencia grande, porque deja de pedirle al usuario que escriba
un párrafo.

### Las otras dos tareas

**Cuello** (celda n, máscara 3.46%): el cuello del polo pasó de caer plano a
quedar parado alrededor del cuello. No es la banda tipo mao que pedía el prompt,
es el mismo cuello reformado, pero es un cambio de confección real con la barba,
la piel y la botonadura intactas.

**Serigrafía** (celda r, máscara 7.20% sobre el pecho): **un gato de trazo
blanco estampado**, con el aspecto de tinta sobre punto y siguiendo la caída de
la tela. Abre una capacidad que no estaba en el plan: el sistema puede
**proponer estampados**, no solo colocar un logotipo que ya existe. Se estampó
encima de la botonadura, porque la máscara incluía esa zona.

---

## Lo que el Módulo 2 puede hacer, al 25-sep

| Tarea | Modelo | Qué hay que hacer | Evidencia |
|---|---|---|---|
| Quitar un elemento | Fill | máscara encima | exp. 3 |
| Agregar del mismo color | Fill | pintar la forma **+35 de luz** | celda l |
| Agregar en contraste | Fill | pintar la forma en su color | celdas a, j, m |
| Agregar confección sin pintar | dev 0.85 | máscara **con margen**, prompt corto | celdas q, u |
| Sugerir el color sin pintar | dev 0.85 | nombrarlo; empuja pero no manda | celdas q, s, u |
| Cambiar el cuello | dev 0.85 | máscara sobre el cuello | celda n |
| Agregar un accesorio | dev 0.85 | máscara sobre la zona, con margen | celda o |
| **Estampar un diseño** | dev 0.85 | máscara sobre el pecho | celda r |
| Cambiar la tela | dev 0.85 | máscara sobre la prenda | celda g |
| Cambiar la tela con Fill | — | **imposible** | `probar_textura` a, b, c |

---

## Dos errores de método, anotados porque van a volver

**1. El prompt que se saboteaba solo.** La celda del bolsillo empezaba con *"in
the same black knit fabric as the shirt"*. El concepto visual más fuerte de esa
frase es la tela lisa, no el bolsillo, y eso fue lo que pintó. Es la regla del
imán del experimento 3 aplicada al orden de las palabras: **un prompt de
inpainting empieza por el objeto**.

**2. La métrica que casi descarta un resultado bueno.** El bolsillo de +35 midió
desviación 3.75 y 1.0% de píxeles cambiados, o sea "no pasó nada". El bolsillo
está ahí, con su costura. **La diferencia media mide magnitud, no estructura**, y
una costura de bajo contraste es invisible para ella. Hay que mirar.

Y una tercera que no es de método sino de lectura: la primera explicación que se
dio para la animación de la interfaz —que Tailwind descartaba una variable— era
falsa, y se descartó poniendo una sonda a propósito. **Una hipótesis plausible
no es una medición.**

---

## El precio, otra vez

| Modelo | Catálogo | Cobrado |
|---|---|---|
| Fill, inpaint 1024×1024 | $0.0026 | **$0.0038** siempre |
| dev, inpaint 1024×1024 | $0.0038 | entre **$0.0026 y $0.0045** |
| Kontext, reference-to-image 832×1248 | $0.0130 | **$0.0201** |

Kontext cobró 55% por encima del catálogo con el mismo tamaño y los mismos pasos
que tres llamadas anteriores de $0.0130. En dev, esta vez la llamada barata fue
también la rápida (8.5 s contra 21.5 s), lo que es consistente con cobrar por
tiempo de cómputo, pero **no se convierte en ley**: ya hay un caso medido con la
misma latencia y el triple de precio. Se mantiene lo de siempre: **solo
`includeCost` es medición**.

**`maskMargin` no existe para Fill.** El esquema de la CLI lo lista y la API lo
rechaza con `unsupportedArchitectureMaskMargin`, sin cobrar. La documentación de
inpainting lo dice explícitamente. Con dev sí se acepta, y sobre una zona chica
**empeoró** el resultado: dejó un borrón más suave que el original.

---

## Lo que esto le pide a la app

1. **El pincel tiene que pintar color**, no solo marcar zona, y el selector de
   color pasa a ser parte de la instrucción. El usuario elige el color, dibuja
   la forma y escribe de qué tela es.
2. **La forma pintada importa**, así que el pincel necesita servir para dibujar
   contornos, no solo para manchar.
3. **"Textura" se reconecta a dev** con `strength` 0.85, avisando que ese modo
   puede reinterpretar el corte de la prenda.
4. **El modo sin pintar necesita margen**: si la app va a ofrecer "agregar algo
   acá" con dev, tiene que ensanchar la máscara por su cuenta, porque el usuario
   va a pintar el objeto y no el objeto más su alrededor.
5. **El color del pincel tiene que ser visible sobre cualquier prenda.** Hoy es
   el acento de la marca al 45% de opacidad, invisible sobre una camisa negra, y
   ahora que lo pintado es la instrucción eso dejó de ser un detalle cosmético.
