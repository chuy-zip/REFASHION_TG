"use client";

import { useState } from "react";
import { ClientActionsMenu } from "@/components/clients/ClientActionsMenu/ClientActionsMenu";
import { AddMemberDialog } from "@/components/clients/AddMemberDialog/AddMemberDialog";
import { MembersSection } from "@/components/clients/MembersSection/MembersSection";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog/ProjectFormDialog";
import { ProjectsSection } from "@/components/projects/ProjectsSection/ProjectsSection";
import { AssetsSection } from "@/components/assets/AssetsSection/AssetsSection";
import type { AssetWithUrl } from "@/lib/assets";
import type { ClientContents } from "@/lib/clients";
import type { ProjectSamples } from "@/lib/designs";
import type { ClientMemberView } from "@/lib/members";
import type { Client, Project } from "@/lib/types";
import styles from "./ClientDetailView.module.css";

type Tab = "info" | "members" | "projects" | "assets";

const TABS: { id: Tab; label: string }[] = [
  { id: "info", label: "Información" },
  { id: "members", label: "Miembros" },
  { id: "projects", label: "Proyectos" },
  { id: "assets", label: "Recursos" },
];

interface ClientDetailViewProps {
  client: Client;
  canEdit: boolean;
  canDelete: boolean;
  members: ClientMemberView[];
  canManageMembers: boolean;
  /** What deleting this client would destroy; null when it could not be read. */
  contents: ClientContents | null;
  /** The current page of projects, with their sample strips. */
  projects: Project[];
  projectsTotal: number;
  projectsPage: number;
  projectsQuery: string;
  samplesByProject: Map<string, ProjectSamples>;
  assets: AssetWithUrl[];
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
  currentUserId,
}: ClientDetailViewProps) {
  const [tab, setTab] = useState<Tab>("info");

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
        <nav className={styles.tabs} aria-label="Secciones del cliente">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={styles.tab}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
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
          />
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
