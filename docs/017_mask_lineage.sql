-- 017 — La máscara deja de ser hermana de la generación y pasa a colgar de ella.
--
-- PROBLEMA
-- Hoy una generación y la máscara que la produjo son HERMANAS: las dos apuntan
-- a la misma imagen de trabajo como padre. Para saber cuál máscara produjo cuál
-- resultado hay que emparejarlas por hora de creación, que es flojo para
-- reproducibilidad y se rompe con dos generaciones seguidas.
--
-- Y hay una fuga real: la máscara se sube ANTES de llamar al proveedor, así que
-- una generación que falla deja su máscara huérfana. Diez reintentos, diez
-- máscaras que no le pertenecen a nada.
--
-- DECISIÓN
-- La máscara se conserva — es la evidencia de QUÉ zona se editó, y sin ella un
-- resultado no es reproducible ni se puede defender en el informe. Lo que
-- cambia es de dónde cuelga.
--
--   * `mask_asset_id` en la fila GENERADA apunta a su máscara.
--   * `on delete set null`: borrar una máscara vieja no debe borrar el
--     resultado. La máscara es evidencia, el resultado es el trabajo.
--   * Una máscara pertenece a una sola generación (`unique`), que es lo que
--     convierte "emparejar por hora" en un dato.
--
-- Con esto, una máscara sin generación que la reclame es huérfana POR
-- DEFINICIÓN, y se puede limpiar sin adivinar.
--
-- NO se agrega un `check` que exija que la máscara sea del mismo diseño: eso se
-- verifica en `lib/generation/inputs.ts`, por debajo del RLS, porque una FK se
-- verifica por debajo del RLS y la política mira la fila que se escribe, no
-- aquello a lo que apunta.

alter table public.assets
  add column if not exists mask_asset_id uuid
    references public.assets (id) on delete set null;

comment on column public.assets.mask_asset_id is
  'La máscara que produjo esta imagen generada. NULL en todo lo demás.';

-- Una máscara no puede haber producido dos resultados distintos.
create unique index if not exists assets_mask_asset_id_key
  on public.assets (mask_asset_id)
  where mask_asset_id is not null;

-- Para encontrar máscaras huérfanas sin recorrer la tabla entera.
create index if not exists assets_mask_orphans_idx
  on public.assets (design_id)
  where asset_type = 'mask';
