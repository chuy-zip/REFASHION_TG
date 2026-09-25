-- 020 — La perilla que decide el resultado, y cuánto tardó.
--
-- PROBLEMA
-- La 018 guardó lo que hacía falta para repetir una generación de FLUX Fill:
-- semilla, modelo y pasos. Alcanzaba porque Fill no tiene más perillas.
--
-- El experimento 6 (25-sep) abrió un segundo camino: `runware:101@1` con
-- máscara, donde **`strength` es el parámetro dominante** y además lo va a
-- mover el usuario. Está medido sobre la misma prenda, la misma máscara y la
-- misma semilla numérica:
--
--     0.70  no alcanza, la prenda apenas cambia
--     0.85  cambia la tela y conserva persona, pose, luz y fondo
--     1.00  destruye la prenda: sin mangas, sin manos, la forma perdida
--
-- O sea que dos filas con idéntico prompt, semilla, modelo, pasos y máscara
-- pueden ser imágenes completamente distintas. **Hoy el esquema no puede
-- distinguirlas**, y eso es exactamente lo que la 018 vino a evitar.
--
-- DECISIÓN
--
-- `generation_strength` — numérico, no texto ni entero.
--
--   * `numeric(3,2)` porque el rango es 0.00 a 1.00 y dos decimales es la
--     resolución que la API acepta. Un `real` guardaría 0.8500000238 y la
--     tabla del informe mostraría eso.
--   * El check permite null: **Fill no usa este parámetro**, lo dice la
--     documentación oficial de Runware, y el código no se lo manda. Null ahí
--     significa "este modelo no tiene esta perilla", que es distinto de cero.
--     Un cero sería una afirmación falsa, el mismo error que la 018 corrigió
--     cuando `generation_steps: 0` violó su propio check y costó una
--     generación paga.
--
-- `generation_latency_ms` — y esto NO es reproducibilidad, es medición.
--
--   Se separa a propósito de las otras columnas: repetir una generación no
--   necesita saber cuánto tardó la anterior. Se guarda porque el informe cita
--   latencias y hoy salen de anotaciones sueltas de scripts. Con la columna,
--   la frase "entre 10 y 20 segundos" pasa a ser una consulta sobre lo que el
--   sistema vivió de verdad, con su mínimo, su máximo y su mediana, y por
--   modelo. El dato ya se mide en `lib/generation/runware.ts` y hasta hoy se
--   devolvía a la pantalla y se tiraba.
--
-- QUÉ NO SE AGREGA, Y POR QUÉ
--
--   * El prompt: ya está, en `generation_prompt`, desde la 001. Y se guarda el
--     texto exacto que se envió, no el fragmento que el usuario tecleó.
--   * El modo o la intención: se deduce de `generation_model`. Fill con
--     máscara es completar, dev con máscara y strength es dibujar, Kontext es
--     por instrucción y P-Image es prueba virtual. Una columna para un dato
--     derivable es una columna que algún día va a contradecir a su fuente.
--   * La imagen pintada antes de generar: **no hace falta columna**. El modo
--     "Pintar prenda" ya crea un asset propio, así que `parent_asset_id` de la
--     fila generada apunta a ella y el encadenado queda completo: prenda,
--     prenda pintada, resultado.
--   * El idioma del prompt: se lee del prompt.
--   * El tamaño pedido: `width_px` y `height_px` guardan el **medido** del
--     objeto real, que es un dato mejor que el que se pidió.
--
-- NO hace falta tocar `assets_type_check`: no hay tipos nuevos.

alter table public.assets
  add column if not exists generation_strength numeric(3, 2),
  add column if not exists generation_latency_ms integer;

-- Los checks se sueltan antes de ponerlos para que la migración se pueda
-- correr dos veces sin fallar: `add column` acepta `if not exists` y
-- `add constraint` no.
alter table public.assets
  drop constraint if exists assets_generation_strength_range,
  drop constraint if exists assets_generation_latency_positive;

alter table public.assets
  add constraint assets_generation_strength_range
    check (
      generation_strength is null
      or (generation_strength >= 0 and generation_strength <= 1)
    ),
  add constraint assets_generation_latency_positive
    check (generation_latency_ms is null or generation_latency_ms > 0);

comment on column public.assets.generation_strength is
  'Cuánto se le permite al modelo apartarse de lo que hay bajo la máscara. '
  'Medido sobre la misma prenda: 0.70 no alcanza, 0.85 cambia la tela y '
  'conserva la persona, 1.00 destruye la prenda. Null cuando el modelo no '
  'tiene esta perilla, que es el caso de FLUX Fill: null significa "no '
  'aplica", nunca cero.';

comment on column public.assets.generation_latency_ms is
  'Cuánto tardó la llamada, de punta a punta. NO sirve para reproducir una '
  'generación; se guarda porque el informe cita latencias y sin esto salen de '
  'anotaciones sueltas en vez de del sistema.';
