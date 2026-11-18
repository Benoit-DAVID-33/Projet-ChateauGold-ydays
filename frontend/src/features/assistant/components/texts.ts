/**
 * Libellés de l'Assistant IA (repris de video.html / image.html d'origine).
 * Règle : aucun emoji ni symbole décoratif dans un texte visible ; les icônes
 * sont des composants lucide-react décoratifs (aria-hidden).
 */
export const ASSISTANT_TEXT = {
  title: "Gestionnaire de Prompts",
  summaryTitle: "Résumé des éléments",
  summaryEmpty: "Aucun élément ajouté...",
  intentLabel: "Ce que vous voulez faire?",
  intentPlaceholder:
    "Ex: 'Ajouter des lueurs subtiles autour des formes', 'Créer un effet de profondeur 3D', 'Animer les textes avec un fondu', etc...",
  intentRequired:
    "Veuillez décrire ce que vous voulez faire dans le champ « Ce que vous voulez faire? ».",
  previewTitle: "Aperçu du prompt",
  previewEmpty: "Ajoutez des éléments pour voir le prompt...",
  previewViewLegend: "Prompt affiché",
  viewSend: "Prompt envoyé",
  viewFull: "Prompt complet (EN)",
  copy: "Copier le prompt",
  copied: "Prompt copié dans le presse-papiers.",
  copyFailed: "Copie impossible : sélectionnez le texte de l'aperçu puis Ctrl+C.",
  exportTitle: "Export structuré",
  download: "Télécharger JSON",
  downloadFailed: "Téléchargement impossible.",
  viewJson: "Voir JSON",
  jsonTitle: "Données JSON",
  jsonCopyAndClose: "Copier et fermer",
  jsonClose: "Fermer",
  jsonCopied: "JSON copié dans le presse-papiers.",
  jsonCopyFailed: "Copie impossible : le texte est sélectionné, utilisez Ctrl+C.",
  sendDefault: "Envoyer à l'API",
  sendFailed: "Erreur lors de l'envoi",
} as const;

/** Libellés du bloc « Composition » inline de l'Atelier (style Stable Diffusion WebUI). */
export const COMPOSER_TEXT = {
  region: "Composition du prompt",
  prompt: "Prompt",
  promptPlaceholder:
    "Décrivez la transformation voulue. Ex : ajouter des lueurs subtiles autour des formes, animer les textes avec un fondu…",
  negative: "Prompt négatif",
  negativePlaceholder: "Ce qu'il faut éviter. Ex : flou, texte déformé, artefacts…",
  previewToggle: "Aperçu du prompt final",
  copy: "Copier",
  generateLabel: "Générer",
} as const;

/** « 1 élément » / « 3 éléments ». */
export function elementCount(count: number): string {
  return `${count} ${count > 1 ? "éléments" : "élément"}`;
}

/** Libellé de la case « Inclure les annotations (N éléments) ». */
export function includeAnnotationsLabel(count: number): string {
  return `Inclure les annotations (${elementCount(count)})`;
}

/** Compteur « 1234 / 2500 caractères ». */
export function characterCounter(length: number, max: number): string {
  return `${length} / ${max} caractères`;
}

/** Avertissement quand le prompt envoyé dépasse la limite du backend. */
export function tooLongWarning(length: number, max: number, annotationsIncluded: boolean): string {
  const advice = annotationsIncluded
    ? "Raccourcissez le prompt ou décochez « Inclure les annotations »."
    : "Raccourcissez le prompt.";
  return `Le prompt envoyé fait ${length} caractères, au-delà de la limite de ${max}. ${advice}`;
}

/** Explique, sous l'aperçu, à quoi sert le prompt affiché. */
export function viewHint(view: "send" | "full", sendLabel: string): string {
  return view === "send"
    ? `Texte transmis tel quel par « ${sendLabel} » : votre intention suivie de la description des éléments.`
    : `Prompt structuré en anglais, à coller dans un autre outil d'IA. Il n'est pas transmis par « ${sendLabel} ».`;
}
