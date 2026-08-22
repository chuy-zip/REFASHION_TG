import Link from "next/link";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog/ClientFormDialog";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import {
  clientLocation,
  clientWorkSummary,
  listClientsWithCounts,
} from "@/lib/clients";
import styles from "./page.module.css";

/**
 * Client list.
 *
 * Reads Supabase directly: this is a Server Component, so the query runs on the
 * server under the same RLS as the API would apply. Writes still go through
 * /api/clients — see CreateClientForm.
 */
export default async function ClientsPage() {
  const supabase = await createSupabaseClient();
  const { clients, error } = await listClientsWithCounts(supabase);

  // In dev, surface the real Postgres/PostgREST reason in the terminal.
  // An empty list and a blocked query look identical in the UI otherwise.
  if (process.env.NODE_ENV === "development") {
    if (error) {
      console.error("[clients] select failed:", error);
    } else {
      console.log(`[clients] select ok: ${clients.length} fila(s)`);
    }
  }

  // Same check the RPC enforces server-side; here it only drives the UI so a
  // viewer sees a disabled button instead of a modal that will fail on submit.
  const { data: canCreate } = await supabase.rpc("can_create_clients");

  return (
    <main className={styles.page}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Clientes</h1>
          <ClientFormDialog
            triggerLabel="Crear cliente"
            disabled={canCreate !== true}
            disabledReason="No tienes permisos para crear clientes."
          />
        </div>

        {canCreate !== true && (
          <p className={styles.permissionHint}>
            Tu rol no permite crear clientes. Solicítalo a un administrador o
            editor.
          </p>
        )}

        {error && (
          <p className={styles.error} role="alert">
            No se pudieron cargar los clientes. Recarga la página para
            reintentar.
          </p>
        )}

        {!error && clients.length === 0 && (
          <EmptyState
            title="Sin clientes aún"
            hint="Los clientes agrupan los proyectos y el catálogo de prendas."
          />
        )}

        {clients.length > 0 && (
          <ul className={styles.list}>
            {clients.map((client) => {
              const location = clientLocation(client);
              const hasContact = Boolean(
                client.address || client.email || client.phone
              );

              return (
                <li key={client.id}>
                  <Link className={styles.card} href={`/clients/${client.id}`}>
                    <div>
                      <div className={styles.cardName}>{client.name}</div>
                      <div
                        className={`${styles.cardWhere} ${
                          location ? "" : styles.cardMissing
                        }`}
                      >
                        {location ?? "Sin ubicación"}
                      </div>
                    </div>

                    <div className={styles.cardContact}>
                      {hasContact ? (
                        <>
                          {client.address && <span>{client.address}</span>}
                          {client.email && <span>{client.email}</span>}
                          {client.phone && (
                            <span className={styles.cardPhone}>
                              {client.phone}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className={styles.cardMissing}>
                          Sin dirección, correo ni teléfono
                        </span>
                      )}
                    </div>

                    <div className={styles.cardFoot}>
                      {client.nit ? (
                        <span className={styles.cardNit}>
                          NIT {client.nit}
                        </span>
                      ) : (
                        <span className={styles.cardMissing}>Sin NIT</span>
                      )}
                      <span>{clientWorkSummary(client)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
    </main>
  );
}
