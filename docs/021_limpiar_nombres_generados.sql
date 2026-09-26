-- 021 — Borra los nombres que nadie eligió.
--
-- NO CAMBIA EL ESQUEMA. Es una limpieza de datos, y lleva número solo para que
-- quede claro en qué orden se corrió respecto de las migraciones.
--
-- PROBLEMA
-- Las cuatro rutas de generación rellenaban `original_filename` solas, con
-- cosas como `prueba-virtual-1758830000.webp`. Ese nombre no lo eligió nadie y
-- no dice nada: la columna existe para guardar **el nombre que el usuario le
-- puso** (migración 008), y una imagen generada no tuvo quién se lo pusiera.
--
-- Eso tenía dos consecuencias visibles. La galería de productos terminados no
-- podía mostrar el nombre, porque habría mostrado marcas de tiempo, así que
-- cuatro pruebas virtuales del mismo diseño se veían idénticas. Y al descargar
-- salían archivos llamados `prueba-virtual-1758830000.webp`.
--
-- DECISIÓN
-- Desde el 25-sep las rutas guardan null ahí, y **un valor en esa columna pasa
-- a significar que alguien la nombró de verdad**. Esto pone al día las filas
-- que ya existían, para que la regla valga también hacia atrás.
--
-- QUÉ TOCA, Y QUÉ NO
--
--   * Solo filas `origin = 'generated'`, que son las que salieron de un modelo.
--   * Solo nombres que **coinciden con el patrón que generaba el código**:
--     una palabra, un guion, una marca de tiempo y la extensión. Un nombre que
--     alguien escribió a mano no coincide y no se toca.
--   * NO toca lo que hace el navegador. La composición se llama "<diseño>
--     composicion", la máscara "<diseño> mascara" y un recoloreado "<diseño>
--     color 2F3E8C". Esos sí los eligió el código pero dicen algo, y seguirán
--     apareciendo como nombre hasta que alguien los cambie.
--
-- Se puede correr dos veces sin efecto: la segunda no encuentra nada.

-- Para mirar antes de tocar. Descomentar, correr, y comparar con el update.
-- select id, asset_type, original_filename
-- from public.assets
-- where origin = 'generated'
--   and original_filename ~ '^[a-z_-]+-[0-9]{10,}\.(png|webp|jpg)$'
-- order by created_at desc;

update public.assets
set original_filename = null
where origin = 'generated'
  -- `[a-z_-]+` cubre los cuatro prefijos que usó el código: prueba-virtual,
  -- modelo, edit, y los de inpainting, que fueron clean/shape/texture primero
  -- y fill/draw después.
  and original_filename ~ '^[a-z_-]+-[0-9]{10,}\.(png|webp|jpg)$';
