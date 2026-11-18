# Éditeur d'annotations (`features/editor`)

Réécriture de `media-editor.js` (page vidéo) et de la copie inline de `image.html` (page
image), réunies en **une seule implémentation** pour les deux types de média.

Règle d'interface : aucun emoji ni symbole décoratif dans l'éditeur. Les pictogrammes sont
des icônes `lucide-react` (`aria-hidden`) accompagnées d'un texte ou d'un `aria-label`.

## API publique (`index.ts`)

```ts
<MediaEditor media={{ id, kind: "image" | "video", name, content_url }} ref={handle} className? />
<ToolsMenu open={open} onOpenChange={setOpen} />   // tiroir gauche (petits écrans)
<ToolsSidebar className? />                        // colonne d'outils permanente (Atelier)
<LayersPanel className? />                         // calques : sélection, ordre, suppression
<TimelinePanel className? />                       // chronologie (vidéo seulement)
useEditorStore(selector)                           // store zustand unique
```

`MediaEditorHandle` : `exportImage(): Promise<Blob>` (PNG natif), `recordVideo({ onProgress, signal })`
(WebM annoté, annulable), `getElements()`, `getMediaInfo()`.
Store : `elements`, `mediaInfo`, `currentTime`, `selectedId`, `tool`, `color`, `brushSize`,
`fontSize`, `history`, `notice`, `seekRequest`, et les actions (`addShape`, `deleteElement`,
`focusElement`, `bringForward`, `sendBackward`, `setElementTiming`, `requestSeek`, `undo`, `redo`, etc.).
Un changement de `media.id` ou de `content_url` remonte la surface et réinitialise le document.

### Demande de seek (chronologie et calques vers le lecteur)

`requestSeek(t)` borne `t` à `[0, durée]`, publie `seekRequest = { id, time }` et met
immédiatement `currentTime` à jour (curseur et visibilité suivent sans attendre). Le hook
`useSeekRequests` de `MediaEditor` applique la demande au `<video>` puis l'acquitte
(`consumeSeekRequest`). Le retour vers le store passe ensuite par `useVideoTimeSync`
(`seeking`, `seeked`, `timeupdate`). Sans vidéo montée, la demande reste en attente.

## Architecture

| Dossier        | Rôle                                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| `model/`       | Contrat (`types.ts`), géométrie, hit-test, poignées, transformations, temps, libellés   |
| `render/`      | Dessin pur sur une interface 2D minimale (`Ctx2D`) : un seul rendu écran **et** export  |
| `store/`       | zustand : éléments immuables, sélection, outils, temps vidéo, seek, historique (50)     |
| `interaction/` | Machine à états des gestes (pure) et hooks Pointer, clavier, molette, zoom, temps, seek |
| `export/`      | Composition PNG, enregistreur vidéo (MediaRecorder), capture audio                      |
| `components/`  | `MediaEditor`, `ToolsMenu`, `ToolsSidebar`, `LayersPanel`, `TimelinePanel`, menus       |

Les sous-panneaux d'outils (`components/tools/`) servent au tiroir (`variant="drawer"`) et à
la colonne (`variant="sidebar"` : grilles denses, palette dans sa propre section « Couleur »).

Coordonnées **toujours en pixels natifs** du média. Les constantes d'origine exprimées en
pixels écran (forme 100 px, ligne 160 px, poignées 8 et 12 px, tolérance ligne 15 px, minimum
20 px, police 12 à 72) sont converties via l'échelle d'affichage courante (zoom compris).

## Stratégie pointer-events (contrôles vidéo)

- Les écouteurs Pointer sont sur la **scène** (parent du média et du calque) : ils reçoivent
  les événements par bulle, que le calque soit actif ou non.
- Le calque `<canvas>` est `pointer-events: none` par défaut : **seek, volume, plein écran
  restent utilisables**, même avec une sélection.
- Il passe en `auto` seulement si : un outil est actif (texte, crayon, feutre, gomme,
  « Faire tourner » armé), un geste est en cours, ou la souris ou le stylet **survole** un
  élément ou une poignée (hit-test au `pointermove`). Là où un élément recouvre la barre de
  contrôles, l'élément est prioritaire ; le désélectionner ou le déplacer libère la zone.
- Tactile (pas de survol) : un appui sur le média est hit-testé à la scène ; s'il touche un
  élément, le geste démarre (`setPointerCapture` sur la scène), sinon l'appui va au lecteur.
  `touch-action: none` uniquement pendant une sélection ou un outil actif.
- Molette : redimensionne la sélection **seulement** si le pointeur est sur le média ;
  sinon la page défile. Ctrl ou Cmd + molette : zoom.

## Chronologie et calques

- Calques : ordre d'empilement (le premier est au-dessus), pastille de couleur, fenêtre
  temporelle en vidéo (« 2,0 s à 5,3 s » ou « 2,0 s jusqu'à la fin »). Un clic sélectionne
  (en vidéo, saut au début de l'élément s'il n'est pas visible). Mettre en avant, mettre en
  arrière et supprimer passent par l'historique.
- Chronologie : règle graduée (clic ou glisser pour déplacer la lecture, flèches au clavier),
  une barre par élément ; glisser un bord modifie le début ou la fin (bornés, 0,1 s minimum,
  une fin au bout de la vidéo devient « jusqu'à la fin »), glisser la barre la décale. Un
  glisser produit une seule entrée d'historique ; les bords sont des curseurs ARIA.

## Fonctionnalités d'origine couvertes

7 formes, 3 lignes (extrémités déplaçables), texte (saisie et taille 12 à 72), crayon, feutre,
gomme, « Désactiver », palette de 19 couleurs et épaisseur 1 à 20, 3 objets 3D (maths
d'origine) avec rotation Maj ou Alt + glisser ou « Faire tourner », sélection, déplacement,
8 poignées, molette (facteurs 1,1 et 0,9), menu contextuel (Faire tourner, Motion Tracking,
Supprimer), suppression horodatée en vidéo, zoom de 50 % à 500 % (boutons, Ctrl + molette,
double-clic), export PNG, enregistrement vidéo.

## Bugs d'origine corrigés

Formes invisibles à l'écran (récursion `drawShape`) ; texte redessiné à la taille globale ;
saut au déplacement d'une ligne ; glissement au minimum de 20 px ; hit-test sur boîte englobante
(rond, triangles, losange, hexagone) et sur le segment droit (courbe, zigzag) ; zigzag NaN ;
gomme qui sélectionnait ; slider d'épaisseur sans effet immédiat ; dessin libre volatil (désormais
des éléments `stroke` persistants) ; la gomme n'efface que le calque d'annotations ; export avec
annotations en double et poignées ; épaisseurs non mises à l'échelle ; temporalité ignorée
(rendu, hit-test, export et enregistrement respectent `[startTime, endTime)`) ; enregistrement sans
annotations, sans pause, un seul nœud audio ; contrôles vidéo inutilisables ; zoom désynchronisé du
calque et débordement haut et gauche inaccessible ; menus laissant un voile bloquant ; Texte et
Crayon inaccessibles ; canvas flou en HiDPI ; coordonnées faussées au redimensionnement.

## Changements volontaires

- La couleur choisie s'applique à **tout** nouvel élément (formes, 3D, lignes, texte, dessin).
- « Épaisseur » est le diamètre du trait pour crayon, feutre et gomme (l'original : un rayon).
- Le feutre trace un trait continu (mode multiply, opacité 0,3) au lieu de disques isolés.
- `alert()` remplacés par un bandeau non bloquant (mêmes textes français).
- Emojis et symboles d'origine (boutons des objets 3D, zoom, « Activer le mode texte »)
  remplacés par des icônes et du texte.
- Nouveautés : annuler et rétablir, raccourcis (Suppr, Échap, Ctrl+Z, Ctrl+Maj+Z ou Ctrl+Y,
  flèches, Maj+F10), bouton « Actions de l'élément », badge Motion Tracking à l'écran (jamais
  exporté), calques et chronologie.
- Suppression en vidéo d'un élément non visible à l'instant courant : retrait définitif
  (tronquer n'aurait aucun effet, voire prolongerait la fenêtre).
- « Motion Tracking » proposé pour les vidéos uniquement ; objets 3D disponibles aussi sur image.
- Double-clic : zoom 100 %. « Réinitialiser le zoom » : zoom 100 %, retour à 0 et lecture
  (comme `zoom.js`).
- Pas d'`autoplay` (souvent bloqué sans `muted`) ; le texte est stocké en ligne de base gauche.
- Tracés : sélectionnables, déplaçables et supprimables (pas de poignées) ; la gomme ne l'est pas.

## Tests

`npx vitest run src/features/editor` : géométrie et hit-test par type, transformations, temps
et libellés, store (sémantique image et vidéo, historique, seek, ordre), rendu sur contexte
d'enregistrement, export et enregistreur (environnement simulé), composants (jsdom) dont un
test vérifiant l'absence d'emoji et de symboles décoratifs dans le texte affiché.
