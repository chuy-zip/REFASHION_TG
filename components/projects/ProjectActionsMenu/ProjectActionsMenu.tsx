"use client";

import { useState } from "react";
import { Menu, type MenuItem } from "@/components/ui/Menu/Menu";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog/ProjectFormDialog";
import { DeleteProjectButton } from "@/components/projects/DeleteProjectButton/DeleteProjectButton";
import type { Project } from "@/lib/types";

interface ProjectActionsMenuProps {
  project: Project;
  /** owner/editor (or admin) may edit and delete a project. */
  canEdit: boolean;
}

/** Groups a project's edit and delete behind a gear menu. */
export function ProjectActionsMenu({
  project,
  canEdit,
}: ProjectActionsMenuProps) {
  const [action, setAction] = useState<null | "edit" | "delete">(null);

  const items: MenuItem[] = [
    {
      label: "Editar proyecto",
      onSelect: () => setAction("edit"),
      disabled: !canEdit,
      disabledReason: "Tu rol en este cliente no permite editar el proyecto.",
    },
    {
      label: "Eliminar proyecto",
      onSelect: () => setAction("delete"),
      danger: true,
      disabled: !canEdit,
      disabledReason: "Tu rol en este cliente no permite eliminar el proyecto.",
    },
  ];

  return (
    <>
      <Menu label="Opciones del proyecto" header={project.name} items={items} />

      {action === "edit" && (
        <ProjectFormDialog
          clientId={project.client_id}
          project={project}
          open
          onClose={() => setAction(null)}
        />
      )}

      {action === "delete" && (
        <DeleteProjectButton
          projectId={project.id}
          projectName={project.name}
          clientId={project.client_id}
          open
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}
