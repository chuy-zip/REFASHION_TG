import type { ClientRole, GlobalRole } from "@/lib/types";

/**
 * User-facing Spanish copy for the global roles.
 *
 * The role catalog in the database is described in English (code convention),
 * so that text must never be shown in the UI. This is the source for anything
 * a user reads about a role.
 */
export const GLOBAL_ROLE_COPY: Record<
  GlobalRole,
  { label: string; description: string }
> = {
  admin: {
    label: "Administrador",
    description:
      "Acceso total: ve y gestiona todos los clientes y administra usuarios.",
  },
  editor: {
    label: "Editor",
    description:
      "Puede crear clientes (queda como owner) y trabajar en cualquier cliente al que lo inviten.",
  },
  viewer: {
    label: "Viewer",
    description:
      "No puede crear clientes; su acceso se asigna por cliente.",
  },
};

export function roleLabel(name: GlobalRole): string {
  return GLOBAL_ROLE_COPY[name]?.label ?? name;
}

export function roleDescription(name: GlobalRole): string {
  return GLOBAL_ROLE_COPY[name]?.description ?? "";
}

/**
 * Copy for the per-client roles (client_members.role). Distinct set from the
 * global roles: this one has `owner` instead of `admin`.
 */
export const CLIENT_ROLE_COPY: Record<
  ClientRole,
  { label: string; description: string }
> = {
  owner: {
    label: "Owner",
    description:
      "Control total del cliente: editar, eliminar y gestionar miembros.",
  },
  editor: {
    label: "Editor",
    description: "Puede crear y editar proyectos, diseños e imágenes.",
  },
  viewer: {
    label: "Viewer",
    description: "Solo lectura del cliente y su contenido.",
  },
};

export function clientRoleLabel(role: ClientRole): string {
  return CLIENT_ROLE_COPY[role]?.label ?? role;
}
