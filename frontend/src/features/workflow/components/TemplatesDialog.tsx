/** Choix d'un modèle de workflow prêt à l'emploi. */
import { LayoutTemplate } from "lucide-react";

import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";

import type { WorkflowTemplate } from "../templates/templates";
import styles from "./Dialogs.module.css";

interface Props {
  open: boolean;
  templates: readonly WorkflowTemplate[];
  onPick(template: WorkflowTemplate): void;
  onClose(): void;
}

export function TemplatesDialog({ open, templates, onPick, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Modèles de workflow">
      <ul className={styles.list} aria-label="Modèles disponibles">
        {templates.map((template) => (
          <li key={template.id} className={styles.item}>
            <div className={styles.itemText}>
              <span className={styles.itemName}>{template.name}</span>
              <span className={styles.itemMeta}>{template.description}</span>
            </div>
            <div className={styles.itemActions}>
              <Button
                size="sm"
                variant="ghost"
                icon={<LayoutTemplate aria-hidden />}
                aria-label={`Utiliser le modèle « ${template.name} »`}
                onClick={() => onPick(template)}
              >
                Utiliser
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
