import { Combine } from "lucide-react";

import { textValue } from "../model/values";
import { defineNode } from "./definition";
import { ParamSelect, ParamText } from "./fields";
import { textInput } from "./inputs";

export type SeparatorKind = "blank-line" | "newline" | "space" | "comma" | "custom";

export interface ConcatTextData {
  separator: SeparatorKind;
  /** Séparateur libre (« Personnalisé »). */
  custom: string;
}

const SEPARATORS: Record<Exclude<SeparatorKind, "custom">, string> = {
  "blank-line": "\n\n",
  newline: "\n",
  space: " ",
  comma: ", ",
};

const SEPARATOR_OPTIONS = [
  { value: "blank-line", label: "Ligne vide" },
  { value: "newline", label: "Retour à la ligne" },
  { value: "space", label: "Espace" },
  { value: "comma", label: "Virgule" },
  { value: "custom", label: "Personnalisé" },
];

export function separatorOf(data: ConcatTextData): string {
  return data.separator === "custom" ? data.custom : (SEPARATORS[data.separator] ?? "\n\n");
}

/** Assemble deux textes (les parties vides sont ignorées). */
export const node = defineNode<ConcatTextData>({
  type: "concat-text",
  title: "Assembler du texte",
  category: "text",
  description: "Assemble deux textes avec un séparateur.",
  icon: Combine,
  inputs: [
    { id: "a", type: "text", label: "Texte A" },
    { id: "b", type: "text", label: "Texte B" },
  ],
  outputs: [{ id: "text", type: "text", label: "Texte" }],
  defaultData: { separator: "blank-line", custom: " - " },
  Params: function ConcatTextParams({ data, onChange, disabled }) {
    return (
      <>
        <ParamSelect
          label="Séparateur"
          value={data.separator}
          options={SEPARATOR_OPTIONS}
          disabled={disabled}
          onChange={(separator) => onChange({ separator: separator as SeparatorKind })}
        />
        {data.separator === "custom" && (
          <ParamText
            label="Séparateur personnalisé"
            value={data.custom}
            maxLength={200}
            disabled={disabled}
            onChange={(custom) => onChange({ custom })}
          />
        )}
      </>
    );
  },
  async execute(_ctx, inputs, data) {
    const parts = [textInput(inputs, "a"), textInput(inputs, "b")].filter((part) => part.trim());
    const text = parts.join(separatorOf(data));
    return { outputs: { text: textValue(text) }, preview: textValue(text) };
  },
});
