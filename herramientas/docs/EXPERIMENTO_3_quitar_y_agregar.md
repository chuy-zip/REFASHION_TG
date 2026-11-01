# Experimento 3 — qué sabe hacer FLUX Fill, medido

**Corrido el 17 y 18-sep-2026.** Nueve llamadas cobradas y una rechazada sin cargo, **$0.0428**. Herramientas:
`probar_quitar.py`, `probar_fantasma.py`, `probar_manga.py`, `mascara_por_color.py`,
`mascara_manga.py`. Resultados en `herramientas/resultados3/`.

Los experimentos 1 y 2 y el control positivo cerraron que **FLUX.1 Fill dev no recolorea**.
Este busca lo contrario: qué sí hace. Y termina encontrando la regla que explica las tres tareas.

> **Resultado en una línea.** Quitar funciona **perfecto**. Agregar confección **también
> funciona, pero solo si antes se le borra de la semilla lo que estorba**: pedirle una manga
> larga sobre un brazo desnudo devuelve un brazo desnudo; taparle el brazo con el color del polo
> primero y volver a pedírsela devuelve **una manga creíble**.
>
> Esto corrigió la conclusión que este mismo documento tenía escrita hace unas horas. Ver
> "La conclusión, corregida".

---

## La imagen, que por fin cumple las condiciones

`test_images/dark_polo_high_res.jpg`, **1280×1920 (2.46 MP)**: un polo negro con cuello,
cartera de dos botones y **dos emblemas bordados en dorado** —una estrella y un escudo con ave
y texto— sobre una persona, con luz de ambiente y un entorno real detrás.

Importa porque corrige las tres condiciones adversas que habíamos medido:

| | Antes (la camisa que fallaba) | Ahora |
|---|---|---|
| Fracción enmascarada | **44.5%** | **0.89%** |
| Tipo de foto | recorte de producto sobre blanco | **foto natural** |
| Deformación de proporción | 9.9% | **0.00%** |

Lo de la proporción salió de que 1280×1920 es exactamente 2:3 y 896×1344 también, los dos
múltiplos de 64. Por primera vez el lienzo no estira la prenda.

---

## Parte 1 — Quitar: funciona

### La primera corrida y el fantasma

Los 3073 píxeles dorados de la máscara quedaron en **cero**, pero el resultado no fue uniforme:
**la estrella se borró limpia y el escudo dejó un fantasma en relieve** con su propia silueta,
texto incluido.

No fue falta de cobertura —se verificó dibujando el borde de la máscara sobre la imagen—, así
que la explicación era que **los píxeles originales bajo la máscara seguían influyendo**.

### `--rellenar`: borrar la estructura antes de mandarla

La API de Runware no expone el ajuste que resolvería esto del lado del modelo (el *latent noise*
en vez de *original* de las interfaces locales). Se resolvió de este lado: cada píxel enmascarado
toma el color del **píxel de tela más cercano**, y después se desenfoca para fundir las costuras.
Queda el degradado de luz **sin textura, a propósito**.

| | Píxeles anómalos | Caja del artefacto |
|---|---|---|
| Sin rellenar | 1305 (12.16%) | 87×111 |
| **Con relleno** | **514 (4.79%)** | **23×54** |

El fantasma con forma de ave desapareció. Quedó un garabato blanco fino, sin relación con la
silueta original.

### La escalera del garabato

Tres celdas, **semilla fija 20260917**, semilla de imagen rellenada en las tres. Sin fijar la
semilla no se podría atribuir nada — el error del experimento 1, que el 2 corrigió.

| Caso | Máscara | Prompt | Px anómalos | Luma vs tela vecina | Textura vs tela vecina |
|---|---|---|---|---|---|
| **A** | detallada | completo, con negativos | **542** | +6.2 | 5.46 / 1.74 = **3.1×** |
| **B** | detallada | **limpio** | **0** | +2.8 | 1.79 / 1.75 = **1.02** |
| **C** | **casco convexo** | limpio | **0** | **+2.1** | 1.60 / 1.68 = 0.95 |

### El hallazgo: enumerar lo que no querés lo invoca

**A → B llevó el artefacto de 542 a cero.** Misma máscara, misma semilla, mismos pasos: lo único
que cambió fue quitarle al prompt esta cola, copiada del Ejemplo 1 de la documentación de
Runware:

> *"...with no emblem, badge, logo, star, crest, embroidery, stitching, text, outline, patch,
> seam, discoloration or retouching artifact."*

Y la prueba visual es difícil de discutir: **el artefacto de A es un escudito bordado**. Se le
pidió que no dibujara un badge y dibujó un badge.

La razón la teníamos medida desde el experimento 2: **este modelo ignora `negativePrompt`** (E2
y E3 salieron byte por byte idénticos). Sin canal negativo, esas palabras solo pueden vivir en
el condicionamiento **positivo**, donde funcionan como imanes.

> Vale la pena decir de dónde vino el error: de copiar el patrón del Ejemplo 1 de la
> documentación del fabricante. Es la misma fuente cuyo Ejemplo 2 ya habíamos medido que no
> reproduce lo que promete. **Sus ejemplos no son demostraciones validadas.**

### La forma de la máscara: sin diferencia medible, y eso es la buena noticia

B y C empataron en cero, así que el conteo tocó piso y no puede distinguirlas. En las métricas
continuas C funde mejor el tono (+2.1 contra +2.8) y B iguala mejor la trama (1.02 contra 0.95).
Las dos diferencias son chicas y hay **una sola muestra por celda**.

La lectura honesta: **no hay diferencia medible entre la máscara detallada y la mancha compacta.**

Y eso es exactamente lo que el producto necesita. **La máscara tosca no hizo daño.** Si la mancha
hubiera empeorado el resultado, el pincel de la app sería un problema estructural; no lo es.

> Salvedad para no estirar la conclusión: el casco **sigue derivado del emblema**. Que una mancha
> convexa ajustada funcione no prueba que un trazo grande e irregular a mano alzada funcione
> igual. Eso se prueba barato cuando exista el pincel.

### Quién hizo el trabajo

Hubo una objeción legítima: si el relleno determinista queda tan bueno, el módulo de difusión es
de adorno. Medido con desviación local en ventanas de 7×7:

| | Textura |
|---|---|
| Relleno determinista solo | 0.54 (**27%** de la tela real) |
| Después de la IA (caso B) | 1.79 (**102%** de la tela vecina) |

**La IA restauró la textura que al relleno le faltaba.** El reparto queda demostrado: lo
determinista pone geometría y luz, la difusión pone la trama.

---

## Parte 2 — Agregar: funciona, con la semilla preparada

### Primer intento: sin preparar la semilla

Convertir la manga corta en larga. Es la prueba donde **ningún método determinista puede hacer
nada**: no hay tela que copiar ni región que continuar, hay que inventar el volumen del paño,
cómo cae, dónde pliega y cómo termina en el puño.

Máscara construida con `mascara_manga.py`: los dos antebrazos detectados por piel, ensanchados
32 px porque una manga tiene volumen, y subidos 80 px para montarse sobre el dobladillo actual.
Cubre el **10.15%**.

| | Entrada | Salida |
|---|---|---|
| Píxeles de piel dentro de la máscara | 55413 | **58536 (106%)** |
| Luma dentro de la máscara | 73.6 | 72.6 |

**El modelo devolvió un brazo desnudo**, apenas más liso.

### No fue la máscara, y se verificó

| | |
|---|---|
| De la máscara, tela oscura (la manga corta actual) | **43.1%** |
| Primeros 40 px de cada blob que son tela oscura | **100%** |

O sea que el modelo tenía el dobladillo **dentro** de la máscara, 43% de contexto de tela, 32 px
de holgura alrededor del brazo y un prompt que pedía explícitamente puño de punto. Pintó un brazo.

---

### Segundo intento: taparle el brazo primero

`rellenar_con_tela()` toma la **mediana de los píxeles oscuros del torso** —RGB (12, 26, 34)— y
pinta con ese color toda la zona enmascarada. El modelo deja de ver un brazo y pasa a ver una
mancha del color de la prenda con la forma que tendría la manga.

| | Sin relleno | **Con tela** |
|---|---|---|
| Piel dentro de la máscara | 55413 → **58536 (106%)** | 55413 → **13598 (25%)** |
| Luma dentro de la máscara | 73.6 → 72.6 | 73.6 → **30.8** |
| Contra la manga corta real (26.8) | — | **+4.0** |

**Y en la imagen es una manga de verdad**: cae siguiendo el brazo, pliega en el codo, tiene borde
limpio contra el fondo y la trama concuerda con la del torso. El polígono negro plano de la
semilla salió convertido en paño.

De los 13598 píxeles de piel que quedan, **10076 están en la muñeca y la mano al borde inferior
del cuadro** — o sea donde una manga larga *debe* terminar. El residuo real es menor que el número.

---

## La conclusión, corregida

La primera versión de este documento decía *"FLUX Fill no introduce semántica nueva"*. **Con el
segundo intento de la manga eso quedó desmentido**, y la formulación correcta es más útil:

> **FLUX Fill no contradice lo que ve debajo de la máscara.**
>
> Si ve un brazo desnudo, reconstruye un brazo desnudo por más que el prompt pida una manga. Si
> ve una mancha del color de la prenda, renderiza paño. No se niega a inventar: se niega a
> **contradecir la evidencia de la semilla**.

| Tarea | Qué ve bajo la máscara | Resultado |
|---|---|---|
| **Quitar** un emblema | tela vecina copiada | **funciona** |
| **Agregar** manga, sin tapar | un brazo desnudo | **no funciona** |
| **Agregar** manga, tapada con tela | una mancha color prenda | **funciona** |
| **Recolorear** | la prenda en su color original | **no funciona** (exp. 1 y 2) |

La técnica que atraviesa las tres que funcionan es la misma: **preparar la semilla de forma
determinista para que no contradiga lo que se va a pedir.** Y no le roba trabajo a la IA — el
relleno solo llega al 27% de la textura real y la IA la lleva al 102%.

### La predicción, probada (18-sep, $0.0032)

Quedaba una pregunta: en los dos casos que funcionaron el relleno era **del mismo color que la
tela de alrededor**. El color es el único donde el relleno **discrepa** con el resto —azul marino
rodeado de tela negra— y la función de este modelo es hacer que la zona concuerde con lo que la
rodea, así que el contexto podía arrastrar el azul de vuelta.

Se tiñó la camisa negra de los experimentos 1 y 2 conservando su luminancia, hasta la azulidad que
mide un azul marino real, y se mandó eso pidiendo solo tejido (`herramientas/probar_pretenido.py`,
**una sola llamada**).

| | Azulidad |
|---|---|
| Camisa original | −0.0 |
| Semilla teñida (lo que se mandó) | **+18.1** |
| **Resultado** | **+17.9** |
| *Mejor del experimento 1* | *+7.0* |
| *Mejor del experimento 2* | *+5.1* |

**Conservó el 99% del color que se le entregó.** El modelo no desmiente la semilla ni siquiera
cuando el relleno contradice el contexto, así que la regla se sostiene en su forma fuerte y el
camino híbrido —recolorear exacto y después pedir tejido— funciona.

> **PERO el brazo generativo no aportó nada en este caso, y hay que decirlo.** La textura dentro
> de la máscara bajó de **3.62 en la semilla a 2.82 en el resultado**: el modelo **alisó** la tela
> en vez de enriquecerla. O sea que acá el recoloreo determinista solo ya entregaba el hexadecimal
> exacto **y más textura** que el resultado generado.
>
> No contradice el hallazgo del borrado (allí la textura subió de 27% a 102% de la real), y la
> diferencia probablemente esté en el material de partida: aquel era una foto natural con trama
> real, ésta es un recorte de producto de estudio con muy poca (3.28 de textura original). Sobre
> foto natural el resultado podría ser otro, y **eso no se midió**.
>
> Para §2.3 el efecto es reforzarla: para esta clase de imagen, el camino determinista gana en
> exactitud, en costo, en tiempo **y ahora también en textura**.

---

## Parte 3 — Kontext: la mejor manga, y conserva a la persona

FLUX.1 Kontext dev (`runware:106@1`), edición por instrucción **sin máscara**.

Detalle operativo que costó un viaje (rechazado, **sin cargo**): Kontext **no acepta cualquier
múltiplo de 64**, sino una lista fija que el propio error devuelve. Está guardada en
`probar_kontext.py`. Por suerte **832×1248 da razón 1.5 exacta**, la de 1280×1920, así que también
corrió con deformación cero.

| | Fill + tela | **Kontext** |
|---|---|---|
| Piel en la zona de los antebrazos | 55413 → 13598 | 47842 → **6908** |
| Brazos resueltos | **solo el derecho**; el izquierdo concentra 10076 px del residuo | **los dos** |
| Luma de la zona | 73.6 → 30.8 | 73.7 → **25.0** |
| Cambio fuera de los brazos | **2.55** | **16.00** |
| Porción del resto que cambió más de 25/255 | — | **13.7%** |
| Costo | $0.0038 | **$0.0130** (estimamos $0.0098) |

**Kontext hace la mejor manga larga de las dos, y con diferencia.** Las dos mangas salen
completas y creíbles, contra la de Fill que solo resolvió bien un brazo.

> **CORRECCIÓN, y es importante porque la versión anterior de este documento decía lo
> contrario.** Acá estaba escrito que Kontext *"cambió a la persona"* y que por eso quedaba
> descartado. **Eso estaba mal, y el error fue de método:** el primer cotejo recortó las imágenes
> por **fracción** del alto, y como Kontext reencuadra, la cara caía en otro lugar del recorte;
> leí esa diferencia de posición, sumada a un revelado más contrastado, como si fuera otra cara.
>
> Recortando **la misma caja de píxeles** en las dos, la identidad se conserva: mismo perfil de
> nariz, misma forma de barba, mismo nacimiento del pelo, mismos ojos. **Es el mismo hombre.**

Lo que Kontext sí altera, y hay que decirlo con precisión:

| | |
|---|---|
| **Identidad** | se conserva |
| **Encuadre** | cambia: la cabeza queda más grande y más arriba en el cuadro |
| **Micro-detalle de piel** | se re-renderiza, más contrastado y más marcado |
| **Los emblemas del pecho** | se distorsionan |
| **Resto de la imagen** | 13.7% cambió más de 25/255 |

**Y la distorsión del logotipo no es un problema en esta arquitectura**, porque en el software el
logotipo vive en **una capa aparte** y se compone *después* de los pasos generativos. Es más: que
los pasos generativos deformen un logotipo es justamente la razón por la que la composición va al
final.

> Sobre el encuadre del objetivo: Kontext **no es inpainting con máscara**, y el objetivo
> específico nombra inpainting. Pero inpainting ya tiene sus dos oficios medidos —limpiar y
> agregar—, así que el objetivo se cumple con él. Kontext entra como **una técnica adicional del
> brazo de difusión** para lo que el inpainting no alcanza, no como su reemplazo. El objetivo
> general habla de *"modelos de difusión"*, que los cubre a los dos.

---

## Qué sigue

1. **El módulo tiene dos oficios, los dos medidos**: **quitar** elementos de la prenda base y
   **agregar** confección, este último con la semilla preparada. Los dos cumplen *"ejecutar las
   modificaciones visuales sobre una prenda seleccionada"* sin depender del color.
2. **Probado: el color sobrevive a la semilla pre-teñida (99%), pero el paso generativo alisó
   la tela.** Ver arriba. Lo que queda sin medir es el mismo caso sobre **foto natural**, donde sí
   hay trama que conservar.
3. **Kontext queda adentro** como la técnica para cambios estructurales grandes, donde el
   inpainting no llega. Cuesta 3.4 veces más ($0.0130 contra $0.0038), así que conviene
   reservarlo para eso.
4. **Falta probar inpainting para agregar cosas GRANDES**, no detalles finos: la manga es un
   caso intermedio y el brazo izquierdo no salió. Saber dónde está el límite de tamaño decide
   qué tarea va a cada modelo.
5. **La técnica de preparar la semilla es lo que hay que llevar a la app**, no solo el pincel: es
   lo que separa un resultado bueno de un fantasma.

---

## El flujo que se desprende

Con lo medido, cada herramienta tiene su tarea y el orden no es arbitrario:

1. **Limpiar la prenda base** — inpainting (Fill + relleno determinista). Quitar estampados,
   etiquetas y logos ajenos del catálogo.
2. **Cambios estructurales** — Kontext para los grandes (mangas, cuello); inpainting para los
   chicos, hasta donde llegue (pendiente medir el límite).
3. **Componer el logotipo** — capa aparte, determinista, **después** de lo generativo. Va al
   final justamente porque los pasos generativos deforman logotipos, como se vio acá.
4. **Color** — determinista, hexadecimal exacto (§2.3).
5. **VTON** — al final.
