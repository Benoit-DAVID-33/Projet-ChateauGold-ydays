/**
 * Copie dans le presse-papiers avec repli.
 *
 * La version d'origine appelait `navigator.clipboard.writeText` sans attendre
 * la promesse ni gérer l'échec (contexte non sécurisé, permission refusée).
 * Ici : API asynchrone d'abord, puis repli `execCommand("copy")` sur une zone
 * de texte temporaire ; le résultat (succès/échec) est toujours renvoyé.
 */
export async function copyText(text: string): Promise<boolean> {
  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Contexte non sécurisé ou permission refusée : on tente le repli.
    }
  }
  return legacyCopy(text);
}

/** Repli historique : sélection d'une zone de texte hors écran + `execCommand`. */
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;

  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // Dans une fenêtre modale (<dialog> en haut de pile), le reste de la page est
  // inerte : la zone temporaire doit être insérée dans la modale elle-même.
  const host = previousFocus?.closest("dialog") ?? document.body;

  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  Object.assign(area.style, { position: "fixed", top: "0", left: "-9999px", opacity: "0" });
  host.appendChild(area);
  area.focus();
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    previousFocus?.focus();
  }
}
