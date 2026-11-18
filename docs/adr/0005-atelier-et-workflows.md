# ADR 0005 : Atelier en trois colonnes et workflows à nœuds

- **Statut** : accepté
- **Contexte** : l'interface d'édition empilait l'éditeur, une rangée de boutons et trois
  panneaux latéraux (Outils, Assistant IA, Génération IA) qui se recouvraient. Le prompt et les
  paramètres de génération étaient saisis loin du résultat, et rien ne permettait d'enchaîner
  plusieurs étapes (générer une image puis l'animer, par exemple). Demande : une interface
  « entre Stable Diffusion et ComfyUI », sans emoji ni symbole décoratif.
- **Décision** :
  - **Atelier** par défaut, sur le modèle de Stable Diffusion WebUI : à gauche les outils, le
    prompt, les paramètres et l'action principale ; au centre les onglets de mode (Annoter, Image
    vers vidéo, Omni-Video, Texte vers image, Texte vers vidéo), le canevas, les calques et la
    chronologie ; à droite les sorties et l'historique. Sous 1100 pixels, les colonnes s'empilent et
    les outils passent dans un tiroir.
  - **Workflow** en second onglet, sur le modèle de ComfyUI : graphe de nœuds typés édité avec
    React Flow, exécuté dans le navigateur par un moteur indépendant de React, enregistré par
    utilisateur (`/api/workflows`).
  - Les règles qui dépendent du mode (paramètres visibles, requête envoyée, blocage) sont des
    fonctions pures (`features/atelier/model/modes.ts`) ; chaque type de nœud est un module
    découvert automatiquement (`features/workflow/nodes/*.node.tsx`).
- **Alternatives écartées** :
  - Exécuter les workflows côté serveur (file de tâches) : plus robuste pour de longues chaînes,
    mais demande un ordonnanceur, des workers et un modèle de reprise ; l'exécution dans le
    navigateur réutilise l'API existante et les mêmes contrôles d'accès. Le format du graphe
    permettra de basculer plus tard sans le modifier.
  - Bibliothèque de graphes maison : React Flow est maintenu, accessible au clavier, et couvre
    zoom, déplacement, sélection et poignées typées.
  - Conserver les panneaux latéraux en plus des colonnes : deux façons de faire la même chose.
    Le panneau Assistant IA et le panneau de génération ont été retirés ; seul le tiroir des
    outils subsiste, pour les petits écrans.
- **Conséquences** :
  - Une génération se lance depuis le mode correspondant ; ses résultats apparaissent dans la
    colonne Sorties et dans la bibliothèque.
  - Fermer l'onglet du navigateur interrompt un workflow en cours ; les générations déjà
    soumises continuent côté Kling et restent visibles dans l'historique.
  - Ajouter un fournisseur ou une étape revient à ajouter un mode ou un fichier de nœud, sans
    modifier l'existant.
