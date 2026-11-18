# ADR 0003 : Annotations en pixels natifs du média

- **Statut** : accepté
- **Contexte** : la v1 stockait les annotations en pixels d'affichage : elles dérivaient au
  redimensionnement et au zoom, et les pourcentages envoyés à l'IA étaient faux.
- **Décision** : toutes les coordonnées sont exprimées dans le repère natif du média
  (naturalWidth / videoWidth). L'affichage applique une mise à l'échelle.
- **Conséquences** : exports à la résolution réelle, positions exactes dans les prompts, rendu
  indépendant du zoom et de l'écran.
