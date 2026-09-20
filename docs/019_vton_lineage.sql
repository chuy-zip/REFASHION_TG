-- 019 — Una prueba virtual dice de qué persona salió.
--
-- PROBLEMA
-- Un VTON tiene DOS insumos y el esquema solo sabe registrar uno. La prenda
-- queda en `parent_asset_id`, que es lo correcto: el resultado continúa ese
-- diseño. Pero la foto de persona no queda en ningún lado, y sin ella una
-- prueba virtual es una imagen que nadie puede rastrear hasta lo que la
-- produjo.
--
-- Eso rompe dos cosas a la vez. En el informe, la tabla de resultados del
-- Módulo 3 se arma justamente cruzando persona contra prenda, y sin la columna
-- hay que reconstruirla de memoria. En el producto, el cliente que pregunta
-- "¿esta es la foto de Marta o la de Luis?" no tiene respuesta salvo mirar.
--
-- DECISIÓN
-- `person_asset_id` en la fila GENERADA apunta a la foto de modelo que se usó.
--
--   * `on delete set null`: borrar una foto vieja del catálogo no debe borrar
--     las pruebas virtuales que se hicieron con ella. La foto es un insumo, el
--     resultado es el trabajo entregado.
--   * SIN `unique`, a diferencia de `mask_asset_id` de la 017. Una máscara
--     pertenece a una sola generación; una foto de modelo se reutiliza a
--     propósito, y en varios diseños distintos. Esa es toda la razón por la que
--     las fotos de modelo viven en el catálogo del cliente y no en un diseño.
--
-- NO se agrega un `check` que exija que la persona pertenezca al cliente del
-- diseño: eso se verifica en `lib/generation/inputs.ts`, por debajo del RLS,
-- porque una FK se verifica por debajo del RLS y la política mira la fila que
-- se escribe, no aquello a lo que apunta (APRENDIZAJES §2.5b). Novena vez que
-- se aplica la regla.
--
-- POR QUÉ ESTA 019 SÍ Y LA ANTERIOR NO
-- Hubo otra 019 propuesta y retirada (FASE_2_INPAINTING §4n): agregaba un
-- `asset_type` de `paint`, y el diagnóstico estaba mal, porque el esquema ya
-- distinguía determinista de generativo con `origin`. Esta es lo contrario: no
-- hay ninguna columna que hoy guarde este dato, ni forma de deducirlo.
--
-- NO hace falta tocar `assets_type_check`: `vton` y `ai_model` ya están en la
-- lista desde la 018.

alter table public.assets
  add column if not exists person_asset_id uuid
    references public.assets (id) on delete set null;

comment on column public.assets.person_asset_id is
  'La foto de persona que consumió una prueba virtual. La prenda va en '
  'parent_asset_id; esta es el otro insumo. Null en todo lo que no sea un '
  'vton. Sin unique: una foto de modelo se reutiliza a propósito, que es la '
  'razón por la que vive en el catálogo del cliente.';

-- Se consulta al armar la pantalla de productos finales y al reconstruir la
-- tabla de resultados del informe, siempre filtrando por la persona.
create index if not exists assets_person_asset_id_idx
  on public.assets (person_asset_id)
  where person_asset_id is not null;
