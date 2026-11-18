/** Liste des workflows enregistrés : ouverture et suppression (avec confirmation). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Trash2 } from "lucide-react";
import { useState } from "react";

import { errorMessage, type WorkflowSummary } from "@/shared/api/client";
import { Button } from "@/shared/ui/Button";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Modal } from "@/shared/ui/Modal";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import type { WorkflowServices } from "../services";
import styles from "./Dialogs.module.css";
import { workflowKeys } from "./runtime";

interface Props {
  open: boolean;
  services: WorkflowServices;
  /** Identifiant du workflow ouvert dans l'éditeur (mis en évidence). */
  currentId: string | null;
  onOpen(summary: WorkflowSummary): void;
  onDeleted(id: string): void;
  onClose(): void;
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export function OpenDialog({ open, services, currentId, onOpen, onDeleted, onClose }: Props) {
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<WorkflowSummary | null>(null);
  const list = useQuery({
    queryKey: workflowKeys.list(),
    queryFn: () => services.workflows.list(),
    enabled: open,
  });
  const remove = useMutation({
    mutationFn: (id: string) => services.workflows.remove(id),
    onSuccess: (_data, id) => {
      onDeleted(id);
      setToDelete(null);
      return queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });

  return (
    <>
      <Modal open={open} onClose={onClose} title="Ouvrir un workflow">
        {list.isPending && <StatusMessage tone="loading">Chargement des workflows…</StatusMessage>}
        {list.isError && <StatusMessage tone="error">{errorMessage(list.error)}</StatusMessage>}
        {list.isSuccess && list.data.length === 0 && (
          <StatusMessage tone="info">Aucun workflow enregistré pour le moment.</StatusMessage>
        )}
        {list.isSuccess && list.data.length > 0 && (
          <ul className={styles.list} aria-label="Workflows enregistrés">
            {list.data.map((workflow) => (
              <li key={workflow.id} className={styles.item}>
                <div className={styles.itemText}>
                  <span className={styles.itemName}>
                    {workflow.name}
                    {workflow.id === currentId && <span className={styles.current}> (ouvert)</span>}
                  </span>
                  <span className={styles.itemMeta}>
                    Modifié le {dateFormat.format(new Date(workflow.updated_at))}
                  </span>
                </div>
                <div className={styles.itemActions}>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<FolderOpen aria-hidden />}
                    aria-label={`Ouvrir « ${workflow.name} »`}
                    onClick={() => onOpen(workflow)}
                  >
                    Ouvrir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Trash2 aria-hidden />}
                    aria-label={`Supprimer « ${workflow.name} »`}
                    onClick={() => {
                      remove.reset();
                      setToDelete(workflow);
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer le workflow ?"
        confirmLabel="Supprimer"
        danger
        pending={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      >
        <p className={styles.confirmText}>
          « {toDelete?.name} » sera définitivement supprimé. Cette action est irréversible.
        </p>
        {remove.isError && <StatusMessage tone="error">{errorMessage(remove.error)}</StatusMessage>}
      </ConfirmDialog>
    </>
  );
}
