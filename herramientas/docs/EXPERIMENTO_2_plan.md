# Experimento 2 — plan: ¿no pudo, o no lo pedimos bien?

**CORRIDO el 16-sep-2026.** Seis llamadas, $0.0110 (cinco a $0.0013 y E5 a $0.0045, que corrió a cuatro veces los píxeles). Herramienta: `herramientas/probar_cfg.py`,
resultados en `herramientas/resultados2/`.

> **Qué contestó, en corto: las cuatro hipótesis murieron, y tres de ellas eran perillas que no
> existen.** `negativePrompt` resultó inerte (E2 y E3 salieron **byte por byte idénticos**),
> el prompt largo no movió nada (+5.1 → +4.9) y la resolución alta **empeoró** (E5 devolvió
> prácticamente la imagen original). `CFGScale` cambia algo pero nada útil: +3.6 con 2 contra
> +5.1 con 10, ambos cero para el caso.
>
> **Y después el control positivo cerró el asunto.** Corrimos el Ejemplo 2 de la documentación
> del propio modelo, literal, con sus imágenes y su prompt (`herramientas/probar_control.py`).
> Pide *"cobalt-blue enamel"* sobre un ahumador de acero. **La salida que Runware publica como
> resultado de ese ejemplo tiene azulidad −27.2 contra los −26.0 de la entrada**: una mancha
> azul sobre acero, no un recoloreado. Nuestra reproducción dio −26.0, o sea que caímos justo
> encima de la de ellos.
>
> Conclusión: **FLUX.1 Fill dev no recolorea**, y no es cosa nuestra. Regenera estructura con
> ganas (en el control desapareció la jaula de alambre del ahumador) y conserva el color. Es un
> modelo de rellenar y quitar. Ver `EXPERIMENTO_1_color_generativo.md` para la corrección de la
> referencia de azulidad y la retractación sobre `strength`.

El experimento 1 midió que FLUX Fill llegó a alrededor del 38% del cambio de color pedido
(decía 10-15%, contra una referencia de azulidad inflada que se corrigió el 17-sep). Pero la
investigación posterior encontró **cuatro diferencias entre lo que mandamos y lo que declara el
esquema del modelo**, así que aquellos números prueban que **no pudo así**, no que no pueda.

Esto las separa, y separarlas importa: si el color generativo funciona bien configurado, la
comparación de §2.3 tiene dos brazos de verdad. Si no funciona ni así, el hallazgo es mucho más
fuerte y se puede afirmar sin reservas.

---

## Por qué una escalera y no una matriz

Cada caso agrega **exactamente una cosa** al anterior. Así cada par adyacente atribuye, y no
hace falta el producto cartesiano — que serían dieciséis llamadas para la misma información.

| | `inputs` | `CFGScale` | `negativePrompt` | Prompt | Lienzo |
|---|---|---|---|---|---|
| **E0** | ✅ | — | — | corto | 704×448 |
| **E1** | ✅ | **2** | — | corto | 704×448 |
| **E2** | ✅ | **10** | — | corto | 704×448 |
| **E3** | ✅ | 10 | **✅** | corto | 704×448 |
| **E4** | ✅ | 10 | ✅ | **largo** | 704×448 |
| **E5** | ✅ | 10 | ✅ | largo | **1408×896** |

Todas con `strength 0.85` y `steps 28`, que es lo que usó **B** del experimento 1 — el mejor de
aquella tanda, y la referencia contra la que se compara todo esto.

**Y todas con la misma semilla** (`20260917`). Sin fijarla, cada llamada arrancaría de un ruido
distinto y parte de la diferencia entre E0 y E1 no sería el `CFGScale` sino azar: se estaría
atribuyendo a la variable algo que puede ser suerte.

> El precio de fijarla hay que decirlo: **cada celda pasa a ser una sola muestra.** Dice qué
> hace esa configuración con *esa* semilla, no su promedio. Para una ablación que busca
> dirección y magnitud gruesa alcanza; para publicar un número, hacen falta repeticiones.
>
> **El experimento 1 no tenía semilla fija**, así que sus comparaciones arrastran ese ruido.
> Que las tres apuntaran en la misma dirección lo hace creíble, pero no medido.

| Comparación | Aísla | Qué contestaría |
|---|---|---|
| **B → E0** | la forma de la petición | ¿mandar las imágenes dentro de `inputs` cambia algo, o Runware trata las dos formas igual? |
| **E0 → E1 → E2** | `CFGScale` | ¿el valor por omisión estaba apagando la guía? Si E1 (bajo) se parece a E0 y E2 (alto) se despega, sí |
| **E2 → E3** | `negativePrompt` | ¿sirve de algo excluir el negro explícitamente? Ojo: el esquema dice que **se ignora con `CFGScale ≤ 1`**, así que solo tiene sentido probarlo con la guía encendida |
| **E3 → E4** | detalle del prompt | ¿los ciento veinte palabras del ejemplo oficial valen algo contra nuestras doce? |
| **E4 → E5** | resolución | ¿0.315 MP era demasiado poco? **1408×896 son 1.26 MP**, por encima del megapíxel donde FLUX está entrenado |

> **Por qué 1408×896 y no 1024×640**, que era la primera idea: 1024×640 tiene proporción 1.600
> y las otras cinco corren a 1.571, así que E5 habría cambiado **dos cosas** — la resolución y
> cuánto se deforma la prenda (de 9.9% a 8.3%). 1408×896 es *exactamente el doble lineal* de
> 704×448: mismos múltiplos de 64, misma proporción al dígito, cuatro veces los píxeles. Aísla
> el tamaño y nada más.
>
> Cuesta más por lo mismo — el modelo cobra por cómputo — y por eso el total sube de $0.008 a
> unos $0.012.

---

## Los textos

**Corto** — el mismo que usó B, para que la comparación arranque de algo conocido:

> a navy blue t-shirt, cotton fabric, soft folds and natural shading, white background

**Largo** — siguiendo el patrón del ejemplo oficial del ahumador, que es literalmente este caso:
producto enteramente enmascarado sobre fondo plano. Describe **material, acabado, qué preservar
e iluminación**.

Y corrige un error del corto: **no menciona el fondo**. La regla documentada es que el prompt
describa *solo la zona enmascarada*, porque el modelo ya ve lo que la rodea; decirle "white
background" le describe algo que no tiene que pintar y genera señales en conflicto.

**Negativo** — excluye explícitamente el color del que hay que salir, que es justo lo que el
modelo venía reproduciendo.

---

## Cómo se lee el resultado

La misma métrica que el experimento 1: **azulidad** (`B − (R+G)/2`) del promedio de los píxeles
dentro de la máscara. Referencias:

| | Azulidad |
|---|---|
| Original (negra) | 0.0 |
| Mejor del experimento 1 (caso B) | +7.0 |
| **Un azul marino real, medido** | **+18.3** |

**El script mide solo y escribe la tabla**, en vez de dejarla para inspección a ojo. Medir a ojo
fue lo que casi nos hace concluir "se ve negro" sobre un caso que sí se había movido.

---

## Lo que este experimento NO decide

**No decide si el color se hace generativo o determinista.** Eso ya está decidido en §2.3 y por
una razón que ningún ajuste cambia: el camino determinista devuelve **exactamente** el
hexadecimal pedido, y para cotizar uniformes el color es el entregable.

Lo que decide es **si el brazo generativo de la comparación es honesto**. Medir un método mal
configurado contra uno bien configurado no es una comparación, es una trampa — y sería la clase
de error de método que invalida un capítulo entero.
