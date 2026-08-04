"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiGet, apiPost } from "@/lib/api-client";
import { CLIENT_ROLE_COPY } from "@/lib/roles";
import { displayName } from "@/lib/users";
import type { ClientRole, UserSummary } from "@/lib/types";
import styles from "./AddMemberDialog.module.css";

interface AddMemberDialogProps {
  clientId: string;
  /** Users already on the client, filtered out of the picker. */
  existingMemberIds: string[];
}

const ROLES: ClientRole[] = ["owner", "editor", "viewer"];

export function AddMemberDialog({
  clientId,
  existingMemberIds,
}: AddMemberDialogProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  // null means "not loaded yet" — drives the loading label without a separate
  // synchronous setState inside the effect.
  const [directory, setDirectory] = useState<UserSummary[] | null>(null);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ClientRole>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch the directory whenever the dialog opens. Only the async callbacks
  // touch state, so nothing runs synchronously during the effect.
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    apiGet<UserSummary[]>("/api/users").then((result) => {
      if (active) setDirectory(result.ok ? result.data : []);
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  function open() {
    setUserId("");
    setRole("viewer");
    setError(null);
    setDirectory(null); // reload fresh each time it opens
    setIsOpen(true);
  }

  const isLoadingDirectory = directory === null;
  const candidates = (directory ?? []).filter(
    (user) => !existingMemberIds.includes(user.id)
  );

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await apiPost(`/api/clients/${clientId}/members`, {
      user_id: userId,
      role,
    });

    if (!result.ok) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setIsOpen(false);
    notify({ type: "success", message: "Miembro agregado." });
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" onClick={open}>
        Agregar miembro
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        labelledBy="add-member-title"
      >
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <h2 className={styles.title} id="add-member-title">
            Agregar miembro
          </h2>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="member-user">
              Usuario
            </label>
            <select
              id="member-user"
              className={styles.input}
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              disabled={isSubmitting || isLoadingDirectory}
              required
            >
              <option value="" disabled>
                {isLoadingDirectory
                  ? "Cargando usuarios…"
                  : candidates.length === 0
                    ? "No hay usuarios disponibles"
                    : "Selecciona un usuario"}
              </option>
              {candidates.map((user) => (
                <option key={user.id} value={user.id}>
                  {displayName(user)} · {user.email}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="member-role">
              Rol en el cliente
            </label>
            <select
              id="member-role"
              className={styles.input}
              value={role}
              onChange={(event) => setRole(event.target.value as ClientRole)}
              disabled={isSubmitting}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {CLIENT_ROLE_COPY[r].label}
                </option>
              ))}
            </select>
            <p className={styles.help}>{CLIENT_ROLE_COPY[role].description}</p>
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
              disabled={isSubmitting || userId === ""}
            >
              {isSubmitting ? "Agregando…" : "Agregar"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
