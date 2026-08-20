"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { AddMemberDialog } from "@/components/clients/AddMemberDialog/AddMemberDialog";
import { apiDelete, apiPatch } from "@/lib/api-client";
import { CLIENT_ROLE_COPY, clientRoleLabel } from "@/lib/roles";
import type { ClientMemberView } from "@/lib/members";
import type { ClientRole } from "@/lib/types";
import styles from "./MembersSection.module.css";

const ROLES: ClientRole[] = ["owner", "editor", "viewer"];

interface MembersSectionProps {
  clientId: string;
  members: ClientMemberView[];
  /** Only owners (and admins) may add, change roles, or remove. */
  canManage: boolean;
  currentUserId: string;
}

export function MembersSection({
  clientId,
  members,
  canManage,
  currentUserId,
}: MembersSectionProps) {
  const existingIds = members.map((member) => member.user_id);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Miembros</h2>
          <p className={styles.subtitle}>
            Quién tiene acceso a este cliente y con qué rol.
          </p>
        </div>
        {canManage && (
          <AddMemberDialog clientId={clientId} existingMemberIds={existingIds} />
        )}
      </div>

      <ul className={styles.list}>
        {members.map((member) => (
          <MemberRow
            key={member.user_id}
            clientId={clientId}
            member={member}
            canManage={canManage}
            isSelf={member.user_id === currentUserId}
          />
        ))}
      </ul>
    </section>
  );
}

interface MemberRowProps {
  clientId: string;
  member: ClientMemberView;
  canManage: boolean;
  isSelf: boolean;
}

function MemberRow({ clientId, member, canManage, isSelf }: MemberRowProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [role, setRole] = useState<ClientRole>(member.role);
  const [isBusy, setIsBusy] = useState(false);

  const name =
    `${member.first_name} ${member.last_name}`.trim() ||
    member.email ||
    "Usuario sin nombre";

  async function changeRole(nextRole: ClientRole) {
    const previous = role;
    setRole(nextRole);
    setIsBusy(true);

    const result = await apiPatch(
      `/api/clients/${clientId}/members/${member.user_id}`,
      { role: nextRole }
    );

    if (!result.ok) {
      notify({ type: "error", message: result.error });
      setRole(previous);
      setIsBusy(false);
      return;
    }

    setIsBusy(false);
    notify({ type: "success", message: `Rol de ${name} actualizado.` });
    router.refresh();
  }

  async function remove() {
    setIsBusy(true);

    const result = await apiDelete(
      `/api/clients/${clientId}/members/${member.user_id}`
    );

    if (!result.ok) {
      notify({ type: "error", message: result.error });
      setIsBusy(false);
      return;
    }

    setIsBusy(false);
    notify({ type: "success", message: `${name} ya no tiene acceso.` });
    router.refresh();
  }

  return (
    <li className={styles.row}>
      <div className={styles.identity}>
        <span className={styles.name}>
          {name}
          {isSelf && <Badge tone="accent">tú</Badge>}
        </span>
        <span className={styles.email}>{member.email}</span>
      </div>

      {canManage ? (
        <div className={styles.controls}>
          <label className={styles.srOnly} htmlFor={`role-${member.user_id}`}>
            Rol de {name}
          </label>
          <select
            id={`role-${member.user_id}`}
            className={styles.select}
            value={role}
            onChange={(event) => changeRole(event.target.value as ClientRole)}
            disabled={isBusy}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {CLIENT_ROLE_COPY[r].label}
              </option>
            ))}
          </select>
          <Button variant="danger" onClick={remove} disabled={isBusy}>
            Quitar
          </Button>
        </div>
      ) : (
        <span className={styles.roleTag}>{clientRoleLabel(member.role)}</span>
      )}
    </li>
  );
}
