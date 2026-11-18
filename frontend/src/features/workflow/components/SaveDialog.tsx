/** Saisie du nom pour « Enregistrer » (premier enregistrement) et « Enregistrer sous ». */
import { Save } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { Modal } from "@/shared/ui/Modal";
import { StatusMessage } from "@/shared/ui/StatusMessage";

import { WORKFLOW_NAME_MAX_LENGTH, workflowNameError } from "../model/graph";

interface Props {
  open: boolean;
  title: string;
  initialName: string;
  pending: boolean;
  error: string | null;
  onSubmit(name: string): void;
  onClose(): void;
}

export function SaveDialog(props: Props) {
  // Le formulaire est remonté à chaque ouverture : le nom repart de `initialName`.
  return props.open ? <SaveForm {...props} /> : null;
}

function SaveForm({ open, title, initialName, pending, error, onSubmit, onClose }: Props) {
  const formId = useId();
  const inputId = useId();
  const [name, setName] = useState(initialName);
  const [touched, setTouched] = useState(false);
  const nameError = workflowNameError(name);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!nameError) onSubmit(name);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            icon={<Save aria-hidden />}
            loading={pending}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <Field
          label="Nom du workflow"
          id={inputId}
          hint={
            touched && nameError ? nameError : `${WORKFLOW_NAME_MAX_LENGTH} caractères maximum.`
          }
        >
          <input
            id={inputId}
            value={name}
            maxLength={WORKFLOW_NAME_MAX_LENGTH + 20}
            autoFocus
            aria-invalid={touched && Boolean(nameError)}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
      </form>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
    </Modal>
  );
}
