-- 018 — Lo que hace falta para que una generación real sea reproducible.
--
-- PROBLEMA
-- La tabla ya guarda qué costó (`cost_usd`), qué se pidió (`generation_prompt`),
-- con qué máscara (`mask_asset_id`, 017) y de qué imagen salió
-- (`parent_asset_id`). Con eso NO alcanza para volver a producir el mismo
-- resultado, y faltan las dos cosas que lo impiden:
--
--   1. La SEMILLA. La difusión arranca de ruido, y de cuál arranca lo decide la
--      semilla. Dos peticiones idénticas con semillas distintas devuelven cosas
--      distintas. Esto se aprendió gastando: la primera tanda de experimentos
--      corrió sin fijarla y hubo que retractar conclusiones, porque parte de
--      cada diferencia atribuida a un parámetro era ruido de arranque.
--   2. El MODELO. Hasta ahora había uno solo, así que no hacía falta decirlo.
--      Ya no: las pruebas dejaron dos oficios en manos de dos modelos distintos
--      —FLUX.1 Fill para limpiar y agregar sobre máscara, FLUX.1 Kontext para
--      cambios estructurales grandes— y una fila que no dice cuál la produjo no
--      se puede comparar contra otra ni defender en el informe.
--
-- Y hay una tercera que es barata y evita otra migración: los PASOS. Hoy son
-- una constante del código, pero una constante que cambie deja sin explicación
-- a las filas viejas.
--
-- POR QUÉ LAS TRES JUNTAS Y NO UNA POR UNA
-- Son la misma pregunta —"¿cómo reproduzco esta fila?"— y ninguna de las tres
-- sirve sin las otras dos. Partirlas en tres migraciones sería tres veces el
-- ceremonial para un solo cambio conceptual.
--
-- SE AGREGA TAMBIÉN UN TIPO DE RECURSO: 'edit'
-- `asset_type` distingue por técnica ('inpainting', 'vton'), y una edición por
-- instrucción no es inpainting: no lleva máscara, el modelo decide qué toca.
-- Llamarla 'inpainting' sería guardar un dato falso en la columna que después
-- se usa para agrupar resultados en el informe. `generation_model` dice CON QUÉ
-- se hizo; `asset_type` dice QUÉ ES.
--
-- TODAS LAS COLUMNAS SON NULAS
-- Las filas que ya existen se generaron con el simulador y no tienen semilla ni
-- modelo que declarar. Inventarles un valor por omisión sería escribir un dato
-- que nadie midió. Null significa "no se sabe", que es la verdad.
--
-- No hay cambios de RLS ni de GRANT: son columnas nuevas sobre una tabla ya
-- cubierta, y las políticas de 002 y los grants de 004/007 aplican a la fila
-- entera, no por columna.
-- =============================================================================

alter table public.assets
  add column generation_seed  bigint,
  add column generation_model text,
  add column generation_steps smallint;

-- Runware acepta la semilla como entero sin signo de 32 bits. Se guarda en
-- bigint porque el rango no entra en `integer` de Postgres, que es con signo, y
-- el check es lo que impide guardar una que el proveedor después rechazaría.
alter table public.assets
  add constraint assets_generation_seed_range
    check (
      generation_seed is null
      or (generation_seed >= 0 and generation_seed <= 4294967295)
    ),
  add constraint assets_generation_steps_positive
    check (generation_steps is null or generation_steps > 0);

-- El tipo nuevo. Se reescribe la lista entera porque un check no se extiende.
alter table public.assets
  drop constraint assets_type_check;

alter table public.assets
  add constraint assets_type_check
    check (asset_type in (
      'logo', 'base_garment', 'model_photo', 'tech_drawing',
      'mask', 'composition', 'inpainting', 'edit', 'vton', 'ai_model',
      'export_flat', 'export_model', 'export_ai'
    ));

comment on column public.assets.generation_seed is
  'Ruido inicial de la difusión. Sin esto una generación no se puede repetir: '
  'el mismo pedido con otra semilla devuelve otra imagen. Null en filas '
  'anteriores a la migración 018 y en las que no salieron de un modelo.';

comment on column public.assets.generation_model is
  'Identificador AIR del modelo que la produjo, por ejemplo runware:102@1 '
  '(FLUX.1 Fill, con máscara) o runware:106@1 (FLUX.1 Kontext, por '
  'instrucción). Necesario desde que el proyecto usa más de uno.';

comment on column public.assets.generation_steps is
  'Iteraciones de eliminación de ruido. Hoy es una constante del código; se '
  'guarda para que una fila siga siendo reproducible si esa constante cambia.';
