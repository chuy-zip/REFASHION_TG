# Herramientas de experimentación

Scripts, registros y resultados de las pruebas que se hicieron con los modelos generativos fuera de
la aplicación, y que sostienen figuras y cuadros del trabajo de graduación. Se conservan aquí como
constancia. **No forman parte de la aplicación**: nada en `app/`, `components/` ni `lib/` los
importa, y Next.js no los compila ni los despliega.

Los experimentos se corrieron en septiembre de 2026 contra Runware. Cada registro en `docs/` dice
qué se preguntó, qué se midió, cuántas llamadas se cobraron y a qué costo.

## Qué hay

| Carpeta o archivo | Contenido |
|---|---|
| `*.py` | Los scripts, descritos abajo |
| `docs/EXPERIMENTO_*.md` | El registro de cada experimento: pregunta, método, resultado y costo |
| `test_images/`, `shirts_vton/` | Fotografías y máscaras de entrada |
| `resultados2/`, `resultados3/`, `resultados_vton/`, `resultados_modelos/` | Resultados de las tandas |
| `agregar/`, `agregar2/`, `textura/` | Resultados del experimento 6 |
| `auditoria_mascaras/` | Máscaras, semillas y resultados reales de la aplicación, bajados de R2 |
| `webp/`, `formatos/` | Resultados del experimento 7 |

Los registros mencionan carpetas completas de resultados. Aquí solo están las imágenes que el
trabajo cita y las entradas que hacen falta para repetir esas corridas. No se incluyen los scripts
ni los resultados de pruebas que ninguna figura o cuadro del trabajo usa (el control positivo, el
campo negativo con FLUX dev, los diagnósticos de disponibilidad de modelos y el mantenimiento de
R2). `EXPERIMENTO_1.md` se conserva como registro del primer contacto con el modelo; sus imágenes no
se incluyen porque el trabajo no presenta ese experimento.

Las fotografías de personas proceden de fuentes de libre uso; `test_images/dark_polo_high_res.jpg`
es de Pexels. Las imágenes de prendas de `shirts_vton/` se usaron solo como entrada de prueba.

## Scripts y lo que sostienen

La numeración es la del PDF del trabajo de graduación de 129 páginas, versión del 1 de noviembre
de 2026.

| Script | Qué hace | Sostiene | Registro |
|---|---|---|---|
| `probar_cfg.py` | Pide el color a FLUX Fill con un prompt corto y con campo negativo | Fig. 23 | EXPERIMENTO_2 |
| `probar_fantasma.py` | Escalera de instrucciones para medir si nombrar una insignia la hace aparecer | Fig. 24 | EXPERIMENTO_3 |
| `probar_manga.py` | Cambia la manga con FLUX Fill, sin y con relleno de la tela de la semilla | Figs. 27, 28 y 34 | EXPERIMENTO_3 |
| `probar_kontext.py` | La misma edición con FLUX Kontext, sin máscara | Fig. 34 y Cuadro 18 | EXPERIMENTO_3 |
| `mascara_manga.py`, `mascara_por_color.py` | Generan las máscaras de entrada de los tres anteriores | Figs. 24, 27, 28 y 34 | EXPERIMENTO_3 |
| `probar_agregar.py` | Celdas de agregar elementos con FLUX Fill y con FLUX dev | Figs. 29 a 32 y Cuadro 17 | EXPERIMENTO_6 |
| `probar_textura.py` | Cuatro celdas sobre el cambio de tela con FLUX Fill | Cuadro 30 (cuatro de sus 24 llamadas de adición) | EXPERIMENTO_6 |
| `auditar_mascara.py` | Baja de R2 las máscaras, semillas y resultados reales para revisarlos | Figs. 29 a 32 | EXPERIMENTO_6 |
| `probar_vton_flux.py`, `probar_vton_pimage.py`, `vton_comun.py` | Misma persona y misma prenda en los dos modelos de prueba virtual | Fig. 18 y Cuadro 15 | EXPERIMENTO_4 |
| `probar_modelos.py` | Generación de personas: idioma del texto, pose y fondo | Figs. 38 y 39 | EXPERIMENTO_5 |
| `probar_webp.py` | Comprueba WEBP como formato de salida y de entrada | Cuadro 19 y sección 8.9 | EXPERIMENTO_7 |
| `metricas_generacion.py` | Resume desde la tabla `assets` el tiempo y el costo de las generaciones hechas en la aplicación. No es un experimento | Cuadros 20 y 31 | La tabla `assets` |
| `armar_figuras.py` | Compone las figuras `exp_*.png` del documento a partir de los resultados de esta carpeta | Las doce figuras de abajo | |
| `r2_vs_db.py`, `r2_url.py`, `probar_quitar.py`, `probar_inpaint.py` | Dependencias de los anteriores. `r2_vs_db.py` y `r2_url.py` leen las credenciales y firman URLs de R2; su uso propio como diagnóstico (comparar R2 contra la base) no forma parte del trabajo. `probar_quitar.py` y `probar_inpaint.py` aportan las funciones de inpainting que reutilizan | | EXPERIMENTO_1 a 3 |

## De qué resultados sale cada figura

Los resultados están en esta carpeta; `armar_figuras.py` regenera las figuras desde ellos.

| Figura | Script | Resultados que usa |
|---|---|---|
| Fig. 24 `exp_insignia_invocada.png` | `probar_fantasma.py` | `resultados3/20260917-191257-fantasma-A.png` y `-B.png`; original `test_images/dark_polo_high_res.jpg` |
| Fig. 23 `exp_color_negativo.png` | `probar_cfg.py`, casos E2 y E3 | `resultados2/20260916-233808-00-prenda-original.png`, `-00-mascara.png`, `-E2.png` y `-E3.png` |
| Fig. 27 `exp_manga_intento1.png` | `probar_manga.py`, sin `--rellenar-tela` | `resultados3/20260917-192106-manga-00-entrada.png`, `-00-mascara.png` y `-resultado.png` |
| Fig. 28 `exp_manga_intento2.png` | `probar_manga.py --rellenar-tela` | `resultados3/20260917-194104-manga-tela-00-semilla.png`, `-00-mascara.png` y `-resultado.png` |
| Fig. 29 `exp_color_pintado.png` | `probar_agregar.py`, celdas j y k | `agregar/entrada_semilla_bolsillo_gris.png`, `entrada_mascara_bolsillo.png`, `j_bolsillo_gris_sin_color.png` y `k_bolsillo_gris_con_color.png` |
| Fig. 30 `exp_contraste_pintado.png` | `probar_agregar.py --carpeta agregar2`, celdas l y m | `agregar2/entrada_mascara_bolsillo.png`, `entrada_semilla_bolsillo_35.png`, `_70.png`, `l_bolsillo_mas35.png` y `m_bolsillo_mas70.png` |
| Fig. 34 `exp_fill_vs_kontext.png` | `probar_manga.py --rellenar-tela` y `probar_kontext.py` | `resultados3/20260917-194104-manga-tela-resultado.png` y `20260917-194244-kontext-resultado.png` |
| Fig. 31 `exp_escalera_intensidad.png` | `probar_agregar.py`, celdas f, g y d | `agregar/f_rayas_dev_070.png`, `g_rayas_dev_085.png`, `d_rayas_dev.png` y `auditoria_mascaras/543e40ac/mascara.png` |
| Fig. 32 `exp_margen_mascara.png` | `probar_agregar.py --carpeta agregar2`, celdas p y q | `agregar2/p_bolsillo_dev_prompt.png`, `q_bolsillo_dev_ancha.png` y sus dos máscaras de entrada |
| Fig. 18 `exp_vton_dos_colores.png` | `probar_vton_flux.py` y `probar_vton_pimage.py` | `resultados_vton/20260919-194935-flux-alta-dos-colores.png` y `20260919-195226-pimage-alta-dos-colores.png`; entradas `shirts_vton/high_qual_test.jpg` y `low_qual_polo.jpg` |
| Fig. 38 `exp_idioma_pose.png` | `probar_modelos.py`, primera versión del texto, que se reescribió sobre el mismo archivo | `resultados_modelos/20260920-194216-es-lamina.png` |
| Fig. 39 `exp_idioma_fondo.png` | `probar_modelos.py`, texto con calzado | `resultados_modelos/20260920-194941-*` |

Hay además láminas armadas a mano, sin script: `resultados3/COMPARACION-*.png` y
`agregar/escalera_strength.png`.

## Requisitos

- Python 3.12 y las dependencias de `requirements.txt`: `pip install -r herramientas/requirements.txt`.
- Un `.env.local` en la raíz del repositorio, el mismo de la aplicación. Los scripts leen estas
  variables, sin imprimirlas: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `R2_ENDPOINT`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` y `RUNWARE_API_KEY`. El archivo está fuera del
  control de versiones.

## Cómo correrlos

Desde la raíz del repositorio:

```bash
python herramientas/probar_fantasma.py              # ensayo en seco, no gasta
python herramientas/probar_fantasma.py --confirmar  # llama a Runware y cobra
```

- **Sin `--confirmar`, según su código, ningún script llama a Runware ni cobra.** Con `--confirmar`
  cada llamada se factura; los costos que registró cada experimento están en su `docs/EXPERIMENTO_*.md`.
- `probar_cfg.py` y `probar_inpaint.py` guardan su salida en una carpeta relativa al directorio
  actual: córrelos desde dentro de `herramientas/`.
- Los scripts de prueba virtual usan `--camisas dos-colores`, que es la prenda del trabajo
  (`shirts_vton/low_qual_polo.jpg`). Sin ese argumento piden las cuatro prendas del banco original,
  y las otras tres no se incluyen.

Según su código, el ensayo en seco de estos scripts no lee credenciales, no usa la red y no escribe
nada: `probar_fantasma.py`, `probar_manga.py`, `probar_kontext.py`, `probar_vton_flux.py`,
`probar_vton_pimage.py` y `probar_modelos.py`. `mascara_manga.py` y `mascara_por_color.py` tampoco
usan servicios.

Piden `.env.local` aun en seco: `probar_cfg.py` (y además un `--design` real), `probar_agregar.py`,
`probar_textura.py` y `probar_webp.py`. `auditar_mascara.py`, `metricas_generacion.py`, `r2_vs_db.py`
y `r2_url.py` consultan la base de datos y R2 en todo caso, solo para leer. Los ensayos de
`probar_agregar.py` y `probar_textura.py` regeneran imágenes de entrada en `agregar/`, `agregar2/`
y `textura/`: revisa con `git diff` antes de confirmar cambios.

`probar_cfg.py`, `auditar_mascara.py` y las corridas que parten de una prenda del sistema necesitan
acceso a la base y a R2 del proyecto; sin él no se pueden repetir. Las entradas de las demás
corridas ya están en esta carpeta.

## Cambios respecto de los originales

Los archivos se copiaron tal como estaban, y solo se tocó esto:

- `r2_vs_db.py`: busca el `.env.local` en la raíz del repositorio, y su texto explicativo describe
  ese lugar. Es el único cambio de comportamiento.
- `probar_cfg.py` y `probar_inpaint.py`: el mensaje de la llave de Runware ya no nombra la carpeta
  `refashion_tg/`.
- `metricas_generacion.py` y `probar_vton_pimage.py`: se quitó la mención de documentos del
  proyecto que no están en este repositorio.
- `armar_figuras.py`: se agregó una nota inicial, se quitó la mención de documentos externos y `H`
  apunta a esta carpeta.
- `docs/EXPERIMENTO_1`, `_4` y `_7`: se quitaron cinco referencias a documentos de diseño que no
  están en este repositorio. Se conservó la explicación.

El resto es idéntico, byte a byte, a los archivos originales.
