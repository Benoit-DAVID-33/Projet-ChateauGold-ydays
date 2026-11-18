import { useMemo } from "react";

import { composePrompt, type ComposePromptInput, type PromptComposition } from "../prompt/compose";

/**
 * `composePrompt` mémoïsé pour l'Atelier : le bloc « Composition » et le bouton
 * GÉNÉRER partagent ainsi le même prompt final et le même indicateur
 * `tooLong` (envoi à bloquer au-delà de 2500 caractères).
 */
export function usePromptComposition({
  intent,
  includeAnnotations,
  elements,
  mediaInfo,
}: ComposePromptInput): PromptComposition {
  return useMemo(
    () => composePrompt({ intent, includeAnnotations, elements, mediaInfo }),
    [intent, includeAnnotations, elements, mediaInfo],
  );
}
