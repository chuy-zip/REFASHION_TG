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
