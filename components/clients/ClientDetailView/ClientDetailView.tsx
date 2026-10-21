"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ClientActionsMenu } from "@/components/clients/ClientActionsMenu/ClientActionsMenu";
import { AddMemberDialog } from "@/components/clients/AddMemberDialog/AddMemberDialog";
import { MembersSection } from "@/components/clients/MembersSection/MembersSection";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog/ProjectFormDialog";
import { ProjectsSection } from "@/components/projects/ProjectsSection/ProjectsSection";
import { AssetsSection } from "@/components/assets/AssetsSection/AssetsSection";
import { FinalProductsSection } from "@/components/clients/FinalProductsSection/FinalProductsSection";
import type { AssetWithUrl } from "@/lib/assets";
import type { FinalProduct } from "@/lib/assets-server";
import type { ClientContents } from "@/lib/clients";
import type { ProjectSamples } from "@/lib/designs";
import type { ClientMemberView } from "@/lib/members";
import type { Client, Project } from "@/lib/types";
import styles from "./ClientDetailView.module.css";

type Tab = "info" | "members" | "projects" | "assets" | "products";

const TABS: { id: Tab; label: string }[] = [
  { id: "info", label: "Información" },
  { id: "members", label: "Miembros" },
  { id: "projects", label: "Proyectos" },
  { id: "assets", label: "Recursos" },
  // Last, because it is where the work ends up. Recursos holds what goes IN;
  // this holds what came OUT, and keeping them apart is what stops one screen
  // from having to mean both.
  { id: "products", label: "Productos" },
];

/** The default tab, and therefore the one that needs no `?tab=` in the URL. */
const DEFAULT_TAB: Tab = "info";

function isTab(value: string | null): value is Tab {
  return TABS.some((tab) => tab.id === value);
}

interface ClientDetailViewProps {
  client: Client;
  canEdit: boolean;
  canDelete: boolean;
  members: ClientMemberView[];
  canManageMembers: boolean;
  /** What deleting this client would destroy; null when it could not be read. */
  contents: ClientContents | null;
  /** True while the provider is the simulator: generating costs nothing. */
  isSimulated: boolean;
  /** The current page of projects, with their sample strips. */
  projects: Project[];
  projectsTotal: number;
  projectsPage: number;
  projectsQuery: string;
  samplesByProject: Map<string, ProjectSamples>;
  assets: AssetWithUrl[];
  /** Everything this client's designs have finished, across every project. */
  products: FinalProduct[];
  currentUserId: string;
}

/**
 * Tabbed detail for a client: a left sidebar switches between the client's own
 * fields, its members, and (later) its projects. Header actions stay visible
 * across tabs since they act on the client as a whole.
 */
export function ClientDetailView({
  client,
  canEdit,
  canDelete,
  members,
  canManageMembers,
  contents,
  projects,
  projectsTotal,
  projectsPage,
  projectsQuery,
  samplesByProject,
  assets,
  products,
  currentUserId,
  isSimulated,
}: ClientDetailViewProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The tab is read from the URL, not held in state, so it survives a reload,
  // the back button and a shared link. A hand-typed ?tab=basura falls back to
  // the default instead of rendering nothing.
  const requested = searchParams.get("tab");
  const tab: Tab = isTab(requested) ? requested : DEFAULT_TAB;

  function hrefFor(id: Tab) {
    const params = new URLSearchParams(searchParams);
    if (id === DEFAULT_TAB) params.delete("tab");
    else params.set("tab", id);

    // `q` and `page` belong to Proyectos. Carrying them onto another tab would
    // put parameters in a shared link that describe nothing the receiver sees.
    if (id !== "projects") {
      params.delete("q");
      params.delete("page");
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>{client.name}</h1>
        {(canEdit || canDelete) && (
          <ClientActionsMenu
            client={client}
            canEdit={canEdit}
            canDelete={canDelete}
            contents={contents}
          />
        )}
      </div>

      {/* The tab strip carries the action of the tab you are on. Each panel
          used to open with an <h2> repeating the name of its own tab plus a
          line describing what was visible right below it — the same thing said
          three times in 100px. What a section is *for* is explained where it is
          actually needed: in its empty state. */}
      <div className={styles.tabBar}>
        {/* Links and not buttons, and not next/link either.

            Links, because they go somewhere: Ctrl+clic y clic central abren la
            pestaña en otra pestaña del navegador, que es lo que cualquiera
            espera de algo que se ve así. Y porque `aria-current="page"` sobre
            un <button> afirmaba algo falso — no había ninguna página, solo una
            variable cambiando. Ahora la URL se mueve y el atributo es cierto.

            No <Link>, porque una navegación de Next volvería a correr las cinco
            consultas de la página y a refirmar cada URL de R2 con solo cambiar
            de pestaña, cuando los datos ya están todos en el cliente.
            `history.pushState` mueve la URL sin ida al servidor, y Next lo
            parchea para sincronizar `useSearchParams` — que es de donde este
            componente lee. El botón Atrás sigue funcionando porque el estado
            entra al historial de verdad. */}
        <nav className={styles.tabs} aria-label="Secciones del cliente">
          {TABS.map(({ id, label }) => (
            <a
              key={id}
              href={hrefFor(id)}
              className={styles.tab}
              aria-current={tab === id ? "page" : undefined}
              onClick={(event) => {
                // Every gesture that means "open this elsewhere" is left to the
                // browser; intercepting it is how a link stops being a link.
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                window.history.pushState(null, "", hrefFor(id));
              }}
            >
              {label}
            </a>
          ))}
        </nav>

        {tab === "members" && canManageMembers && (
          <AddMemberDialog
            clientId={client.id}
            existingMemberIds={members.map((member) => member.user_id)}
          />
        )}

        {tab === "projects" && canEdit && (
          <ProjectFormDialog clientId={client.id} triggerLabel="Crear proyecto" />
        )}
      </div>

      <div className={styles.content}>
        {tab === "info" && <InfoPanel client={client} />}

        {tab === "members" && (
          <MembersSection
            clientId={client.id}
            members={members}
            canManage={canManageMembers}
            currentUserId={currentUserId}
          />
        )}

        {tab === "projects" && (
          <ProjectsSection
            projects={projects}
            total={projectsTotal}
            page={projectsPage}
            query={projectsQuery}
            samplesByProject={samplesByProject}
            canManage={canEdit}
          />
        )}

        {tab === "assets" && (
          <AssetsSection
            clientId={client.id}
            assets={assets}
            canManage={canEdit}
            isSimulated={isSimulated}
          />
        )}

        {tab === "products" && (
          <FinalProductsSection products={products} canEdit={canEdit} />
        )}
      </div>
    </div>
  );
}

type DetailGroup = {
  title: string;
  details: { label: string; value: string | null }[];
};

/**
 * Grouped instead of one flat grid: unrelated fields (NIT next to Notas)
 * sitting at the same visual weight was what made the tab feel empty/
 * unstructured. Contacto/Ubicación/Otros mirrors the field order in
 * ClientFormDialog, so the edit form and this read view build the same
 * mental model.
 */
function InfoPanel({ client }: { client: Client }) {
  const groups: DetailGroup[] = [
    {
      title: "Contacto",
      details: [
        { label: "Teléfono", value: client.phone },
        { label: "Correo", value: client.email },
      ],
    },
    {
      title: "Ubicación",
      details: [
        { label: "Dirección", value: client.address },
        { label: "Ciudad", value: client.city },
        { label: "País", value: client.country },
      ],
    },
    {
      title: "Otros",
      details: [
        { label: "NIT", value: client.nit },
        { label: "Notas", value: client.notes },
      ],
    },
  ];

  return (
    <div className={styles.infoGroups}>
      {groups.map((group) => (
        <section key={group.title}>
          <h3 className={styles.groupTitle}>{group.title}</h3>
          <dl className={styles.details}>
            {group.details.map(({ label, value }) => (
              <div className={styles.detail} key={label}>
                <dt className={styles.detailLabel}>{label}</dt>
                <dd className={styles.detailValue}>
                  {value || (
                    <span className={styles.emptyValue}>Sin datos</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
