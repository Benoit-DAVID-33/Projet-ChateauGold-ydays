/** Barre d'outils : fichier (nouveau, ouvrir, enregistrer, import/export, modèles) et exécution. */
import clsx from "clsx";
import {
  FileDown,
  FilePlus2,
  FileUp,
  FolderOpen,
  LayoutTemplate,
  Play,
  Save,
  SaveAll,
  Square,
  StepForward,
} from "lucide-react";

import { Button } from "@/shared/ui/Button";

import styles from "./Toolbar.module.css";

interface Props {
  name: string;
  dirty: boolean;
  running: boolean;
  saving: boolean;
  /** Un seul nœud sélectionné : « Exécuter jusqu'ici » est possible. */
  canRunToSelection: boolean;
  onNew(): void;
  onOpen(): void;
  onSave(): void;
  onSaveAs(): void;
  onImport(): void;
  onExport(): void;
  onTemplates(): void;
  onRun(): void;
  onRunToSelection(): void;
  onStop(): void;
}

export function Toolbar(props: Props) {
  const { running } = props;
  return (
    <div className={styles.toolbar} role="group" aria-label="Actions du workflow">
      <div className={styles.identity}>
        <h2 className={styles.name} title={props.name}>
          {props.name}
        </h2>
        <span className={clsx(styles.state, props.dirty && styles.dirty)} aria-live="polite">
          {props.dirty ? "Modifications non enregistrées" : "Enregistré"}
        </span>
      </div>

      <div className={styles.group} role="group" aria-label="Fichier">
        <Button size="sm" icon={<FilePlus2 aria-hidden />} onClick={props.onNew} disabled={running}>
          Nouveau
        </Button>
        <Button
          size="sm"
          icon={<FolderOpen aria-hidden />}
          onClick={props.onOpen}
          disabled={running}
        >
          Ouvrir
        </Button>
        <Button
          size="sm"
          icon={<Save aria-hidden />}
          onClick={props.onSave}
          loading={props.saving}
          disabled={running}
        >
          Enregistrer
        </Button>
        <Button
          size="sm"
          icon={<SaveAll aria-hidden />}
          onClick={props.onSaveAs}
          disabled={running || props.saving}
        >
          Enregistrer sous
        </Button>
        <Button size="sm" icon={<FileUp aria-hidden />} onClick={props.onImport} disabled={running}>
          Importer
        </Button>
        <Button size="sm" icon={<FileDown aria-hidden />} onClick={props.onExport}>
          Exporter
        </Button>
        <Button
          size="sm"
          icon={<LayoutTemplate aria-hidden />}
          onClick={props.onTemplates}
          disabled={running}
        >
          Modèles
        </Button>
      </div>

      <div className={styles.group} role="group" aria-label="Exécution">
        <Button
          size="sm"
          variant="primary"
          icon={<Play aria-hidden />}
          onClick={props.onRun}
          loading={running}
        >
          Exécuter
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<StepForward aria-hidden />}
          onClick={props.onRunToSelection}
          disabled={running || !props.canRunToSelection}
          title="Exécute le nœud sélectionné et les nœuds dont il dépend"
        >
          Exécuter jusqu'ici
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<Square aria-hidden />}
          onClick={props.onStop}
          disabled={!running}
        >
          Arrêter
        </Button>
      </div>
    </div>
  );
}
