"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiDelete, apiPatch } from "@/lib/api-client";
import { displayName } from "@/lib/users";
import { roleLabel } from "@/lib/roles";
import type { Role, UserSummary } from "@/lib/types";
import styles from "./UserRow.module.css";

interface UserRowProps {
  user: UserSummary;
  roles: Role[];
  /** The signed-in admin cannot change or delete their own account. */
  isSelf: boolean;
}

export function UserRow({ user, roles, isSelf }: UserRowProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [roleId, setRoleId] = useState(user.role_id);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function changeRole(nextRoleId: number) {
    const previous = roleId;
    setRoleId(nextRoleId);
    setError(null);
    setIsBusy(true);

    const result = await apiPatch(`/api/admin/users/${user.id}`, {
      role_id: nextRoleId,
    });

    if (!result.ok) {
      setError(result.error);
      setRoleId(previous); // revert the optimistic change
      setIsBusy(false);
      return;
    }

    setIsBusy(false);
    notify({
      type: "success",
      message: `Rol de ${name} actualizado.`,
    });
    router.refresh();
  }

  async function handleDelete() {
    setError(null);
    setIsBusy(true);

    const result = await apiDelete(`/api/admin/users/${user.id}`);

    if (!result.ok) {
      setError(result.error);
      setIsBusy(false);
      setIsConfirmOpen(false);
      return;
    }

    setIsBusy(false);
    setIsConfirmOpen(false);
    notify({ type: "success", message: `${name} se eliminó.` });
    router.refresh();
  }

  const name = displayName(user);
  const confirmId = `delete-user-${user.id}`;

  return (
    <li className={styles.row}>
      <div className={styles.identity}>
        <span className={styles.name}>
          {name}
          {isSelf && <span className={styles.selfTag}>tú</span>}
        </span>
        <span className={styles.email}>{user.email}</span>
        {error && (
          <span className={styles.error} role="alert">
            {error}
          </span>
        )}
      </div>

      <div className={styles.controls}>
        <label className={styles.srOnly} htmlFor={`role-${user.id}`}>
          Rol de {name}
        </label>
        <select
          id={`role-${user.id}`}
          className={styles.select}
          value={roleId}
          onChange={(event) => changeRole(Number(event.target.value))}
          disabled={isBusy || isSelf}
          title={
            isSelf ? "No puedes cambiar tu propio rol" : "Cambiar rol global"
          }
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {roleLabel(role.name)}
            </option>
          ))}
        </select>

        <Button
          variant="danger"
          onClick={() => setIsConfirmOpen(true)}
          disabled={isBusy || isSelf}
          title={isSelf ? "No puedes eliminar tu propia cuenta" : "Eliminar"}
        >
          Eliminar
        </Button>
      </div>

      <Dialog
        open={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        labelledBy={confirmId}
      >
        <div className={styles.confirm}>
          <h2 className={styles.confirmTitle} id={confirmId}>
            Eliminar a {name}
          </h2>
          <p className={styles.confirmText}>
            Se eliminará su cuenta y sus accesos a todos los clientes. Esta
            acción no se puede deshacer.
          </p>
          <div className={styles.confirmActions}>
            <Button
              variant="secondary"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isBusy}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isBusy}>
              {isBusy ? "Eliminando…" : "Eliminar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </li>
  );
}
