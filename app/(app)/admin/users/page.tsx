import { redirect } from "next/navigation";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/authz";
import { listRoles, listUsers } from "@/lib/users";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog/CreateUserDialog";
import { UserRow } from "@/components/admin/UserRow/UserRow";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { POST_LOGIN_PATH } from "@/lib/routes";
import styles from "./page.module.css";

/**
 * User administration. Admin only — a non-admin is sent back to the app rather
 * than shown an error, since the link is not offered to them in the first place.
 */
export default async function AdminUsersPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  if (!(await isCurrentUserAdmin())) redirect(POST_LOGIN_PATH);

  const supabase = await createSupabaseClient();
  const [{ users, error: usersError }, { roles }] = await Promise.all([
    listUsers(supabase),
    listRoles(supabase),
  ]);

  const defaultRoleId =
    roles.find((role) => role.name === "viewer")?.id ?? roles[0]?.id ?? 1;

  return (
    <main className={styles.page}>
      <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>Usuarios</h1>
            <p className={styles.subtitle}>
              El rol global define qué puede hacer a nivel de sistema. El acceso
              a cada cliente se asigna por separado.
            </p>
          </div>
          <CreateUserDialog roles={roles} defaultRoleId={defaultRoleId} />
        </div>

        {usersError && (
          <p className={styles.error} role="alert">
            No se pudo cargar la lista de usuarios. Recarga la página para
            reintentar.
          </p>
        )}

        {!usersError && users.length === 0 && (
          <EmptyState
            title="Sin usuarios aún"
            hint="Crea el primer usuario para darle acceso a la herramienta."
          />
        )}

        {users.length > 0 && (
          <ul className={styles.list}>
            {users.map((listed) => (
              <UserRow
                key={listed.id}
                user={listed}
                roles={roles}
                isSelf={listed.id === user.id}
              />
            ))}
          </ul>
        )}
    </main>
  );
}
