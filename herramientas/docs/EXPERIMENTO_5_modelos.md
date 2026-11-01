# Experimento 5 — generar la persona, medido

**Corrido el 20-sep-2026.** Catorce llamadas cobradas, **$0.0262**. Herramienta:
`probar_modelos.py`. Resultados en `herramientas/resultados_modelos/`.

La presentación (c) del objetivo específico 3 necesita una persona que no
existe: un modelo generado por IA sobre el que después se prueba la prenda. Esto
elige con qué y averigua cómo pedírselo.

> **Resultado en una línea.** FLUX.1 [dev] a **$0.0019** produce personas que el
> pipeline puede usar. Kontext, que era el candidato obvio, es el modelo
> equivocado y el más caro. Y **el idioma del prompt importa**: pidiendo lo
> mismo, el inglés obedece y el español no.

---

## La pregunta no era si sabe dibujar una persona

Eso se da por sabido. La pregunta es si sabe dibujar **una persona que este
pipeline pueda usar**, y el experimento 4 ya había dejado escrito qué necesita
el VTON de su foto de persona: fondo despejado, cuerpo entero o tres cuartos sin
recortes apretados, y ropa ajustada y lisa.

Así que los criterios se escribieron antes de generar, y están en el código:

1. ¿Se ve el cuerpo entero, sin recortar cabeza ni pies?
2. ¿El fondo es liso? **La desviación de la luma del borde lo mide**: alta
   significa que hay cosas ahí, una pared con textura o una sombra dura.
3. ¿La ropa es lisa y ajustada?
4. ¿La cara es creíble de cerca, que es donde falla lo barato?

El punto 2 es el único con número. Los otros tres se miran, y la lámina de
contacto existe para eso.

---

## Por qué no Kontext, con precios del catálogo

| Modelo | Tarea | Precio |
|---|---|---|
| `runware:100@1` (Schnell) | text-to-image 720p | $0.0006 |
| **`runware:101@1` (Dev)** | text-to-image 1024×1024, 28 pasos | **$0.0013** |
| `runware:106@1` (Kontext) | text-to-image 1248×832 | $0.0098 |

**Kontext es un modelo de edición**: recibe una imagen y una instrucción.
Generar una persona desde cero no edita nada, así que usarlo sería pagar 7.5
veces por una capacidad que no se usa. Era el candidato obvio precisamente
porque ya estaba integrado, y esa es la clase de razón que conviene desconfiar.

Schnell cuesta la mitad de Dev, pero es la versión destilada a cuatro pasos y lo
que se dibuja acá son **caras**. Se paga una vez por modelo y la foto se
reutiliza en todos los diseños del cliente, así que $0.0007 de diferencia no
decide nada.

---

## Parte 1 — Las cuatro primeras, en inglés

Cuatro personas, mismo lienzo (832×1216, 1.01 MP, los dos lados múltiplos de
64), 28 pasos, **una semilla fija por persona**. Lo único que varía es quién es.

El eje no es demográfico: es **la dificultad del contorno del pelo y de los
detalles chicos**, que es donde se rompe una foto que después hay que vestir.
Pelo corto, pelo largo suelto, canas con anteojos, y pelo rizado voluminoso.

| Persona | Fondo (luma ± desv.) | Costo | Latencia |
|---|---|---|---|
| hombre-adulto | 176.0 ± 24.1 | $0.0019 | 4.7s |
| mujer-adulta | 177.5 ± 23.3 | $0.0019 | 4.9s |
| hombre-mayor | 171.8 ± 26.4 | $0.0019 | 4.3s |
| mujer-joven | 192.5 ± 18.0 | $0.0013 | 4.8s |

**Los cuatro criterios se cumplieron**: cuerpo entero con cabeza y pies dentro
del cuadro, fondo gris parejo, ropa lisa, y caras que aguantan el acercamiento
—ojos simétricos, piel con textura, pelo con hebras separadas— sin el aspecto
plastificado que suele delatar a los modelos baratos.

**Dos de cuatro salieron descalzas.** No descalifica una prueba virtual, porque
la prenda va en el torso, pero arruina la foto como material de presentación.
De ahí salió el resto del experimento.

### El precio volvió a no ser el del catálogo

El catálogo dice $0.0013 y se cobró $0.0019 en tres de cuatro. Y **varió entre
llamadas idénticas**, mismo lienzo y mismos pasos, así que este modelo se cobra
por tiempo de cómputo y no por configuración.

Tercera vez que pasa en el proyecto. La regla del experimento 4 se sostiene: la
ficha es publicidad, el catálogo es una aproximación, **solo `includeCost` es
medición**.

---

## Parte 2 — El idioma, que resultó ser una variable

Se agregó al texto base la cláusula de los zapatos y se corrió en español, con
las mismas dos personas y las mismas semillas. Los dos textos son **traducción
literal uno del otro**, no una versión mejorada: si el español se escribiera
mejor, la comparación mediría al traductor.

La primera corrida en español devolvió a las dos personas **de perfil o de
espaldas**, con el texto diciendo "de pie y de frente a la cámara" igual que el
inglés. Y el fondo salió oscuro.

Así que se hizo lo que corresponde cuando dos explicaciones compiten: **separar
el prompt del idioma**. Se reescribieron los dos textos siendo más específicos
en los tres puntos donde aflojaba —pose, zapatos y fondo— y se corrieron las
mismas dos personas en los dos idiomas.

### Lo que arregló la especificidad

**La pose, en los dos idiomas.** Los cuatro salieron de frente. "De pie y de
frente a la cámara" no alcanzaba; "en vista frontal, con los hombros paralelos a
la cámara, la cara completamente visible y mirando directamente al lente" sí.

O sea que **parte de lo que parecía culpa del español era culpa del prompt**, y
se arregla escribiendo mejor. Lo que sobrevive a un prompt bien escrito es lo
que de verdad se le puede atribuir al idioma.

### Lo que no arregló

| Persona | Español | Inglés |
|---|---|---|
| hombre-adulto | luma **101.4** | luma **175.3** |
| mujer-adulta | luma **77.4** | luma **177.2** |

Los dos textos piden "gris claro y liso" con las mismas palabras. El español
devuelve un fondo **a la mitad del brillo pedido**, y no es de esta corrida:
sumando todo van **6 de 6 imágenes en español con fondo oscuro contra 8 de 8 en
inglés con fondo claro**.

La mujer volvió a salir descalza en español, con el texto pidiendo "zapatos
bajos lisos en los dos pies". En inglés los lleva.

> Esto coincide en dirección con el experimento 1, donde el inglés dio +7.0
> contra −0.8 del español. Aquello fue sobre la tarea de color, que se abandonó,
> así que no se podía trasladar. Ahora hay una segunda señal independiente, en
> otra tarea, apuntando al mismo lado.

---

## Parte 3 — La hipótesis del imán, y por qué no aplicaba

Quedaba una explicación alternativa para los descalzos, y tenía precedente
medido: en la escalera del fantasma (`EXPERIMENTO_3`), pedir "sin bordado"
**dibujó un bordado**, porque este tipo de modelo no tiene canal negativo y
cualquier sustantivo que se nombre entra al condicionamiento positivo.

Si "pies" funcionara igual, entonces `zapatos ... en los dos pies` estaría
pidiendo zapatos **y pies descalzos a la vez**.

Se probó quitando **una sola cosa**: "en los dos pies" y "on both feet". Todo lo
demás idéntico palabra por palabra, mismas semillas.

| Persona | Con "pies" | Sin "pies" |
|---|---|---|
| hombre es | 101.4 | **100.7** |
| mujer es | 77.4 | **76.2** |
| hombre en | 175.3 | **175.3** |
| mujer en | 177.2 | **176.4** |

**La mujer en español siguió descalza, y las cuatro imágenes salieron casi
idénticas.** Quitar esas palabras no movió nada: son inertes en este prompt.

### La regla, afinada

La hipótesis era buena y el resultado la refuta de forma limpia. Y deja la regla
mejor dicha que antes:

> **El imán aparece cuando se nombra un objeto para excluirlo**, no cada vez que
> se nombra un objeto.

En la escalera del fantasma, "sin bordado" es una **negación**, y el modelo no
tiene con qué resolverla. "En los dos pies" no niega nada: es una mención
positiva de algo que la imagen iba a tener igual, porque una persona tiene pies.
No hay contradicción, así que la palabra no compite con nada.

---

## Las decisiones que salieron de esto

1. **`runware:101@1` es el modelo** del paso de generar persona.
2. **El lienzo es 832×1216 y no se ofrece como opción.** Es el que le conviene
   al paso siguiente: P-Image devuelve la prueba virtual al tamaño de la foto de
   persona, y FLUX VTO deja pasar sin tocar todo lo que esté bajo 2 MP. Un
   tamaño que el usuario pudiera variar solo variaría lo que el VTON devuelve.
3. **Los prompts sugeridos van en inglés**, con su traducción al español
   ofrecida al lado. Es el único lugar del sistema donde el idioma del texto no
   lo ve el cliente final.
4. **El encuadre llega hasta los tobillos**, no hasta el piso. Un cuadro que
   llega al suelo gasta detalle en el calzado, que la prenda nunca toca; cortando
   arriba esos píxeles van a la cara y al torso, que son las dos cosas por las
   que se juzga una prueba virtual. Y de paso el problema de los descalzos deja
   de existir en vez de pelearse con él.

## Lo que queda anotado y no se midió

- **Schnell nunca se probó.** Cuesta la mitad y la decisión de no usarlo es un
  argumento, no una medición: que cuatro pasos se notan en las caras. Si alguna
  vez el volumen importa, es una comparación de dos llamadas.
- **`CFGScale` nunca se mandó** en ninguna de las catorce. El esquema no declara
  valor por omisión, así que ni siquiera se sabe con cuál corrió.
- **El español no se probó con un prompt escrito en español desde cero**, solo
  con traducciones literales. La traducción literal es lo correcto para aislar
  el idioma, pero deja abierta la pregunta de si un texto pensado en español
  rendiría distinto.
