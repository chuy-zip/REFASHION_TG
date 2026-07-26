"use client";

import { useState } from "react";
import { Menu, type MenuItem } from "@/components/ui/Menu/Menu";
import { DesignFormDialog } from "@/components/designs/DesignFormDialog/DesignFormDialog";
import { DeleteDesignButton } from "@/components/designs/DeleteDesignButton/DeleteDesignButton";
import type { Design } from "@/lib/types";

interface DesignActionsMenuProps {
  design: Design;
  /** owner/editor (or admin) of the parent client may edit and delete. */
  canEdit: boolean;
}

/** Groups a design's edit and delete behind a gear menu. */
export function DesignActionsMenu({ design, canEdit }: DesignActionsMenuProps) {
  const [action, setAction] = useState<null | "edit" | "delete">(null);

  const items: MenuItem[] = [
    {
      label: "Editar diseño",
      onSelect: () => setAction("edit"),
      disabled: !canEdit,
      disabledReason: "Tu rol en este cliente no permite editar el diseño.",
    },
    {
      label: "Eliminar diseño",
      onSelect: () => setAction("delete"),
      danger: true,
      disabled: !canEdit,
      disabledReason: "Tu rol en este cliente no permite eliminar el diseño.",
    },
  ];

  return (
    <>
      <Menu label="Opciones del diseño" header={design.name} items={items} />

      {action === "edit" && (
        <DesignFormDialog
          projectId={design.project_id}
          design={design}
          open
          onClose={() => setAction(null)}
        />
      )}

      {action === "delete" && (
        <DeleteDesignButton
          designId={design.id}
          designName={design.name}
          open
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}
