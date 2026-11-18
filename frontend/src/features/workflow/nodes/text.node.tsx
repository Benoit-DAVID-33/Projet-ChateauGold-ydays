import { Type } from "lucide-react";

import { textValue } from "../model/values";
import { defineNode } from "./definition";
import { ParamTextArea } from "./fields";

export interface TextData {
  text: string;
}

/** Texte libre (prompt, intention) transmis aux nœuds suivants. */
export const node = defineNode<TextData>({
  type: "text",
  title: "Texte",
  category: "sources",
  description: "Saisissez un texte (prompt, intention) à transmettre aux nœuds suivants.",
  icon: Type,
  inputs: [],
  outputs: [{ id: "text", type: "text", label: "Texte" }],
  defaultData: { text: "" },
  Params: function TextParams({ data, onChange, disabled }) {
    return (
      <ParamTextArea
        label="Texte"
        value={data.text}
        rows={4}
        maxLength={2500}
        placeholder="Décrivez le résultat souhaité…"
        disabled={disabled}
        onChange={(text) => onChange({ text })}
      />
    );
  },
  async execute(_ctx, _inputs, data) {
    const text = String(data.text ?? "");
    return { outputs: { text: textValue(text) } };
  },
});
