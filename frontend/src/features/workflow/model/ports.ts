/**
 * Ports typés : ce qui circule sur un lien entre deux nœuds.
 *
 * - `image`, `video`, `text` : types concrets ;
 * - `media` : entrée générique acceptant une image OU une vidéo (et sortie
 *   dont le type exact n'est connu qu'à l'exécution, ex. API de traitement).
 */
export type PortType = "image" | "video" | "text" | "media";

export interface Port {
  /** Identifiant stable : handle React Flow et clé dans le graphe enregistré. */
  id: string;
  type: PortType;
  /** Libellé affiché sur le nœud. */
  label: string;
  /** Entrée facultative (ignoré pour les sorties). */
  optional?: boolean;
}

export const PORT_TYPES: readonly PortType[] = ["image", "video", "text", "media"];

export const PORT_TYPE_LABELS: Record<PortType, string> = {
  image: "Image",
  video: "Vidéo",
  text: "Texte",
  media: "Média (image ou vidéo)",
};

/** Une sortie de type `from` peut-elle alimenter une entrée de type `to` ? */
export function canConnect(from: PortType, to: PortType): boolean {
  if (from === to) return true;
  return to === "media" && (from === "image" || from === "video");
}

export function findPort(ports: readonly Port[], id: string | null | undefined): Port | undefined {
  return id == null ? undefined : ports.find((port) => port.id === id);
}
