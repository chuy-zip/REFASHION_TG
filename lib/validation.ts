import { z } from "zod";
import { CLIENT_ASSET_TYPES, DESIGN_ASSET_TYPES } from "@/lib/assets";

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
  phone: optionalText,
  email: z.email("El correo no es válido.").nullish(),
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

const designStatus = z.enum(["draft", "active", "completed"], {
  message: "Selecciona un estado válido.",
});

/**
 * `version` is deliberately absent from both schemas: it is derived server-side
 * (1, or parent.version + 1 for an iteration), never sent by the client. See
 * migration 010.
 */
export const createDesignSchema = z.object({
  project_id: z.uuid("El proyecto seleccionado no es válido."),
  name: z
    .string()
    .trim()
    .min(1, "El nombre del diseño es obligatorio.")
    .max(200, "El nombre no puede superar los 200 caracteres."),
  garment_type: garmentType.optional(),
  /** Catalog image to start from. Ignored when parent_design_id is present. */
  base_asset_id: z.uuid("La prenda base seleccionada no es válida.").nullish(),
  /** Design this one iterates on; its version and starting image are inherited. */
  parent_design_id: z
    .uuid("El diseño seleccionado no es válido.")
    .nullish(),
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
    status: designStatus.optional(),
    base_asset_id: z.uuid("La prenda base seleccionada no es válida.").nullish(),
    /** Time travel: which step of the history the design is standing on. */
    current_asset_id: z.uuid("El paso seleccionado no es válido.").nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No hay campos para actualizar.",
  });

export type UpdateDesignInput = z.infer<typeof updateDesignSchema>;

/* -------------------------------------------------------------------------- */
/* Assets (catalog of a client, or produced against a design)                  */
/* -------------------------------------------------------------------------- */

/**
 * An asset hangs off a client (catalog) or off a design (produced), never both
 * and never neither. That is `assets_owner_check` in the schema; these two
 * helpers make the API reject the same shapes the database would, with a
 * readable message instead of a constraint violation.
 */
function hasExactlyOneOwner(data: {
  client_id?: string;
  design_id?: string;
}): boolean {
  return (data.client_id === undefined) !== (data.design_id === undefined);
}

const OWNER_MESSAGE =
  "Un recurso pertenece a un cliente o a un diseño, no a ambos ni a ninguno.";

const clientAssetType = z.enum(CLIENT_ASSET_TYPES, {
  message: "Selecciona un tipo de recurso válido.",
});

const designAssetType = z.enum(DESIGN_ASSET_TYPES, {
  message: "Selecciona un tipo de recurso válido.",
});

const anyAssetType = z.enum([...CLIENT_ASSET_TYPES, ...DESIGN_ASSET_TYPES], {
  message: "Selecciona un tipo de recurso válido.",
});

/** See migration 012 for what separates 'derived' from 'generated'. */
const assetOrigin = z.enum(["upload", "derived", "generated"], {
  message: "El origen del recurso no es válido.",
});

/** Kept narrow on purpose: the R2 key extension is derived from this list. */
const uploadableMimeType = z.enum(["image/png", "image/jpeg", "image/webp"], {
  message: "Formato de imagen no soportado. Usa PNG, JPEG o WEBP.",
});

export const presignUploadSchema = z
  .object({
    client_id: z.uuid("El cliente seleccionado no es válido.").optional(),
    design_id: z.uuid("El diseño seleccionado no es válido.").optional(),
    content_type: uploadableMimeType,
  })
  .refine(hasExactlyOneOwner, { message: OWNER_MESSAGE });

export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const confirmAssetSchema = z
  .object({
    asset_id: z.uuid("El asset no es válido."),
    client_id: z.uuid("El cliente seleccionado no es válido.").optional(),
    design_id: z.uuid("El diseño seleccionado no es válido.").optional(),
    r2_key: z.string().trim().min(1, "Falta la key del objeto en R2."),
    asset_type: anyAssetType,
    original_filename: z
      .string()
      .trim()
      .min(1, "Falta el nombre del archivo.")
      .max(255, "El nombre del archivo es demasiado largo."),
    mime_type: uploadableMimeType,
    file_size_bytes: z.coerce
      .number()
      .int()
      .positive("El tamaño del archivo no es válido."),
    /** Defaults to 'upload' server-side when omitted. */
    origin: assetOrigin.optional(),
    /**
     * Which image this one came from. Sustains objetivo específico 2, so it is
     * accepted from the first design asset onward and not left for later.
     */
    parent_asset_id: z.uuid("El recurso de origen no es válido.").nullish(),
  })
  .superRefine((data, ctx) => {
    if (!hasExactlyOneOwner(data)) {
      ctx.addIssue({ code: "custom", message: OWNER_MESSAGE });
      return;
    }

    // The type has to match the side it hangs off: a catalog cannot hold a
    // mask, and a design cannot hold a logo (a logo belongs to the client and
    // is *composited onto* the design, see FASE_1_5 §7.1).
    const expected = data.client_id ? clientAssetType : designAssetType;
    if (!expected.safeParse(data.asset_type).success) {
      ctx.addIssue({
        code: "custom",
        path: ["asset_type"],
        message: data.client_id
          ? "Ese tipo de recurso no pertenece al catálogo de un cliente."
          : "Ese tipo de recurso no pertenece a un diseño.",
      });
    }
  });

export type ConfirmAssetInput = z.infer<typeof confirmAssetSchema>;

/** PATCH /api/assets/:id — rename only; the extension is fixed app-side. */
export const renameAssetSchema = z.object({
  original_filename: z
    .string()
    .trim()
    .min(1, "El nombre del archivo es obligatorio.")
    .max(255, "El nombre del archivo es demasiado largo."),
});

export type RenameAssetInput = z.infer<typeof renameAssetSchema>;
