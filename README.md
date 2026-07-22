# Refashion IA

Sistema de prototipado de uniformes corporativos asistido por IA. Permite editar
imágenes de prendas y generar prototipos con modelos de difusión, sobre una jerarquía
de clientes, proyectos y diseños. Proyecto de graduación — Universidad del Valle de
Guatemala.

Herramienta **interna**: no hay registro público; los usuarios se crean a mano desde
el dashboard de Supabase.

## Stack

- **Next.js 16** (App Router) + TypeScript — fullstack, sin backend separado. La API son
  Route Handlers en `app/api/*`.
- **Supabase** (Postgres + Auth) — datos y sesión; el acceso lo impone Row Level Security.
- **Cloudflare R2** — object storage privado para las imágenes, vía presigned URLs.
- **Tailwind CSS v4** — tokens de diseño en `app/globals.css`; estilos de componente en
  CSS Modules colocados.
- **Zod** — validación de los bodies de la API.

## Principios de arquitectura

- El frontend nunca habla directo con R2 ni con servicios de IA: todo pasa por `app/api/*`.
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

## Base de datos

Las migraciones están en `docs/`, numeradas y secuenciales. Se ejecutan en el SQL Editor
de Supabase en orden:

- `001_initial_schema.sql` — tablas y RLS inicial.
- `002_granular_rls_policies.sql` — políticas RLS por rol (`owner` / `editor` / `viewer`).

## Despliegue

Vercel, conectado a la rama `main` (push despliega). Root Directory vacío, Framework
Preset **Next.js**. Las variables de entorno se configuran en Vercel aparte de `.env.local`.

## Estado

- **Paso 1 — base de autenticación:** completo. Login, protección de rutas (`proxy.ts`),
  logout, y clientes de Supabase server/browser.
- **Siguiente:** CRUD de clientes, proyectos y diseños; luego subida de imágenes a R2.
