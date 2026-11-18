# Assistant IA : prompts de l'Atelier

Réécriture de `prompt-generator.js` et du panneau « Assistant IA » des pages Vidéo et Image.

- `prompt/` : fonctions **pures** (ni React ni DOM), testées à l'unité.
- `components/PromptComposer.tsx` : bloc « Composition » **inline** de l'Atelier (bureau, colonne de 300
  à 340 px, style Stable Diffusion WebUI).
- `components/PromptPreview.tsx` et `JsonExportActions.tsx` : aperçu des deux prompts, copie et
  export JSON, utilisés par le bloc « Composition ».
- `lib/` : presse-papiers (avec repli) et téléchargement de fichier.

## Une seule source de vérité

`analyzeElements(elements, mediaInfo)` calcule une fois pour toutes, pour chaque élément visible :
pourcentages, zone, taille, couleur et fenêtre temporelle. Toutes les sorties sont rendues à partir de
ce résultat, elles ne peuvent donc pas se contredire.

| Sortie                    | Fonction                | Langue  | Usage                                                                                                                          |
| ------------------------- | ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Résumé des éléments       | `summarizeElements`     | FR      | « Composition actuelle », sur plusieurs lignes (export JSON)                                                                   |
| Description               | `describeElements`      | FR      | Sections FORMES GÉOMÉTRIQUES, OBJETS 3D, TEXTES, LIGNES/CONNECTEURS, TRACÉS À MAIN LEVÉE                                       |
| **Prompt envoyé**         | `buildSendPrompt`       | FR      | Texte transmis **tel quel** : intention, puis `Éléments placés sur la vidéo:` (ou `sur l'image:`), le repère et la description |
| **Prompt complet**        | `buildFullPrompt`       | EN      | Prompt structuré `=== VISUAL EFFECTS REQUEST… ===`, à coller dans un **autre** outil d'IA. Il n'est jamais envoyé              |
| Prompt final de l'Atelier | `composePrompt`         | FR / EN | Voir ci-dessous                                                                                                                |
| Export JSON               | `buildStructuredExport` | —       | Objet `version: 2`, avec descripteurs, résumé, description et les **deux** prompts                                             |

Dans l'aperçu, deux boutons radio (« Prompt envoyé » / « Prompt complet (EN) ») choisissent le texte
affiché. Une ligne d'aide explique à quoi il sert, et le bouton de copie copie **le texte affiché**.

## Bloc Prompt de l'Atelier (`PromptComposer`, `composePrompt`)

`composePrompt({ intent, includeAnnotations, elements, mediaInfo })` renvoie :

- `prompt` : le texte envoyé. C'est `buildSendPrompt(intent, elements, mediaInfo)` si la case
  « Inclure les annotations » est cochée et qu'au moins une annotation est visible, sinon
  l'intention rognée ;
- `fullPrompt` : le prompt anglais correspondant ;
- `summary` : le résumé compact sur une ligne (« 3 éléments : 1 forme, 1 texte, 1 ligne ») ;
- `ignored`, `annotationCount` et `annotationsIncluded` ;
- `length` (en points de code, comme `len()` côté backend) et `tooLong` (`length > 2500`, la
  limite `MAX_PROMPT_LENGTH` du backend).

`usePromptComposition` en est la version mémoïsée : la page s'en sert pour désactiver GÉNÉRER quand
`tooLong` est vrai.

`PromptComposer` est entièrement contrôlé par la page. Il affiche :

- le champ « Prompt », qui s'agrandit avec son contenu (360 px au plus), avec un compteur
  « N / 2500 caractères » portant sur le **prompt envoyé**, annotations comprises ;
- un avertissement explicite (`role="alert"`) quand ce prompt dépasse 2500 caractères ;
- le champ « Prompt négatif », plafonné à 2500 caractères ;
- la case « Inclure les annotations (N éléments) », désactivée sans annotation visible ;
- le résumé compact ;
- l'aperçu repliable « Aperçu du prompt final » : deux vues, Copier, Télécharger JSON, Voir JSON.

Dans l'export JSON, `prompts.send` et `prompts.full` suivent la case (option `includeAnnotations`).
Les annotations restent exportées comme données.

## Gabarits v1 sans emoji

Règle produit : **aucun emoji ni symbole décoratif** dans un texte visible, dans les prompts envoyés à
Kling ou dans l'export JSON.

- Les titres de section des gabarits perdent leurs emoji d'origine (le cercle vert de FORMES, l'équerre
  de LIGNES, le crayon de TRACÉS).
- Les puces rondes du résumé deviennent des tirets « - ».
- Les libellés de l'interface sont en texte simple : « Export structuré », « Voir JSON », « Copier et
  fermer », « Fermer ». Les confirmations et les erreurs n'ont plus d'emoji. Les icônes viennent de
  lucide-react et sont décoratives (`aria-hidden`).
- Le guillemet « », les points de suspension, les tirets et « × » (dimensions) sont conservés.
- Garde-fous : `noDecorativeSymbols.test.ts` (prompts, JSON et libellés) et un test DOM par
  composant (aperçus et modale ouverts).
- `STRUCTURED_EXPORT_VERSION` reste à 2 : seul le texte change, pas la forme du JSON.

## Règles de calcul

- Les coordonnées sont en **pixels natifs** du média (contrat `editor/model/types.ts`). Sans
  `mediaInfo`, on se replie sur une image 1280×720.
- Les pourcentages sont arrondis à 0,1, comme `toFixed(1)`. La **zone** (grille 3×3, seuils 33 / 66
  inclus dans « Centre ») et la **position** sont celles du **centre** de l'élément. La zone est
  calculée sur la valeur arrondie affichée, pour que le texte reste cohérent aux bornes.
- La **taille** est la moyenne de largeur % et hauteur % : < 10 très petit, < 20 petit, < 40 moyen,
  < 60 grand, sinon très grand.
- Un **texte** est ancré sur sa ligne de base gauche. Sa boîte est estimée à 0,6 × taille de police
  par glyphe, avec un jambage haut de 0,8 × taille.
- La **visibilité** : on ignore un élément si `endTime !== null && endTime <= startTime` (élément
  supprimé d'une vidéo), s'il commence après la fin d'une vidéo de durée connue, si c'est un texte
  vide ou un tracé sans point. Ces éléments sont comptés dans `summary.ignored`.

## Bugs d'origine corrigés (spec §7)

1. « Télécharger JSON » télécharge vraiment un fichier `elements_<timestamp>.json` (Blob + URL
   d'objet). Avant, il levait une `ReferenceError`.
2. Les pourcentages étaient faux dès que le média était affiché en dehors de 100 %. Ils sont
   maintenant calculés en pixels natifs.
3. La zone était calculée sur le coin haut-gauche. Elle l'est maintenant sur le centre.
4. La section 3D du prompt complet affichait toujours `Center (0.0%, 0.0%)`, `Medium`, rotation 0 et
   `N/A`. Elle est maintenant remplie avec les vrais champs.
5. `Color: Default` partout : chaque élément affiche maintenant sa vraie couleur (nom de la palette
   et hex).
6. Les éléments supprimés d'une vidéo étaient décrits et envoyés. Ils sont maintenant ignorés, et la
   fenêtre « de 2,0 s à 5,3 s » ou « jusqu'à la fin » est indiquée.
7. Le prompt copié et le prompt envoyé étaient différents, et l'utilisateur ne voyait jamais le
   prompt réellement envoyé. Les deux sont désormais affichés et nommés.
8. L'aperçu se rafraîchissait seulement à l'ajout d'un élément. Il est maintenant recalculé à chaque
   changement des props.
9. Le panneau ne s'ouvrait jamais sous 768 px. Il utilise maintenant `SidePanel` à
   `min(500px, 100vw)`.
10. La copie ignorait les erreurs et affichait `alert()`. Elle attend maintenant
    `navigator.clipboard`, se replie sur `execCommand`, et affiche un message éphémère, en succès
    comme en échec.
11. La modale JSON est maintenant un vrai `<dialog>` (`Modal`), et Échap la ferme sans fermer le
    panneau.
12. Plus aucun `innerHTML` ni `alert()`. Les erreurs d'envoi s'affichent dans le panneau.

## Changements intentionnels

- **Aperçu** : il affiche le prompt complet, sans la troncature à 300 caractères suivie de `...`. Le
  gabarit RÉSUMÉ / DISPOSITION / INTENTION est abandonné, car il répétait le résumé et l'intention.
  La vue par défaut est « Prompt envoyé ». Avant, « Copier le prompt » copiait toujours le prompt
  anglais : il faut maintenant choisir la vue « Prompt complet (EN) ».
- **Envoi** : le panneau « Assistant IA » est remplacé par le bloc « Composition » de l'Atelier ; l'envoi
  se fait par l'action principale de l'Atelier (Générer, ou Envoyer à l'API en mode Annoter).
- **Repère** : une ligne de légende est ajoutée, en français sous l'en-tête du prompt envoyé et en
  anglais sous `SPATIAL LAYOUT…`. Elle précise que les % sont mesurés au centre.
- **Prompt complet** : il indique la durée de la vidéo, la fenêtre de chaque élément et la couleur
  des objets 3D, des lignes et des tracés. Le style des lignes y est explicité. L'espace en fin de
  ligne `Location` de la section 3D est supprimé. Les zones restent en français, comme à l'origine.
- **Description FR** : elle utilise les libellés de l'éditeur (`Rond`, `Flèche`, `Cube`…) au lieu des
  clés techniques. Ajouts : couleur, fenêtre temporelle et tracés (feutre, crayon, gomme).
- **Résumé** : il ajoute « N tracé(s) à main levée » et le nombre d'éléments ignorés quand il y en a.
- **JSON v2** (sur-ensemble de l'objet d'origine) :
  - `positionPercent` est le centre de l'élément ;
  - nouveaux champs `boundsPercent`, `label`, `color`, `colorName`, `timing`, `prompts` et
    `summary.strokes` / `summary.ignored` ;
  - `mediaInfo` vaut `{kind, name, width, height, duration}`.

## Vérifications

```bash
npx vitest run src/features/assistant
npx eslint src/features/assistant --max-warnings 0
npx prettier --check "src/features/assistant/**/*.{ts,tsx,css}"
npx tsc -b
```
