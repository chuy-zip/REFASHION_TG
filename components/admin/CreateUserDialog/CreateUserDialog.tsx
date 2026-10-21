"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { PasswordInput } from "@/components/ui/PasswordInput/PasswordInput";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiPost } from "@/lib/api-client";
import { roleDescription, roleLabel } from "@/lib/roles";
import type { Role } from "@/lib/types";
import styles from "./CreateUserDialog.module.css";

interface CreateUserDialogProps {
  roles: Role[];
  /** Role selected by default; the catalog's `viewer` when present. */
  defaultRoleId: number;
}

export function CreateUserDialog({
  roles,
  defaultRoleId,
}: CreateUserDialogProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleId, setRoleId] = useState(defaultRoleId);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function open() {
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setRoleId(defaultRoleId);
    setError(null);
    setIsOpen(true);
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await apiPost("/api/admin/users", {
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      role_id: roleId,
    });

    if (!result.ok) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setIsOpen(false);
    notify({
      type: "success",
      message: `Usuario ${firstName} ${lastName} creado.`,
    });
    router.refresh();
  }

  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 8 &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0;

  return (
    <>
      <Button variant="primary" onClick={open}>
        Crear usuario
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        labelledBy="create-user-title"
      >
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <h2 className={styles.title} id="create-user-title">
            Nuevo usuario
          </h2>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-first-name">
                Nombre
              </label>
              <input
                id="user-first-name"
                className={styles.input}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoFocus
                required
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-last-name">
                Apellido
              </label>
              <input
                id="user-last-name"
                className={styles.input}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="user-email">
              Correo electrónico
            </label>
            <input
              id="user-email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.field}>
            {/* "Provisional" and "podrá cambiarla después" promised a feature
                that does not exist: nobody can change a password from the app,
                neither the user nor an admin. It is out of scope for the
                project, so the copy says what is true instead. */}
            <label className={styles.label} htmlFor="user-password">
              Contraseña
            </label>
            <PasswordInput
              id="user-password"
              className={styles.input}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
              disabled={isSubmitting}
            />
            <p className={styles.help}>
              Mínimo 8 caracteres. Compártela con la persona
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="user-role">
              Rol global
            </label>
            <select
              id="user-role"
              className={styles.input}
              value={roleId}
              onChange={(event) => setRoleId(Number(event.target.value))}
              disabled={isSubmitting}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {roleLabel(role.name)}
                </option>
              ))}
            </select>
            <p className={styles.help}>
              {(() => {
                const selected = roles.find((role) => role.id === roleId);
                return selected
                  ? roleDescription(selected.name)
                  : "Define qué puede hacer a nivel de sistema.";
              })()}
            </p>
          </div>

          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !canSubmit}
            >
              {isSubmitting ? "Creando…" : "Crear usuario"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
