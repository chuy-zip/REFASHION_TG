# Experimento 7 — en qué formato conviene guardar lo que se genera

**Corrido el 25 y 26-sep-2026.** Medición local gratis, más cinco llamadas
pagas: **$0.0194**. Herramienta: `probar_webp.py`. Imágenes en
`herramientas/formatos/` y `herramientas/webp/`.

Nació de un síntoma de uso, no de una idea: abrir la pantalla de un diseño
tardaba unos siete segundos.

> **Resultado en una línea.** Un diseño cargaba **22 MB** porque cada generación
> se guardaba en PNG de 3.5 MB, y las miniaturas de 150 px bajaban el archivo
> entero. En WEBP a calidad 95 la misma imagen pesa **0.13 MB**, veintiséis
> veces menos, con una diferencia media de 1 sobre 255. Los cuatro modelos que
> reciben imágenes **aceptan WEBP de entrada**, que era el bloqueante.

---

## Parte 1 — Cuánto se gana, medido sobre una imagen nuestra

Una generación real de 896×1344, guardada en varios formatos con Pillow y
comparada píxel por píxel contra el PNG original.

| Formato | Peso | Contra PNG | Diferencia media | Máxima |
|---|---|---|---|---|
| PNG (lo que se guardaba) | 3.45 MB | — | — | — |
| **WEBP sin pérdida** | 0.88 MB | 3.9x | **0.000** | 0 |
| WEBP calidad 99 | 0.21 MB | 16.1x | 0.891 | — |
| **WEBP calidad 95** | **0.13 MB** | **25.7x** | 1.034 | 15 |
| WEBP calidad 90 | 0.08 MB | 41.9x | 1.259 | 25 |
| JPEG calidad 95 | 0.29 MB | 12.0x | 0.750 | 10 |

**El sin pérdida no está disponible, y eso cambió la decisión.** `outputQuality`
del proveedor llega hasta 99: el WEBP sin pérdida solo se consigue
recodificando de este lado, lo que obligaría a bajar y volver a subir cada
imagen, que es justo lo que `uploadEndpoint` vino a evitar.
Así que la elección real era entre 95 y 99, las dos con
pérdida, y se eligió 95, que además es el valor por omisión del proveedor.

**Una corrección de método:** la primera recomendación fue "sin pérdida, que es
gratis en calidad", y estaba mal. No por el número sino por no haber leído el
rango del parámetro antes de recomendar.

---

## Parte 2 — El bloqueante: ¿lo aceptan de entrada?

En esta cadena **cada generación es la entrada de la siguiente**, así que el
formato de salida solo sirve si también se acepta de entrada. Y no está
documentado: la página de image-to-image no menciona formatos y la de Media
Storage solo dice "URL, Data URI o Base64". Se probaron los cuatro modelos que
reciben imágenes, por **URL firmada de R2**, que es el camino real: el proveedor
busca la URL, reconoce el tipo por el `Content-Type` guardado y recién ahí
decodifica.

| Modelo | Qué recibió | Resultado | Devolvió |
|---|---|---|---|
| `runware:102@1` Fill | `seedImage` WEBP + `maskImage` PNG | **acepta** | WEBP 45 KB |
| `runware:101@1` dev | `seedImage` WEBP + `maskImage` PNG | **acepta** | WEBP 45 KB |
| `runware:106@1` Kontext | `referenceImages` WEBP | **acepta** | WEBP 127 KB |
| `prunaai:p-image` | dos `referenceImages` WEBP | **acepta** | WEBP 62 KB |

Cuatro llamadas, **$0.0149**, con pasos y tamaño al mínimo porque la pregunta
era si acepta y no qué tan lindo sale. Las máscaras fueron PNG a propósito: las
dibuja el navegador y van a seguir siendo PNG, así que la mezcla probada es la
que ocurre de verdad.

**Y una prueba virtual real** con las dos entradas en WEBP, $0.0045: la camiseta
amarilla quedó puesta con el estampado completo y legible, cara y pantalón
intactos, y devolvió los 1280×1920 de la foto original en 123 KB. Ese mismo
resultado en PNG rondaba los 3 MB.

---

## Parte 3 — Dónde está la cabecera, que decidía si había que rehacer el medidor

`measureObject` mide un objeto de R2 pidiendo sus **primeros 32 bytes** y
leyendo la cabecera, sin descargarlo. Es lo que permite registrar ancho, alto y
peso de una generación sin mover un megabyte. Un WEBP tiene otra cabecera, así
que había que saber si esos 32 bytes seguían alcanzando.

Alcanzan. Los cuatro modelos devuelven WEBP simple con pérdida (`VP8 `), y sus
medidas están en el byte 26.

| Variante | Dónde dice el tamaño | Codificación |
|---|---|---|
| `VP8 ` con pérdida | byte 26 | 14 bits por lado, little-endian |
| `VP8L` sin pérdida | byte 21 | 28 bits empaquetados, **menos uno** |
| `VP8X` extendido | byte 24 | tres bytes por lado, **menos uno** |

`lib/pixel-size.ts` lee las tres más PNG, y se verificó contra **ocho archivos
reales** antes de conectarlo: los cuatro que devolvió Runware, los dos que
generó Pillow, y dos PNG bajados de R2. Todos con solo 32 bytes.

---

## Lo que NO se convierte, y por qué

**Lo que sube el usuario se guarda tal cual.** La foto de persona en JPG pesaba
91 KB y su WEBP a calidad 95 pesó **111 KB**: recomprimir algo que ya está
comprimido con pérdida no recupera nada y degrada un poco más. Las once subidas
que hay en el sistema suman 0.9 MB en total, contra 22 MB de un solo diseño
generado: no son el problema.

**Las máscaras siguen en PNG.** Las dibuja el navegador, son blanco y negro
puro, pesan 80 KB, y una compresión con pérdida sobre una máscara es una mala
idea porque los grises intermedios significan algo.

**El simulador sigue en PNG.** Arma la imagen byte a byte con un codificador
propio, y escribir uno de WEBP para un simulador no tiene sentido. Que los dos
formatos convivan resultó una ventaja: si el medidor se rompiera para PNG, el
simulador lo delataría sin gastar un centavo.

---

## Lo que esto obligó a cambiar en el código

**El formato lo declara el proveedor, no la ruta**, y esa pieza apareció al
mirar el código antes de romperlo. La ruta firma la URL de subida con un
`Content-Type` concreto y el que sube tiene que mandar exactamente ese; el
simulador entrega PNG y el real WEBP, así que una ruta con un tipo fijo habría
roto a uno de los dos. Ahora `GenerationProvider` tiene un campo `format` y las
cuatro rutas lo usan para la extensión de la clave, la firma, el `mime_type` de
la fila y el nombre de descarga.

El respaldo de `store.ts` subía con `image/png` fijo: con WEBP habría guardado
el objeto con una etiqueta que miente, y eso se descubre meses después en una
descarga con la extensión equivocada.

## Lo que pasa con lo ya guardado: nada

Verificado contra la base: `mime_type` está poblado en las 53 filas, con 44 PNG
y 9 JPEG, así que **el sistema ya convivía con dos formatos** sin que nadie lo
notara. Y la extensión de la clave de R2 **no se interpreta nunca al leer**: se
escribe al subir y de ahí en adelante la clave es un identificador opaco. Un
WEBP nuevo y un PNG viejo conviven sin tocarse.

No hay migración de datos, no hay que recodificar nada, y los diseños viejos
seguirán cargando como hoy mientras los nuevos pesan veintiséis veces menos.
