# -*- coding: utf-8 -*-
"""
Arma las figuras combinadas del documento a partir de las capturas de la aplicación.

Se conserva aquí como constancia de cómo se compusieron las figuras `exp_*.png` del trabajo de
graduación a partir de los resultados de esta carpeta (`tandas()`). Qué script y qué resultados
produjo cada figura está en el README de esta carpeta.

El resto de las figuras sale de capturas guardadas en `tesis/figuras/`, que pertenecen al
repositorio del documento y no están aquí. `TESIS` apunta a esa carpeta, y sin ella el script no
tiene dónde escribir sus salidas.

Las subimágenes llevan una letra, a), b)…, y no un subtítulo (corrección del 20/10/2026; ver
`letra()`). Los diagramas de flujo conservan sus rótulos.

Los recortes son coordenadas medidas sobre cada captura. Si se reemplaza una captura por
otra, hay que volver a medir su recuadro: el comentario de cada figura dice qué se recorta.
"""
import os
from PIL import Image, ImageDraw, ImageFont

TESIS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tesis")
FIG = os.path.normpath(os.path.join(TESIS, "figuras"))
F1 = os.path.join(FIG, "flujo1")
COMB = os.path.join(F1, "combinadas")


def fuente(px):
    for n in ("arialbd.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(n, px)
        except Exception:
            pass
    return ImageFont.load_default()


def abrir(ruta, recorte=None):
    im = Image.open(ruta).convert("RGB")
    return im.crop(recorte) if recorte else im


def letra(k):
    """Letra de la subimagen k (0 -> "a)"), en orden de lectura.

    Corrección del 20/10/2026: las figuras con varias subimágenes no llevan subtítulos dentro
    de la imagen, sino una letra en la esquina superior izquierda de cada una. Los subtítulos
    pasan al pie de la figura (`a) …; b) …`). En cada llamada, el texto que acompaña a cada
    panel es el subtítulo que va al pie, y queda aquí como registro.
    """
    return u"%s)" % "abcdefghijklmnopqrstuvwxyz"[k]


def fila(paneles, destino, alto=520, barra=34, sep=12, inicio=0, rotulo=True):
    """Paneles a la misma altura, uno al lado del otro, con su letra arriba.

    `inicio` es la letra del primer panel (para figuras armadas con varias filas);
    `rotulo=False` deja la imagen sin franja ni letra (figura de un solo panel).
    """
    barra = barra if rotulo else 0
    ims = [im.resize((int(im.width * alto / im.height), alto), Image.LANCZOS) for im, _ in paneles]
    ancho = sum(i.width for i in ims) + sep * (len(ims) - 1)
    lienzo = Image.new("RGB", (ancho, alto + barra), "white")
    d = ImageDraw.Draw(lienzo)
    f = fuente(22)
    x = 0
    for k, im in enumerate(ims):
        if rotulo:
            d.text((x + 4, 5), letra(inicio + k), fill="black", font=f)
        lienzo.paste(im, (x, barra))
        x += im.width + sep
    lienzo.save(destino, optimize=True)
    print(os.path.relpath(destino, FIG), lienzo.size)


def diagrama_ramas(comun, rot_comun, ramas, rotulos, destino, h=330, h_comun=260):
    """Diagrama de flujo: una imagen común a la izquierda y una rama por caso.

    `ramas` es una lista de (nombre de la rama o None, imagen 1, imagen 2). Cada rama lleva
    su nombre sobre la flecha, y una flecha entre sus dos imágenes. Los rótulos son parte del
    diagrama, así que se dibujan (no son subtítulos de subimagen).
    """
    barra, gap, flecha, rama = 30, 36, 70, 130
    esc = lambda im, hh: im.resize((int(im.width * hh / im.height), hh), Image.LANCZOS)
    c = esc(comun, h_comun)
    filas = [(n, esc(a, h), esc(b, h)) for n, a, b in ramas]
    alto = len(filas) * (barra + h) + (len(filas) - 1) * gap
    cy = alto // 2
    x1 = c.width + rama
    ancho = x1 + max(a.width + flecha + b.width for _, a, b in filas)
    lienzo = Image.new("RGB", (ancho, alto), "white")
    d = ImageDraw.Draw(lienzo)
    f, fm = fuente(22), fuente(20)

    def punta(x, y):
        d.polygon([(x, y), (x - 14, y - 8), (x - 14, y + 8)], fill="black")

    y_c = cy - c.height // 2 + barra // 2
    d.text((4, y_c - barra + 4), rot_comun, fill="black", font=f)
    lienzo.paste(c, (0, y_c))
    x0, xm = c.width + 8, c.width + 30
    d.line([(x0, cy), (xm, cy)], fill="black", width=3)
    for k, (nombre, a, b) in enumerate(filas):
        y_img = k * (barra + h + gap) + barra
        yc = y_img + h // 2
        d.line([(xm, cy), (xm, yc)], fill="black", width=3)
        d.line([(xm, yc), (x1 - 8, yc)], fill="black", width=3)
        punta(x1 - 8, yc)
        if nombre:
            d.text((xm + 10, yc - 30), nombre, fill="black", font=fm)
        d.text((x1 + 4, y_img - barra + 4), rotulos[0], fill="black", font=f)
        lienzo.paste(a, (x1, y_img))
        x2 = x1 + a.width + flecha
        d.line([(x1 + a.width + 8, yc), (x2 - 8, yc)], fill="black", width=3)
        punta(x2 - 8, yc)
        d.text((x2 + 4, y_img - barra + 4), rotulos[1], fill="black", font=f)
        lienzo.paste(b, (x2, y_img))
    lienzo.save(destino, optimize=True)
    print(os.path.relpath(destino, FIG), lienzo.size)


# --- 8.1  Recorte del fondo de un emblema ---------------------------------------------
# Antes y después arriba; abajo la captura completa del ajuste, con la vista previa.
def recorte_emblema():
    antes = abrir(os.path.join(FIG, "emblema_antes.png"))
    durante = abrir(os.path.join(FIG, "emblema_durante.png"))
    despues = abrir(os.path.join(FIG, "emblema_despues.png"))
    alto, sep, barra = 560, 16, 34
    a = antes.resize((int(antes.width * alto / antes.height), alto), Image.LANCZOS)
    c = despues.resize((int(despues.width * alto / despues.height), alto), Image.LANCZOS)
    ancho = a.width + sep + c.width
    b = durante.resize((ancho, int(durante.height * ancho / durante.width)), Image.LANCZOS)
    lienzo = Image.new("RGB", (ancho, barra + alto + sep + barra + b.height), "white")
    d = ImageDraw.Draw(lienzo)
    f = fuente(24)
    d.text((6, 5), letra(0), fill="black", font=f)                    # Antes
    d.text((a.width + sep + 6, 5), letra(1), fill="black", font=f)    # Después
    lienzo.paste(a, (0, barra))
    lienzo.paste(c, (a.width + sep, barra))
    y = barra + alto + sep
    d.text((6, y + 5), letra(2), fill="black", font=f)                # Durante el ajuste
    lienzo.paste(b, (0, y + barra))
    destino = os.path.join(FIG, "resultado_recorte_emblema.png")
    lienzo.save(destino, optimize=True)
    print(os.path.relpath(destino, FIG), lienzo.size)


# --- 8.2  Recoloreado determinista, antes y después -----------------------------------
# La prenda base, recortada a su lienzo blanco, al mismo tamaño y altura que el lienzo
# blanco dentro de la captura del recoloreado. Medido: base (6,10)-(426,531); lienzo de
# la captura (154,101)-(534,572), en la versión del 30/09 con el código correcto.
def recoloreado():
    base = abrir(os.path.join(F1, "low_res", "original_sin_pintado_determinista.png"), (6, 10, 426, 531))
    cap = abrir(os.path.join(FIG, "cambiar_color_completo_determinista.png"))
    # La captura trae 5 px de borde negro a la izquierda, del recorte; el lienzo medido
    # arriba queda entonces en x 149-529 dentro de la captura recortada.
    cap = cap.crop((5, 0, cap.width, cap.height))
    barra, sep, margen = 34, 16, 30
    base = base.resize((380, 471), Image.LANCZOS)
    lienzo = Image.new("RGB", (margen * 2 + base.width + sep + cap.width, cap.height + barra), "white")
    d = ImageDraw.Draw(lienzo)
    f = fuente(24)
    x_cap = margen * 2 + base.width + sep
    d.text((4, 5), letra(0), fill="black", font=f)          # Antes
    d.text((x_cap + 4, 5), letra(1), fill="black", font=f)  # Después
    lienzo.paste(base, (margen, barra + 101))
    lienzo.paste(cap, (x_cap, barra))
    destino = os.path.join(FIG, "recoloreado_antes_despues.png")
    lienzo.save(destino, optimize=True)
    print(os.path.relpath(destino, FIG), lienzo.size)


# --- 7.6.2  Opciones del modo de edición por zonas ------------------------------------
# El panel derecho de cada opción, tomado de las capturas del flujo 1.
def opciones_zonas():
    a = abrir(os.path.join(F1, "high_res", "pintar_determinista_mask_high.png"), (578, 225, 966, 705))
    b = abrir(os.path.join(F1, "high_res", "adding_something_mask.png"), (580, 135, 957, 610))
    f = fuente(20)
    h, sep, barra = max(a.height, b.height), 40, 34
    lienzo = Image.new("RGB", (a.width + sep + b.width, h + barra), "white")
    d = ImageDraw.Draw(lienzo)
    d.text((4, 5), letra(0), fill="black", font=f)                  # Completar la zona
    d.text((a.width + sep + 4, 5), letra(1), fill="black", font=f)  # Dibujar algo nuevo
    lienzo.paste(a, (0, barra))
    lienzo.paste(b, (a.width + sep, barra))
    d.line([(a.width + sep // 2, barra), (a.width + sep // 2, h + barra)], fill=(200, 200, 200), width=2)
    destino = os.path.join(FIG, "opciones_edicion_por_zona.png")
    lienzo.save(destino, optimize=True)
    print(os.path.relpath(destino, FIG), lienzo.size)


def sin_marco(im, tolerancia=6, borde=3):
    """Quita las filas y columnas de borde que son fondo de la interfaz (gris o blanco).

    Antes descarta `borde` píxeles por lado: el contorno redondeado de los recuadros de la
    interfaz es más oscuro que el fondo y, si se queda, impide reconocer la franja gris.
    """
    import numpy as np
    im = im.crop((borde, borde, im.width - borde, im.height - borde))
    a = np.asarray(im).astype(int)
    fondos = [np.array(c) for c in ((250, 250, 251), (241, 242, 244), (255, 255, 255))]

    def es_fondo(linea):
        return any((np.abs(linea - f).sum(-1) <= tolerancia).mean() > 0.97 for f in fondos)

    t, b, l, r = 0, a.shape[0], 0, a.shape[1]
    while t < b - 1 and es_fondo(a[t, l:r]): t += 1
    while b - 1 > t and es_fondo(a[b - 1, l:r]): b -= 1
    while l < r - 1 and es_fondo(a[t:b, l]): l += 1
    while r - 1 > l and es_fondo(a[t:b, r - 1]): r -= 1
    return im.crop((l, t, r, b))


# --- 8.6  Prueba virtual desde la aplicación ------------------------------------------
# Cada par de capturas: la primera trae prenda y persona lado a lado en la pantalla de
# presentación; la segunda, el resultado. Los recuadros de la primera están medidos.
def vton_app():
    vt = lambda n: abrir(os.path.join(FIG, "vton", n))
    filas = []
    for entrada, resultado, cajas in (
        ("final_polo_plus_modelo_vton1.png", "final_polo_plus_modelo_vton2.png",
         ((16, 18, 316, 418), (388, 18, 653, 418))),
        ("final_polo_plus_modelo_vton3.png", "final_polo_plus_modelo_vton4.png",
         ((19, 19, 319, 419), (391, 19, 656, 419))),
    ):
        e = vt(entrada)
        r = vt(resultado)
        # La primera captura de resultado trae una franja gris de 6 px arriba.
        r = r.crop((0, 6, r.width, r.height)) if resultado.endswith("vton2.png") else r
        filas.append([sin_marco(e.crop(cajas[0])), sin_marco(e.crop(cajas[1])), sin_marco(r)])

    # Diagrama de flujo (pedido del autor, 20/10/2026, igual que fig:vton): la prenda, que es
    # la misma en las dos pruebas, aparece una sola vez a la izquierda. De ella salen dos
    # flechas, una por prueba, cada una a su persona y, de la persona, a su resultado. Los
    # rótulos son parte del diagrama, así que se conservan; las flechas no llevan nombre
    # porque las dos pruebas usan el mismo modelo.
    h, barra, gap, flecha, rama = 330, 30, 36, 70, 110
    esc = lambda im, hh: im.resize((int(im.width * hh / im.height), hh), Image.LANCZOS)
    prenda = esc(filas[0][0], 260)
    pruebas = [(esc(f_[1], h), esc(f_[2], h)) for f_ in filas]
    alto = 2 * (barra + h) + gap
    cy = alto // 2
    x_per = prenda.width + rama
    ancho = x_per + max(p.width + flecha + r.width for p, r in pruebas)
    lienzo = Image.new("RGB", (ancho, alto), "white")
    d = ImageDraw.Draw(lienzo)
    f = fuente(22)

    def punta(x, y):
        d.polygon([(x, y), (x - 14, y - 8), (x - 14, y + 8)], fill="black")

    y_pre = cy - prenda.height // 2 + barra // 2
    d.text((4, y_pre - barra + 4), u"Prenda", fill="black", font=f)
    lienzo.paste(prenda, (0, y_pre))
    x0, xm = prenda.width + 8, prenda.width + rama // 2
    d.line([(x0, cy), (xm, cy)], fill="black", width=3)
    for k, (per, res) in enumerate(pruebas):
        y_img = k * (barra + h + gap) + barra
        yc = y_img + h // 2
        d.line([(xm, cy), (xm, yc)], fill="black", width=3)
        d.line([(xm, yc), (x_per - 8, yc)], fill="black", width=3)
        punta(x_per - 8, yc)
        d.text((x_per + 4, y_img - barra + 4), u"Persona", fill="black", font=f)
        lienzo.paste(per, (x_per, y_img))
        x_res = x_per + per.width + flecha
        d.line([(x_per + per.width + 8, yc), (x_res - 8, yc)], fill="black", width=3)
        punta(x_res - 8, yc)
        d.text((x_res + 4, y_img - barra + 4), u"Resultado", fill="black", font=f)
        lienzo.paste(res, (x_res, y_img))
    destino = os.path.join(FIG, "vton", "combinadas", "vton_fotografias.png")
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    lienzo.save(destino, optimize=True)
    print(os.path.relpath(destino, FIG), lienzo.size)

    # El modelo generado, con la composición.
    e = vt("final_polo_plus_modeloIA_vton1.png")
    fila([(sin_marco(e.crop((5, 9, 305, 409))), u"Composición"),
          (sin_marco(e.crop((373, 9, 646, 409))), u"Persona generada"),
          (sin_marco(vt("final_polo_plus_modeloIA_vton2.png")), u"Resultado")],
         os.path.join(FIG, "vton", "combinadas", "vton_generado.png"), alto=420)

    # Las tres presentaciones de un mismo diseño.
    fila([(sin_marco(e.crop((5, 9, 305, 409))), u"Prenda plana"),
          (sin_marco(vt("final_polo_plus_modelo_vton4.png")), u"Sobre modelo fotografiado"),
          (sin_marco(vt("final_polo_plus_modeloIA_vton2.png")), u"Sobre modelo generado")],
         os.path.join(FIG, "vton", "combinadas", "tres_presentaciones.png"), alto=420)

    # Las dos personas generadas con la misma instrucción, tal como las entregó el modelo (29/10/2026,
    # pedido de la autora): sin la prenda del diseño. La versión anterior las mostraba ya vestidas, y una
    # llevaba el emblema y la otra no, lo que sugería que la generación afectaba la prenda. Las fotos son
    # las originales de la generación (persona_generada_*.png). Orden: la primera generación es la de
    # pantalón de jean (10:22 p. m.) y la segunda la de pantalón de pinzas (10:32 p. m.).
    fila([(vt("persona_generada_primera.png"), u"Primera generación"),
          (vt("persona_generada_segunda.png"), u"Segunda generación")],
         os.path.join(FIG, "vton", "combinadas", "misma_instruccion.png"), alto=420)


# --- 7.6.1  Los dos pinceles del modo de pintado --------------------------------------
# Una sola captura del lienzo con dos prendas: la de la izquierda pintada con el pincel de
# tela y la de la derecha con el pincel plano, mismo color. Se parte el lienzo en dos.
def pinceles():
    cap = abrir(os.path.join(FIG, "pintar_comparacion.png"))
    x0, y0, x1, y1, medio = 78, 124, 646, 501, 366
    # Arriba las dos prendas; abajo la franja pintada de cada una, ampliada, que es donde se
    # ve que el pincel de tela conserva la sombra y el plano no. Recuadros medidos.
    arriba = [cap.crop((x0, y0, medio, y1)), cap.crop((medio, y0, x1, y1))]
    abajo = [cap.crop((225, 195, 335, 400)), cap.crop((490, 195, 600, 400))]
    alto_a, alto_b, barra, sep = 420, 560, 34, 16
    esc = lambda im, h: im.resize((int(im.width * h / im.height), h), Image.LANCZOS)
    arriba = [esc(i, alto_a) for i in arriba]
    abajo = [esc(i, alto_b) for i in abajo]
    col = [max(a.width, b.width) for a, b in zip(arriba, abajo)]
    lienzo = Image.new("RGB", (sum(col) + sep, barra + alto_a + sep + barra + alto_b), "white")
    d = ImageDraw.Draw(lienzo)
    f = fuente(22)
    x = 0
    # Orden de lectura: a) Pincel de tela; b) Pincel plano (arriba);
    # c) Pincel de tela, ampliado; d) Pincel plano, ampliado (abajo).
    for k, (a, b) in enumerate(zip(arriba, abajo)):
        d.text((x + 4, 5), letra(k), fill="black", font=f)
        lienzo.paste(a, (x + (col[k] - a.width) // 2, barra))
        y = barra + alto_a + sep
        d.text((x + 4, y + 5), letra(k + 2), fill="black", font=f)
        lienzo.paste(b, (x + (col[k] - b.width) // 2, y + barra))
        x += col[k] + sep
    destino = os.path.join(FIG, "pinceles_comparacion.png")
    lienzo.save(destino, optimize=True)
    print(os.path.relpath(destino, FIG), lienzo.size)


# --- 7.7  Elección de un modelo del catálogo ------------------------------------------
# El modal y el modelo ya elegido, uno debajo del otro: lado a lado el texto de la
# interfaz quedaba ilegible al ancho de la página.
def vton_catalogo():
    vt = lambda n: abrir(os.path.join(FIG, "vton", n))
    a, b = vt("elegir_modelo_guardado2.png"), vt("elegir_modelo_guardado3.png")
    ancho, barra, sep = max(a.width, b.width), 34, 16
    f = fuente(22)
    lienzo = Image.new("RGB", (ancho, barra + a.height + sep + barra + b.height), "white")
    d = ImageDraw.Draw(lienzo)
    d.text((4, 5), letra(0), fill="black", font=f)       # Elección del modelo
    lienzo.paste(a, (0, barra))
    y = barra + a.height + sep
    d.text((4, y + 5), letra(1), fill="black", font=f)   # Modelo elegido
    lienzo.paste(b, (0, y + barra))
    destino = os.path.join(FIG, "vton", "vton_catalogo.png")
    lienzo.save(destino, optimize=True)
    print(os.path.relpath(destino, FIG), lienzo.size)


# --- 8.3, 8.4.2 y 8.10  Flujo 1 -------------------------------------------------------
# Solo el lienzo de cada paso, sin la interfaz.
def flujo1():
    hr = lambda n: os.path.join(F1, "high_res", n)
    lr = lambda n: os.path.join(F1, "low_res", n)

    fila([(abrir(hr("pintar_determinista_antes.png"), (28, 12, 475, 461)), u"Original"),
          (abrir(hr("pintar_determinista_high.png"), (126, 29, 665, 568)), u"Pintado plano"),
          (abrir(hr("pintar_determinista_mask_high.png"), (94, 165, 544, 614)), u"Máscara"),
          (abrir(hr("pintar_determinista_high2.png"), (11, 11, 457, 461)), u"Resultado")],
         os.path.join(COMB, "limpieza_alta_resolucion.png"))

    fila([(abrir(hr("adding_something_mask.png"), (96, 63, 546, 513)), u"Máscara"),
          (abrir(hr("adding_something_mask_result.png"), (10, 9, 584, 583)), u"Resultado")],
         os.path.join(COMB, "adicion_bolsillo.png"))

    fila([(abrir(lr("original_con_logo_low.png")), u"Original"),
          (abrir(lr("pintar_determinista_low.png"), (168, 126, 591, 649)), u"Pintado plano"),
          (abrir(lr("seleccionar_pintado_determinista_low.png"), (108, 38, 530, 552)), u"Máscara"),
          (abrir(lr("seleccionar_pintado_determinista_low2.png"), (16, 24, 334, 417)), u"Resultado")],
         os.path.join(COMB, "limpieza_baja_resolucion.png"))

    # 8.5  Edición por instrucción sobre el polo con bolsillo. Solo el lienzo: los controles
    # del modo ya están en la figura de metodología. La de antes trae marco gris, medido.
    fila([(abrir(hr("edicion_instruccion_antes.png"), (7, 5, 536, 534)), u"Antes"),
          (abrir(hr("edicion_instruccion_despues.png")), u"Después")],
         os.path.join(COMB, "edicion_instruccion.png"))

    t = abrir(hr("adding_something_result_with_timeline.png"), (0, 365, 855, 642))
    destino = os.path.join(COMB, "linea_de_tiempo.png")
    t.save(destino, optimize=True)
    print(os.path.relpath(destino, FIG), t.size)


# --- Capítulo 8  Figuras de las tandas experimentales -------------------------------
# Salen de las láminas y resultados que dejaron los scripts de esta carpeta.
# Las láminas traen etiquetas de trabajo ("A prompt completo", "MASCARA", slugs de archivo)
# que no significan nada en el documento: se recorta cada panel por debajo de su franja de
# etiquetas (22 px) y se rotula de nuevo. Qué script produjo cada fuente: README de esta carpeta.
H = os.path.dirname(os.path.abspath(__file__))


def paneles(ruta, n, indices, ancho=None, franja=22):
    """Paneles de una lámina de n columnas, sin su franja de etiquetas."""
    im = abrir(os.path.join(H, ruta))
    w = ancho or im.width // n
    paso = im.width // n
    return [im.crop((i * paso, franja, i * paso + w, im.height)) for i in indices]


def tandas():
    # 8.3  Lámina de probar_fantasma.py, armada a mano: ORIGINAL | A | B | C, ampliada al
    # pecho. Van los tres primeros; C probaba la forma de la máscara y salió del capítulo.
    # A es la instrucción que enumera lo excluido y B la que describe solo la tela.
    o, a, b = paneles("resultados3/COMPARACION-escalera-fantasma.png", 4, [0, 1, 2], ancho=260)
    fila([(o, u"Original"), (a, u"Enumera lo excluido"), (b, u"Describe solo la tela")],
         os.path.join(FIG, "exp_insignia_invocada.png"), alto=420)

    # 8.2  probar_cfg.py, casos E2 y E3 (FLUX Fill, misma semilla e instrucción PROMPT_CORTO;
    # E3 agrega PROMPT_NEGATIVO). Los dos PNG son idénticos byte por byte (mismo SHA-256).
    r2 = lambda n: abrir(os.path.join(H, "resultados2", "20260916-233808-" + n))
    # Dos filas de dos: en una sola fila cada panel queda demasiado chico en la página.
    tmp = [os.path.join(FIG, "_neg%d.png" % k) for k in (1, 2)]
    fila([(r2("00-prenda-original.png"), u"Original"), (r2("00-mascara.png"), u"Máscara")],
         tmp[0], alto=360)
    fila([(r2("E2.png"), u"Sin campo negativo"), (r2("E3.png"), u"Con campo negativo")],
         tmp[1], alto=360, inicio=2)
    a1, a2 = Image.open(tmp[0]), Image.open(tmp[1])
    a1.load(); a2.load()
    lienzo = Image.new("RGB", (max(a1.width, a2.width), a1.height + 12 + a2.height), "white")
    lienzo.paste(a1, (0, 0))
    lienzo.paste(a2, (0, a1.height + 12))
    lienzo.save(os.path.join(FIG, "exp_color_negativo.png"), optimize=True)
    for t in tmp:
        os.remove(t)

    # 8.4.1  probar_manga.py, una figura por intento (corrección de GAB, 18/10/2026). Las
    # dos corridas tienen la misma entrada y la misma máscara (comprobado píxel a píxel);
    # el segundo intento además pinta los antebrazos con el color de la prenda (--rellenar-tela).
    r3 = lambda n: abrir(os.path.join(H, "resultados3", n))
    fila([(r3("20260917-192106-manga-00-entrada.png"), u"Original"),
          (r3("20260917-192106-manga-00-mascara.png"), u"Máscara"),
          (r3("20260917-192106-manga-resultado.png"), u"Resultado")],
         os.path.join(FIG, "exp_manga_intento1.png"))
    fila([(r3("20260917-194104-manga-tela-00-semilla.png"), u"Región pintada"),
          (r3("20260917-194104-manga-tela-00-mascara.png"), u"Máscara"),
          (r3("20260917-194104-manga-tela-resultado.png"), u"Resultado")],
         os.path.join(FIG, "exp_manga_intento2.png"))

    # 8.4.1  probar_agregar.py con FLUX Fill, recortado al pecho y sin tocar el brillo (los
    # zoom_* de la prueba sí lo aumentan). La máscara del bolsillo es la misma en agregar/ y
    # agregar2/ (comprobado) y ocupa x 505-631, y 785-930 de 896 x 1344.
    pecho = (358, 648, 778, 1068)
    ag1 = lambda n: abrir(os.path.join(H, "agregar", n), pecho)
    ag2 = lambda n: abrir(os.path.join(H, "agregar2", n), pecho)
    # Celdas j y k: misma región pintada de gris, misma máscara y semilla; la instrucción
    # nombra o no el color (BOLSILLO_SIN_COLOR / BOLSILLO_CON_COLOR).
    fila([(ag1("entrada_semilla_bolsillo_gris.png"), u"Región pintada"),
          (ag1("entrada_mascara_bolsillo.png"), u"Máscara"),
          (ag1("j_bolsillo_gris_sin_color.png"), u"Sin nombrar el color"),
          (ag1("k_bolsillo_gris_con_color.png"), u"Nombrando el negro")],
         os.path.join(FIG, "exp_color_pintado.png"), alto=420)
    # Celdas l y m: misma instrucción (BOLSILLO_SIN_COLOR), máscara y semilla; cambia solo
    # la luz de lo pintado. La celda b (sin contraste) no va: usó otra instrucción.
    # Diagrama de flujo (pedido del autor, 20/10/2026): la máscara, que es la misma en los dos
    # casos, una sola vez; una rama por caso con la variable (+35 o +70) sobre la flecha, y en
    # cada rama la región pintada y su resultado. Los rótulos son parte del diagrama.
    diagrama_ramas(ag2("entrada_mascara_bolsillo.png"), u"Máscara",
                   [(u"+35", ag2("entrada_semilla_bolsillo_35.png"), ag2("l_bolsillo_mas35.png")),
                    (u"+70", ag2("entrada_semilla_bolsillo_70.png"), ag2("m_bolsillo_mas70.png"))],
                   (u"Región pintada", u"Resultado"),
                   os.path.join(FIG, "exp_contraste_pintado.png"), h=300, h_comun=260)

    # 8.5  Los dos últimos paneles de la lámina de probar_manga.py / probar_kontext.py.
    lam = paneles("resultados3/COMPARACION-manga-y-kontext.png", 5, [0, 1, 2, 3, 4])

    fila([(lam[3], u"FLUX Fill"), (lam[4], u"FLUX Kontext")],
         os.path.join(FIG, "exp_fill_vs_kontext.png"))

    # 8.4.2  Escalera de intensidad de probar_agregar.py, con la máscara del caso.
    esc = abrir(os.path.join(H, "agregar", "escalera_strength.png"))
    w = esc.width // 4
    e = [esc.crop((i * w, 0, (i + 1) * w, esc.height)) for i in range(4)]
    m = abrir(os.path.join(H, "auditoria_mascaras", "543e40ac", "mascara.png"))
    fila([(e[0], u"Prenda original"), (m, u"Máscara"), (e[1], u"Intensidad 0.70"),
          (e[2], u"Intensidad 0.85"), (e[3], u"Intensidad 1.00")],
         os.path.join(FIG, "exp_escalera_intensidad.png"))

    # 8.4.2  Margen de la máscara, celdas p y q de agregar2.
    ag = lambda n: abrir(os.path.join(H, "agregar2", n))
    fila([(ag("entrada_mascara_bolsillo.png"), u"Máscara ajustada"),
          (ag("p_bolsillo_dev_prompt.png"), u"Resultado"),
          (ag("entrada_mascara_bolsillo_ancha.png"), u"Máscara con margen"),
          (ag("q_bolsillo_dev_ancha.png"), u"Resultado")],
         os.path.join(FIG, "exp_margen_mascara.png"), alto=430)

    # 7.7  La comparación de prueba virtual, de vton_comun.py, como diagrama (corrección verbal
    # de GAB: la lámina anterior ocupaba demasiado). Persona -> prenda -> dos flechas, una por
    # modelo, cada una a su resultado con el pecho ampliado al lado.
    persona = abrir(os.path.join(H, "shirts_vton", "high_qual_test.jpg"))
    prenda = abrir(os.path.join(H, "shirts_vton", "low_qual_polo.jpg"))
    res = [abrir(os.path.join(H, "resultados_vton", n)) for n in
           ("20260919-194935-flux-alta-dos-colores.png", "20260919-195226-pimage-alta-dos-colores.png")]
    pecho = lambda im: im.crop((int(im.width * 0.30), int(im.height * 0.34),
                                int(im.width * 0.72), int(im.height * 0.56)))
    esc = lambda im, h: im.resize((int(im.width * h / im.height), h), Image.LANCZOS)
    h_res, barra, sep, gap = 300, 30, 10, 36
    f, fm = fuente(22), fuente(20)
    per, pre = esc(persona, 360), esc(prenda, 200)
    filas = [(esc(r, h_res), esc(pecho(r), h_res), et) for r, et in
             zip(res, (u"FLUX VTO", u"P-Image Try-On"))]
    flecha = 90       # largo de las flechas horizontales
    rama = 250        # ancho del tramo que se abre en dos, con el nombre del modelo
    alto = 2 * (barra + h_res) + gap
    x_pre = per.width + flecha
    x_res = x_pre + pre.width + rama
    ancho = x_res + max(r.width + sep + z.width for r, z, _ in filas)
    lienzo = Image.new("RGB", (ancho, alto), "white")
    d = ImageDraw.Draw(lienzo)
    cy = alto // 2

    def punta(x, y):
        d.polygon([(x, y), (x - 14, y - 8), (x - 14, y + 8)], fill="black")

    # Persona y prenda, centradas en la altura total, con su etiqueta encima.
    y_per = cy - per.height // 2 + barra // 2
    d.text((4, y_per - barra + 4), u"Persona", fill="black", font=f)
    lienzo.paste(per, (0, y_per))
    d.line([(per.width + 8, cy), (x_pre - 8, cy)], fill="black", width=3)
    punta(x_pre - 8, cy)
    y_pre = cy - pre.height // 2 + barra // 2
    d.text((x_pre + 4, y_pre - barra + 4), u"Prenda", fill="black", font=f)
    lienzo.paste(pre, (x_pre, y_pre))
    # Las dos ramas, cada una con el nombre del modelo sobre la flecha.
    x0, xm = x_pre + pre.width + 8, x_pre + pre.width + 40
    d.line([(x0, cy), (xm, cy)], fill="black", width=3)
    for k, (r, z, et) in enumerate(filas):
        y_img = k * (barra + h_res + gap) + barra
        yc = y_img + h_res // 2
        d.line([(xm, cy), (xm, yc)], fill="black", width=3)
        d.line([(xm, yc), (x_res - 8, yc)], fill="black", width=3)
        punta(x_res - 8, yc)
        d.text((xm + 10, yc - 30), et, fill="black", font=fm)
        d.text((x_res + 4, y_img - barra + 4), u"Resultado", fill="black", font=f)
        lienzo.paste(r, (x_res, y_img))
        d.text((x_res + r.width + sep + 4, y_img - barra + 4), u"Pecho ampliado", fill="black", font=f)
        lienzo.paste(z, (x_res + r.width + sep, y_img))
    destino = os.path.join(FIG, "exp_vton_dos_colores.png")
    lienzo.save(destino, optimize=True)
    print(os.path.relpath(destino, FIG), lienzo.size)

    # 8.7  probar_modelos.py. La primera corrida en español, y la comparación pareada.
    fila([(abrir(os.path.join(H, "resultados_modelos", "20260920-194216-es-lamina.png")),
           u"Primera corrida, instrucción en español")],
         os.path.join(FIG, "exp_idioma_pose.png"), alto=544, rotulo=False)
    par = abrir(os.path.join(H, "resultados_modelos", "20260920-194941-ambos-lamina.png"))
    xs = [12, 380, 748, 1116]
    fila([(par.crop((x, 12, x + 356, 532)), et) for x, et in
          zip(xs, (u"Hombre, español", u"Hombre, inglés", u"Mujer, español", u"Mujer, inglés"))],
         os.path.join(FIG, "exp_idioma_fondo.png"))


# --- 8.12  Control de acceso por rol (29/10/2026) --------------------------------------
# Tres capturas de la cuenta de solo lectura, una debajo de otra para que el texto de la
# interfaz se lea al ancho de la página. Subtítulos que van al pie (nombres de las pantallas,
# como en el cuadro de direcciones del anexo): a) Lista de clientes; b) Edición de un diseño;
# c) Presentación de un diseño. La captura de clientes se tomó con DevTools abierto: se usa
# solo la parte izquierda, sin el panel.
def control_acceso():
    a = abrir(os.path.join(FIG, "captura_acceso_clientes.png"), (0, 0, 1257, 190))
    b = abrir(os.path.join(FIG, "captura_acceso_edicion.png"))
    # Sin el título y las migas de pan (primeros 100 px): no aportan y la figura es muy alta.
    c = abrir(os.path.join(FIG, "captura_acceso_presentacion.png"), (0, 100, 886, 722))
    ancho, barra, sep = 900, 34, 14
    esc = lambda im: im.resize((ancho, int(im.height * ancho / im.width)), Image.LANCZOS)
    paneles = [esc(a), esc(b), esc(c)]
    alto = sum(p.height for p in paneles) + len(paneles) * barra + sep * (len(paneles) - 1)
    lienzo = Image.new("RGB", (ancho, alto), "white")
    d = ImageDraw.Draw(lienzo)
    f = fuente(22)
    y = 0
    for k, p in enumerate(paneles):
        d.text((4, y + 5), letra(k), fill="black", font=f)
        lienzo.paste(p, (0, y + barra))
        y += p.height + barra + sep
    destino = os.path.join(FIG, "control_acceso.png")
    lienzo.save(destino, optimize=True)
    print(os.path.relpath(destino, FIG), lienzo.size)


if __name__ == "__main__":
    recorte_emblema()
    recoloreado()
    opciones_zonas()
    pinceles()
    vton_catalogo()
    vton_app()
    flujo1()
    tandas()
    control_acceso()
