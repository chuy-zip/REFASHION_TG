# Refashion IA

Sistema de prototipado de uniformes corporativos asistido por IA. Permite editar
imágenes de prendas y generar prototipos con modelos de difusión, sobre una jerarquía
de clientes, proyectos y diseños. Proyecto de graduación — Universidad del Valle de
Guatemala.

Herramienta **interna**: no hay registro público. Los usuarios los crea un `admin` desde
`/admin/users`, que usa la Admin API de Supabase server-side.

## Stack

- **Next.js 16** (App Router) + TypeScript — fullstack, sin backend separado. La API son
  Route Handlers en `app/api/*`.
- **Supabase** (Postgres + Auth) — datos y sesión; el acceso lo impone Row Level Security.
- **Cloudflare R2** — object storage privado para las imágenes, vía presigned URLs.
- **Tailwind CSS v4** — tokens de diseño en `app/globals.css`; estilos de componente en
  CSS Modules colocados.
- **Zod 4** — validación de los bodies de la API.

## Principios de arquitectura

- El frontend nunca habla directo con R2 ni con servicios de IA: todo pasa por `app/api/*`.
  La única excepción es el `PUT` del binario a una presigned URL, que es justamente para
  que el archivo no atraviese el servidor.
- Las llaves secretas viven solo server-side (sin prefijo `NEXT_PUBLIC_`).
- Toda ruta `app/api/*` exige un JWT válido; sin sesión, las páginas redirigen a `/login`.
- Código, rutas, tablas y tipos en **inglés**; texto visible al usuario en **español**.

## Variables de entorno

Copia `.env.example` a `.env.local` y llénalo. La URL de Supabase debe ir sin barra final.

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Llave pública (browser) |
| `SUPABASE_SECRET_KEY` | Llave secreta, solo servidor |
| `R2_*` | Credenciales y endpoint de Cloudflare R2 |

## Desarrollo

```bash
npm install
npm run dev
```

Abre http://localhost:3000. Sin sesión, cualquier ruta redirige a `/login`.

Otros scripts: `npm run build` (build de producción), `npm run lint`.

## Convenciones

Reglas que el código ya asume. Romper cualquiera de estas produce un bug que no siempre
falla de inmediato.

**Leer vs. escribir.** Los Server Components consultan Supabase directo (corren en el
servidor y el RLS aplica igual). Las escrituras van siempre por `app/api/*` desde
componentes cliente, usando `lib/api-client.ts`.

**`lib/` es la capa de acceso a datos y autorización.** Inline si es de un solo uso;
extraído a `lib/` si se reutiliza, es complejo, o **codifica una regla**. Lo último no es
opcional: una regla de seguridad escrita dentro de un Route Handler solo protege ese
handler, y la siguiente ruta que toque la misma columna nace desprotegida.

**El corte cliente/servidor dentro de `lib/`.** Un archivo que importen componentes
cliente no puede importar `lib/r2` ni nada con credenciales. Por eso `lib/assets.ts`
(vocabulario, importable desde el navegador) está separado de `lib/assets-server.ts`
(consultas que firman URLs), y `lib/r2.ts` abre con `import "server-only"` para que un
import equivocado sea un error de build y no una fuga silenciosa.

**Ningún literal fuera de `app/globals.css`.** Nada de `#2F3E8C` ni `14px` en un `.tsx` o
un `.module.css`; siempre el token (`var(--color-accent)`, `var(--space-14)`). Son **dos**
verificaciones, no una: colores y espaciado, ambas en `STYLE_GUIDE.md` §5.1 con el porqué.

El grep de colores no debe devolver nada nunca. El de espaciado devuelve una lista corta de
excepciones justificadas (despejes ópticos, solapes de filete de 1px), no vacío.

**Un `.module.css` por componente, colocado junto a él.** Si un estilo se necesita en dos
lugares, se extrae un componente a `components/ui/`, no se duplica ni se sube a global.

**Versiones, para no escribir API deprecada.** Next 16: el middleware se llama `proxy.ts`,
`cookies()` es async y los `params` de rutas dinámicas son `Promise`. React 19:
`SyntheticEvent`, no `FormEvent`. Zod 4: `z.email()`, `z.uuid()`, `z.enum()`.

## Base de datos

Las migraciones están en `docs/`, numeradas y secuenciales. Se ejecutan en el SQL Editor
de Supabase **en orden**, y son **append-only**: nunca se edita una ya aplicada, porque
dejaría de describir lo que hay en la base.

| # | Qué |
|---|---|
| 001 | Tablas y RLS inicial |
| 002 | Políticas RLS por rol (`owner` / `editor` / `viewer`) y los helpers `is_client_member` / `can_edit_client` / `client_id_of_*` |
| 003 | Crea un cliente y su membresía `owner` en una sola transacción |
| 004 | Permisos de tabla para el rol `authenticated` |
| 005 | Rol global (`profiles.role_id`): bypass de admin, default `viewer`, trigger anti-escalada, `email` en `profiles` |
| 006 | Descripciones de rol + `EXECUTE` de los helpers |
| 007 | Permisos de `service_role` (flujos de admin) |
| 008 | `assets.original_filename` |
| 009 | `clients.phone` y `clients.email` |
| 010 | `designs.base_asset_id` y `designs.parent_design_id`; `version` pasa a derivarse |
| 011 | `designs.status` (draft / active / completed) |
| 012 | Tercer valor de `assets.origin`: `derived` |
| 013 | `designs.current_asset_id` y la tabla `design_layers` (capas de logo) |

Al agregar una tabla nueva hacen falta **cuatro** pasos, no dos: crearla, habilitar RLS,
escribir las políticas **y** otorgar los `GRANT` a `authenticated`. El proyecto tiene
desactivado *"Automatically expose new tables"*, así que las tablas nacen sin permisos y
quedan ilegibles aunque el RLS sea correcto.

## Decisiones

El razonamiento largo vive fuera del repo (documentos de seguimiento del trabajo de
graduación). Esto es lo mínimo para no deshacer una decisión sin querer.

- **Acceso por membresía, no por propiedad.** No existe `owner_id`. El acceso a un cliente
  es una fila en `client_members`, así que sumar usuarios es datos, no migración. Un
  cliente nunca puede quedarse sin `owner`.
- **Las FK se verifican por debajo del RLS.** Una FK garantiza que el UUID existe, no que
  el usuario pueda referenciarlo. Cada columna FK escribible desde la API necesita su
  verificación de pertenencia explícita, y a la fecha son cuatro:
  `assetBelongsToProjectClient` (`designs.base_asset_id`), `assetIsUsableAsCurrent`
  (`designs.current_asset_id`), `assetIsUsableAsLayer` (`design_layers.asset_id`) y
  `parentAssetBelongsToClient` (`assets.parent_asset_id`).
- **`version` se deriva, `status` se guarda.** La regla general: derivá lo que es un
  hecho, guardá lo que es una decisión del usuario.
- **El logo es una capa, no se aplana.** Se aplica al final del pipeline sobre la imagen
  de trabajo del momento, para que los módulos generativos nunca corran sobre una imagen
  con el logo pegado (la difusión lo deformaría).
- **`origin` tiene tres valores** (012): `upload` (lo subió una persona), `derived` (lo
  produjo la app en el navegador, determinista) y `generated` (lo produjo un modelo
  externo). El del medio existe porque el Módulo 1 se define como composición clásica **no
  generativa**, y guardarlo como `generated` haría que los datos contradijeran esa
  afirmación.
- **Un logotipo SVG se acepta, pero no se almacena.** Se convierte a PNG de 2048 px en el
  navegador al subirlo (`lib/svg-raster.ts`). Guardar el vector obligaría a convivir con tres
  rarezas del formato en cada carga (rasterizado a una resolución que decide el navegador,
  tamaño intrínseco distinto por navegador cuando falta el `viewBox`, y XML que puede traer
  `<script>`). Convertir en la frontera preserva el invariante del que depende todo lo demás:
  **todo objeto en R2 es un ráster que el lienzo puede dibujar**.
- **El cascade de Postgres no llega a R2.** Borrar cliente/proyecto/diseño elimina las
  filas dentro del motor, sin ningún punto donde la app se entere. Las `r2_key` se leen
  **antes** del borrado (`listR2KeysUnder*`) y se limpian después, best-effort.

## Despliegue

Vercel, conectado a la rama `main` (push despliega). Root Directory vacío, Framework
Preset **Next.js**. Las variables de entorno se configuran en Vercel aparte de `.env.local`.

## Estado

- **Autenticación, usuarios y permisos:** completo. Login/logout, protección de rutas
  (`proxy.ts`), roles globales (`admin` / `editor` / `viewer`), administración de usuarios
  (solo admin) y miembros por cliente manteniendo siempre ≥1 owner.
- **Clientes, proyectos y diseños:** CRUD completo, con permisos impuestos por RLS.
- **Catálogo de imágenes (R2):** completo. Subida por presigned URL, preview, descarga,
  renombrar y eliminar, en la pestaña Recursos del cliente.
- **Flujo de diseño:** un solo wizard de creación con dos entradas (sidebar y proyecto),
  selector visual de punto de partida con subida incorporada, y asignación de prenda base
  desde la pantalla de trabajo. Tres rutas por diseño: `/designs/[id]` (hub de solo
  lectura, con el historial), `/edit` (pantalla de trabajo) y `/present`.
- **Assets a nivel de diseño:** completo (`presign-upload` / `confirm` / `GET ?design_id=`
  con `design_id`, `origin` y `parent_asset_id`).
- **Módulo 1, composición de logos:** completo. Lienzo Konva sobre la imagen de trabajo,
  logotipos del catálogo colocados como capas con mover, escalar y rotar, autoguardado al
  soltar, export de la composición como asset del diseño, y subida de un logotipo sin salir
  del lienzo. Iterar un diseño copia sus capas.
- **Quitar el fondo de un logotipo:** en el lienzo, sobre la capa seleccionada
  (`lib/background-removal.ts`). Detecta si la imagen ya viene recortada y, si no, ofrece un
  *flood fill* desde las cuatro esquinas con tolerancia ajustable y vista previa en vivo sobre
  la prenda. El resultado es un logotipo **nuevo** en el catálogo (`origin = 'derived'`, con
  `parent_asset_id` al original) y la capa pasa a apuntarle; el original nunca se toca. Sin
  dependencias ni llamadas externas: el protocolo define este módulo como composición clásica,
  no generativa.
- **Presentación:** la pestaña "Plana" muestra una composición (la prenda con sus
  logotipos) y permite elegir cuál y descargarla. "Modelo guardado" y "Modelo IA" siguen
  siendo placeholder: son el Módulo 3.
- **Borrado seguro:** eliminar una imagen del catálogo avisa qué diseños la usan, como
  imagen de trabajo o como logotipo. Advertencia, no bloqueo.
- **Refactor visual en curso** (rama `ui-refactor`): tipografía Archivo, acento añil, escala
  de espaciado por fin declarada, y el sidebar reemplazado por una barra superior. El plan,
  las decisiones y lo que falta están en `REFACTOR_VISUAL.md`, fuera del repo.
- **Siguiente:** terminar ese refactor y después el Módulo 2, edición por zonas con máscaras e
  inpainting. Es el primero que llama a un servicio externo de pago, así que trae consigo el
  registro de `cost_usd` y el manejo de tareas asíncronas.
