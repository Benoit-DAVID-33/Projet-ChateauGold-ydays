/**
 * Téléchargement d'un texte sous forme de fichier (Blob + URL d'objet).
 *
 * Corrige « Télécharger JSON » de la page Vidéo d'origine, qui levait une
 * ReferenceError (`blob` jamais défini) et ne téléchargeait rien.
 */
export function downloadTextFile(
  content: string,
  filename: string,
  mimeType = "application/json",
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  // Lien attaché au document : requis par Firefox pour déclencher le téléchargement.
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Révocation différée : certains navigateurs lisent l'URL après le clic.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
