import { z } from "zod";

/**
 * Zod schemas for API request bodies.
 * Messages are user-facing, so they are written in Spanish.
 */

/** Optional free-text field: absent, null, or a trimmed string. */
const optionalText = z.string().trim().max(200).nullish();

export const createClientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre del cliente es obligatorio.")
    .max(200, "El nombre no puede superar los 200 caracteres."),
  nit: optionalText,
  address: optionalText,
  city: optionalText,
  country: optionalText,
  notes: z.string().trim().max(2000).nullish(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

/** PATCH: every field optional, but at least one must be present. */
export const updateClientSchema = createClientSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "No hay campos para actualizar.",
  });

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

/* -------------------------------------------------------------------------- */
/* Users (admin only)                                                          */
/* -------------------------------------------------------------------------- */

export const createUserSchema = z.object({
  email: z.email("El correo electrónico no es válido."),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(72, "La contraseña no puede superar los 72 caracteres."),
  first_name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(100, "El nombre no puede superar los 100 caracteres."),
  last_name: z
    .string()
    .trim()
    .min(1, "El apellido es obligatorio.")
    .max(100, "El apellido no puede superar los 100 caracteres."),
  role_id: z.coerce
    .number()
    .int()
    .positive("Selecciona un rol válido."),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserRoleSchema = z.object({
  role_id: z.coerce.number().int().positive("Selecciona un rol válido."),
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

/* -------------------------------------------------------------------------- */
/* Client members                                                              */
/* -------------------------------------------------------------------------- */

const clientRole = z.enum(["owner", "editor", "viewer"], {
  message: "Selecciona un rol válido.",
});

export const addMemberSchema = z.object({
  user_id: z.uuid("El usuario seleccionado no es válido."),
  role: clientRole,
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: clientRole,
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

/* -------------------------------------------------------------------------- */
/* Projects                                                                    */
/* -------------------------------------------------------------------------- */

const projectStatus = z.enum(["draft", "active", "closed"], {
  message: "Selecciona un estado válido.",
});

export const createProjectSchema = z.object({
  client_id: z.uuid("El cliente seleccionado no es válido."),
  name: z
    .string()
    .trim()
    .min(1, "El nombre del proyecto es obligatorio.")
    .max(200, "El nombre no puede superar los 200 caracteres."),
  description: z.string().trim().max(2000).nullish(),
  // Optional on create; the column defaults to 'draft'.
  status: projectStatus.optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "El nombre del proyecto es obligatorio.")
      .max(200, "El nombre no puede superar los 200 caracteres.")
      .optional(),
    description: z.string().trim().max(2000).nullish(),
    status: projectStatus.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No hay campos para actualizar.",
  });

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/* -------------------------------------------------------------------------- */
/* Designs                                                                     */
/* -------------------------------------------------------------------------- */

const garmentType = z.enum(["shirt", "polo", "hoodie"], {
  message: "Selecciona un tipo de prenda válido.",
});

export const createDesignSchema = z.object({
  project_id: z.uuid("El proyecto seleccionado no es válido."),
  name: z
    .string()
    .trim()
    .min(1, "El nombre del diseño es obligatorio.")
    .max(200, "El nombre no puede superar los 200 caracteres."),
  garment_type: garmentType.optional(),
  version: z.coerce
    .number()
    .int()
    .positive("La versión debe ser un número positivo.")
    .optional(),
  notes: z.string().trim().max(2000).nullish(),
});

export type CreateDesignInput = z.infer<typeof createDesignSchema>;

export const updateDesignSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "El nombre del diseño es obligatorio.")
      .max(200, "El nombre no puede superar los 200 caracteres.")
      .optional(),
    garment_type: garmentType.optional(),
    version: z.coerce
      .number()
      .int()
      .positive("La versión debe ser un número positivo.")
      .optional(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No hay campos para actualizar.",
  });

export type UpdateDesignInput = z.infer<typeof updateDesignSchema>;
