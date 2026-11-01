# Experimento 4 — qué VTON usar, medido

**Corrido el 19-sep-2026.** Diez llamadas cobradas, **$0.3000**. Herramientas:
`probar_vton_flux.py`, `probar_vton_pimage.py`, `vton_comun.py`, `medidas.py`. Resultados en
`herramientas/resultados_vton/`.

La Fase 3 dejó pendiente elegir proveedor y dijo cómo: **no se decide leyendo, se decide
midiendo**, y el criterio no es la calidad general sino **la fidelidad del logotipo**, porque el
producto es un uniforme corporativo y un uniforme con el logo borroso no es el producto.

> **Resultado en una línea. Gana P-Image**, el barato, y no por poco: empata o mejora a FLUX VTO
> en los cuatro criterios, conserva la cara casi intacta, respeta el tamaño de entrada, tarda un
> tercio y **cuesta la doceava parte**.
>
> Y de paso se cayó un supuesto del proyecto: **tampoco el catálogo dice el precio real.**

---

## El banco

Cuatro camisas sobre la misma persona, misma semilla, mismas imágenes preparadas igual para los
dos modelos. Lo único que cambia entre las dos corridas es el modelo.

| Camisa | Qué mide | Resolución |
|---|---|---|
| `white_polo` | bordado fino sin texto, el caballito de Ralph Lauren | 1200×1600 |
| `with_logo` | **texto**: "YOUR LOGO" en dos renglones | 1214×1364, con alfa |
| `007_shirt` | estampado grande de alto contraste, y además camiseta en vez de polo | 554×554 |
| `low_qual_polo` | confección de dos colores más texto, en baja resolución | 447×447 |

Dos de las camisas están deliberadamente en baja resolución. **No es descuido**: el caso real es
que el cliente manda la foto que tiene.

La persona es `high_qual_test.jpg`, 1280×1920, mandada a 1.90 MP. Y hay una segunda,
`normal_qual_test.jpg`, 640×960, **del mismo hombre, misma pose, mismo fondo**, para que
comparar sus resultados mida la resolución y nada más.

### Dos cosas que hubo que arreglar antes de gastar

- **`with_logo.png` venía con fondo transparente.** Convertida a RGB sin más, el alfa se vuelve
  negro: le habríamos mandado una camisa crema recortada sobre fondo negro cuando los dos
  modelos piden justamente *flat-lay sobre fondo plano*. Se aplana sobre blanco
  (`vton_comun.preparar_prenda`).
- **La foto de persona anterior, `polo_verde_high_res.jpg`, medía 0.2 MP** pese al nombre. Con
  P-Image devolviendo la salida al tamaño de la entrada, el resultado habría sido una miniatura
  y un logo ilegible no habría distinguido entre un modelo que falla y unas letras que no caben.
  De ahí salió `medidas.py`: los nombres mienten, el número no.

### Los criterios, escritos antes de mirar

Están en el código, en `vton_comun.BANCO`, y se escribieron antes de la primera llamada. Mirar
primero y decidir después qué contaba como éxito es cómo se aprueban resultados malos.

---

## Cómo se piden, que no se parece a Fill

Ni máscara ni `seedImage` ni `width`/`height`. Las dos imágenes van en `inputs.referenceImages`,
cada una con su `role`. Verificado con `runware model schema`, no de memoria.

| | `bfl:flux@vto` | `prunaai:p-image@try-on` |
|---|---|---|
| Imágenes | exactamente 2: `person` y `garment` | 1 `person`, 1 a 11 `garment`, 1 `pose` opcional |
| `positivePrompt` | **obligatorio** | **opcional** |
| Lienzo | no existe | no existe |
| Propio | `steps` 1 a 4, por omisión 4 | `settings.preserveInputSize`, por omisión true |

**El prompt de FLUX se modeló sobre los ejemplos oficiales del modelo, no sobre la frase corta
de su guía.** Los ejemplos usan párrafos que enumeran qué preservar, describen la prenda por sus
rasgos de confección y piden caída y sombras creíbles. Coincide con lo que el experimento 3 ya
había medido: el prompt de diez propiedades le ganó al de cinco. Y se le agregó algo que sirve
al criterio: **pedir de forma positiva que las marcas del pecho queden nítidas y legibles**.
Nunca al revés; enumerar lo que no se quiere fue lo que dejó 542 píxeles de artefacto en Fill.

**P-Image corrió sin prompt**, y eso hay que leerlo bien. Su esquema lo describe como
*"experimental guidance for non-flatlay garment images"*: sirve para desambiguar cuando la
referencia no es un flat-lay limpio. Las cuatro nuestras lo son. **No es que se le dio menos
ayuda, es que no la pide.**

---

## Los resultados

### Fidelidad del logotipo, que es el criterio que decide

| Camisa | FLUX VTO | P-Image |
|---|---|---|
| bordado fino | pasa: se ve el caballo con jinete y el taco | **pasa, y mejor**: además conserva el piqué y el tono crema |
| texto | pasa: "YOUR LOGO" legible en dos renglones | **pasa** |
| estampado grande | pasa: el 007 con el cañón reconocible | **pasa** |
| dos colores | cuello, mangas y vivo rojo sí; **la insignia queda deshecha** | **pasa**: la insignia queda entera y legible |

La diferencia del bordado fino no es de nitidez sino de **material**: FLUX alisa la textura de
piqué y blanquea el crema de la referencia. Eso es fidelidad de prenda, que es el criterio.

### Lo que no estaba en los criterios y pesó

**La cara.** Cambio medio en la franja de la cabeza: **0.3 en P-Image contra 3.2 a 4.4 en FLUX**.
P-Image prácticamente no la tocó. El objetivo específico (b) es que el cliente se vea a sí
mismo, así que esto no es un detalle estético.

**El tamaño.** P-Image devolvió exactamente lo que entró, 1125×1688. FLUX devolvió 1120×1680,
redondeando por su cuenta.

**La latencia.** P-Image se mantuvo entre 11.0 y 13.2 s en sus cinco llamadas. FLUX fue de 10.5
a **43.7 s**. La ruta de generación tiene el techo en 60 s, así que la peor llamada de FLUX
gastó tres cuartos del presupuesto.

### La resolución de la persona

Con la foto normal (0.61 MP) **los dos siguieron leyéndose**: "YOUR LOGO" salió legible en
ambos. O sea que la resolución de entrada no es el cuello de botella que parecía, y una foto de
teléfono razonable alcanza.

---

## El precio, que resultó ser el hallazgo lateral

| | Ficha del modelo | Catálogo (`runware model pricing`) | **Real (`includeCost`)** |
|---|---|---|---|
| `bfl:flux@vto`, persona 1.90 MP | por fórmula de MP | $0.0475 | **$0.0575** |
| `bfl:flux@vto`, persona 0.61 MP | por fórmula de MP | $0.0475 | **$0.0475** |
| `prunaai:p-image@try-on`, ambas | $0.0150 | $0.0069 | **$0.0045** |

Tres cosas:

1. **FLUX escala con el tamaño de la entrada; P-Image no.** P-Image cobró lo mismo con una foto
   tres veces más grande.
2. **El catálogo tampoco acierta.** Este proyecto tenía escrita la regla *"el catálogo es la
   fuente, la página de producto es publicidad"* y hay que afinarla: la ficha es publicidad, el
   catálogo es **una aproximación**, y lo único que es medición es `includeCost`.
3. Con los números reales, P-Image no es siete veces más barato sino **12.8 veces**.

---

## La decisión

**P-Image-Try-On (`prunaai:p-image@try-on`) es el proveedor del Módulo 3.** Empata o mejora en
los cuatro criterios de logotipo, conserva la identidad mejor, respeta el tamaño de entrada,
tarda un tercio y cuesta la doceava parte.

Esto cierra dos riesgos que la Fase 3 dejó abiertos: si el logotipo sobrevive, con un sí medido, y
cuál proveedor usar, con una medición y no con una lectura.

Y cierra un tercero por segunda vez y desde el otro lado: **los dos modelos aceptan el flat-lay que
produce el pipeline**, y sus documentaciones lo nombran como el formato que mejor leen. La
prenda plana con el logo compuesto encima no es un formato que toleren, es el que prefieren.

### Lo que queda anotado para el informe

- **FASHN nunca se midió.** La Fase 3 lo tenía como candidato fuerte por su fidelidad de
  logotipo declarada, pero vive en un segundo SDK y P-Image ya pasa los cuatro criterios a la
  doceava parte del precio. Queda como alternativa evaluada en papel y no probada, que es
  distinto de descartada.
- **El caso difícil no se probó**: un logotipo con texto chico sobre una prenda oscura. Los
  cuatro del banco son marcas sobre tela clara o un estampado grande.
