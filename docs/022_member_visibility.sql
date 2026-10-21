-- 022 — Quién ve a quién: los miembros de un cliente y el directorio de usuarios.
--
-- PROBLEMA
-- Tres lecturas estaban abiertas de más, y una escritura dejaba entrar a quien
-- no debía. Las cuatro se verificaron contra `pg_policies` de la base real el
-- 21-oct, no solo contra los `.sql` del repo.
--
--   1. `profiles: readable by authenticated` (005, §6): cualquier usuario con
--      sesión leía nombre y correo de TODOS los perfiles. Cerrar la API no
--      alcanzaba: el navegador tiene la llave pública y puede consultar
--      `profiles` directo con su propio token.
--   2. `client_members: members can read` (002): cualquier miembro, viewer
--      incluido, leía todas las membresías del cliente, y con ellas a quién
--      buscar en `profiles`.
--   3. `client_members: owner or bootstrap can insert` (002): la cláusula
--      "bootstrap" deja que alguien se inserte como owner de un cliente que no
--      tiene miembros. Lo comprueba con un `not exists` sobre `client_members`
--      que corre BAJO EL RLS DE QUIEN INSERTA, y quien no es miembro de un
--      cliente no ve sus filas: para él todo cliente parece vacío. Cualquier
--      usuario con sesión que conozca el UUID de un cliente podía hacerse owner.
--
-- DECISIÓN
--
--   * Un viewer de un cliente ve su propia fila de membresía y su propio
--     perfil. Nada más.
--   * owner y editor del cliente, y el admin global, ven a los miembros como
--     hasta ahora.
--   * El directorio completo de usuarios lo ve solo quien puede agregar
--     miembros: admin global, u owner de al menos un cliente.
--   * La cláusula bootstrap se quita. Ya no hacía falta desde la 003: los
--     clientes se crean con `create_client_with_owner`, que es SECURITY
--     DEFINER y no pasa por el RLS.
--
-- QUÉ NO CAMBIA
--
--   * Las políticas de escritura de `client_members` (update, delete) y de
--     `profiles` (update own).
--   * `create_client_with_owner`: corre como dueña de las tablas, ninguna tiene
--     FORCE ROW LEVEL SECURITY, y no usa la cláusula que se quita.
--   * Crear y editar usuarios desde el admin: usa la llave de servicio.
--   * "Un cliente nunca queda sin owner": `countOwners` cuenta con la sesión de
--     quien edita, que solo puede ser owner o admin, y esos siguen viendo todas
--     las filas. Si alguna vez contara de menos, bloquearía de más, nunca de
--     menos.
--
-- Las dos funciones son SECURITY DEFINER como las de la 005: leen las tablas
-- sin pasar por su propio RLS, así que una política de `client_members` puede
-- llamarlas sin entrar en recursión.
--
-- Se puede correr dos veces: todo es `create or replace` y `drop ... if exists`.

-- ---------------------------------------------------------------------------
-- 1. Quién puede agregar miembros, en una sola definición.
--
--    La usan el RLS de `profiles` (abajo) y la ruta GET /api/users, para que
--    la pantalla y la base no puedan discrepar sobre quién ve el directorio.
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_members()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_global_admin() or exists (
    select 1 from public.client_members m
    where m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Qué perfiles puede leer quien pregunta.
--
--    El suyo; todos, si puede agregar miembros (necesita el directorio para
--    elegir a quién); y los de los miembros de un cliente donde él es owner o
--    editor, que es lo que muestra la pestaña "Miembros".
-- ---------------------------------------------------------------------------
create or replace function public.can_read_profile(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select target_user_id = auth.uid()
    or public.can_manage_members()
    or exists (
      select 1
      from public.client_members mine
      join public.client_members theirs on theirs.client_id = mine.client_id
      where mine.user_id = auth.uid()
        and mine.role in ('owner', 'editor')
        and theirs.user_id = target_user_id
    );
$$;

grant execute on function public.can_manage_members() to authenticated;
grant execute on function public.can_read_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. profiles: lectura acotada.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles: readable by authenticated" on public.profiles;
drop policy if exists "profiles: readable by self, managers and co-editors" on public.profiles;

create policy "profiles: readable by self, managers and co-editors"
  on public.profiles for select
  using (public.can_read_profile(id));

-- ---------------------------------------------------------------------------
-- 4. client_members: el viewer ve su propia fila; owner, editor y admin, todas.
--
--    `can_edit_client` ya incluye el bypass del admin (005, §4).
-- ---------------------------------------------------------------------------
drop policy if exists "client_members: members can read" on public.client_members;
drop policy if exists "client_members: own row or editors can read" on public.client_members;

create policy "client_members: own row or editors can read"
  on public.client_members for select
  using (user_id = auth.uid() or public.can_edit_client(client_id));

-- ---------------------------------------------------------------------------
-- 5. client_members: solo el owner (o el admin) agrega miembros.
-- ---------------------------------------------------------------------------
drop policy if exists "client_members: owner or bootstrap can insert" on public.client_members;
drop policy if exists "client_members: owners can insert" on public.client_members;

create policy "client_members: owners can insert"
  on public.client_members for insert
  with check (public.is_client_owner(client_id));

-- ---------------------------------------------------------------------------
-- VERIFICACIÓN (después de correrla)
--
-- Las políticas que quedaron:
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where tablename in ('profiles', 'client_members')
--   order by tablename, cmd;
--
-- Esperado: en `client_members`, SELECT "own row or editors can read" e INSERT
-- "owners can insert" (sin la cláusula bootstrap). En `profiles`, SELECT
-- "readable by self, managers and co-editors". UPDATE y DELETE sin cambios.
-- ---------------------------------------------------------------------------
