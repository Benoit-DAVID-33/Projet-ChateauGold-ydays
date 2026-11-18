# Guide utilisateur

GOLD FX permet d'annoter des images et des vidéos, de les exporter, de les envoyer à un service de
traitement et de générer de nouveaux médias avec Kling AI. Ce guide décrit chaque écran.

## Compte

- **Créer un compte** : page « Créer un compte », avec un nom d'utilisateur (3 à 32 caractères :
  lettres, chiffres, `_`, `-`, `.`), un email et un mot de passe d'au moins 8 caractères.
- **Se connecter** : avec le nom d'utilisateur ou l'email. Après plusieurs échecs, la connexion
  est bloquée quelques minutes.
- **Profil et déconnexion** : menu « Profil » en haut à droite.

Les comptes de l'ancienne version sont repris par l'administrateur ; le mot de passe reste le
même.

## Navigation

| Page | Contenu |
|---|---|
| Accueil | présentation et accès rapide aux pages Vidéo et Image |
| Vidéo, Image | l'espace de travail : onglets **Atelier** et **Workflow** |
| Bibliothèque | tous vos médias (originaux, exports, résultats) et l'historique des générations |
| Recherche | réponse du service de traitement à une requête texte |
| Information, Contact | présentation du projet, formulaire de contact |

En haut des pages Vidéo et Image, la barre « Comment puis-je vous aider ? » accepte du texte ou
la dictée vocale (bouton micro, navigateurs compatibles) :

- **Entrée** ouvre la page Recherche avec votre texte ;
- **ENVOYER** transmet le média ouvert et votre texte au service de traitement (l'image annotée
  si elle contient des annotations). Sans média ouvert, ENVOYER ouvre la page Recherche.

## L'Atelier

L'Atelier reprend l'organisation de Stable Diffusion WebUI : ce que vous réglez à gauche, ce que
vous voyez au centre, ce que vous obtenez à droite.

```
+----------------------+---------------------------------------+----------------------+
| Outils d'édition     | Onglets de mode                       | Sorties              |
| Composition          | Canevas (média et annotations)        | Historique           |
| Paramètres           | Calques et chronologie                |                      |
| [ Générer ]          |                                       |                      |
+----------------------+---------------------------------------+----------------------+
```

Sur un écran de moins de 1100 pixels de large, les colonnes s'empilent : le canevas d'abord,
puis le prompt et les paramètres, puis les sorties. Les outils s'ouvrent alors dans un tiroir
avec le bouton « Outils » placé au-dessus du canevas.

### Charger un média

Sans média ouvert, le centre affiche une zone de dépôt : glissez un fichier ou cliquez sur
« Charger une image » (ou « Charger une vidéo »). Formats acceptés : JPG, PNG, GIF, WebP, BMP
(25 Mo au plus) ; MP4, MOV, WebM, MKV, AVI (500 Mo au plus). Une barre indique la progression.
Le média s'ouvre ensuite dans l'Atelier.

La colonne de droite propose aussi vos médias récents ; la Bibliothèque les liste tous.

### Onglets de mode

| Mode | Disponible | Ce qu'il fait |
|---|---|---|
| Annoter | avec un média ouvert | édition seule ; exporter, enregistrer ou envoyer à l'API de traitement |
| Image vers vidéo | avec une image ouverte | anime l'image avec Kling ; le prompt décrit le mouvement (facultatif) |
| Omni-Video | avec une vidéo ouverte | transforme la vidéo, ou s'en sert comme référence de style |
| Texte vers image | toujours | crée de une à neuf images à partir du prompt |
| Texte vers vidéo | toujours | crée une vidéo de 5 ou 10 secondes à partir du prompt |

Un onglet indisponible est grisé ; survolez-le pour connaître la raison. Les flèches gauche et
droite du clavier passent d'un onglet disponible à l'autre.

### Annoter

Les outils de la colonne de gauche s'appliquent au canevas :

- **Couleur** : palette de 19 couleurs, appliquée aux nouveaux éléments.
- **Formes** : carré, carré arrondi, rond, triangle, triangle inversé, losange, hexagone.
- **Lignes** : flèche, courbe, ligne torsadée.
- **Texte** : saisissez le texte et sa taille, cliquez sur « Activer le mode texte », puis cliquez
  sur le média pour le placer.
- **Dessin** : crayon, feutre et gomme, avec l'épaisseur du trait.
- **Objets 3D** : cube, bille, hexagone 3D ; Maj + glisser (ou « Faire tourner » dans le menu
  contextuel) pour les faire pivoter.

Sur le canevas :

- cliquer sélectionne un élément ; le faire glisser le déplace ; les poignées le redimensionnent ;
  la molette redimensionne l'élément sélectionné ;
- clic droit : menu contextuel (faire tourner un objet 3D, Motion Tracking sur une vidéo,
  supprimer) ;
- `Suppr` supprime la sélection, `Échap` quitte l'outil actif, les flèches déplacent la sélection
  (Maj : par pas de 10), `Ctrl+Z` et `Ctrl+Y` annulent et rétablissent ;
- zoom : boutons plus et moins, Ctrl + molette, double-clic ou « Réinitialiser le zoom ».

Sous le canevas :

- **Calques** : liste des éléments, du premier plan à l'arrière-plan. Cliquer une ligne
  sélectionne l'élément ; les boutons le déplacent d'un plan ou le suppriment.
- **Chronologie** (vidéos, à côté des calques) : une barre par élément indique quand il est visible. Faites glisser les
  bords pour changer le début ou la fin, ou la barre entière pour la déplacer. Cliquer sur la
  règle positionne la lecture. Les contrôles natifs de la vidéo restent utilisables.

Toutes les positions sont enregistrées dans la résolution d'origine du média : le zoom et la
taille de l'écran ne les faussent pas.

### Composition du prompt

Le bloc « Composition » sert à tous les modes :

- **Prompt** : ce que vous voulez obtenir. Le compteur indique la longueur du texte qui sera
  réellement envoyé (2 500 caractères au plus).
- **Prompt négatif** : ce qu'il faut éviter (générations Kling).
- **Inclure les annotations** : ajoute au prompt une description précise des éléments placés
  (type, position en pourcentage, taille, couleur, fenêtre temporelle sur une vidéo).
- **Aperçu du prompt final** : le texte envoyé, ou sa version anglaise structurée à coller dans
  un autre outil d'IA. Boutons « Copier », « Télécharger JSON » et « Voir JSON » (description
  complète des annotations).

### Paramètres et génération

En mode de génération, la colonne de gauche affiche les paramètres utiles au mode :

| Paramètre | Modes | Valeurs |
|---|---|---|
| Format | texte vers image, texte vers vidéo, Omni-Video en référence de style | 16:9, 9:16, 1:1, 4:3, 3:4, 3:2, 2:3, 21:9 |
| Durée | vidéos (sauf Omni-Video en transformation, qui suit la vidéo source) | 5 ou 10 secondes |
| Qualité | texte vers vidéo, image vers vidéo | Standard ou Pro (Omni-Video : toujours Pro) |
| Nombre d'images | texte vers image | 1 à 9 |
| Usage de la vidéo | Omni-Video | transformer la vidéo, ou référence de style |
| Conserver le son d'origine | Omni-Video | oui ou non |

Cliquez sur **Générer**. Le bouton reste grisé tant qu'il manque quelque chose (prompt vide,
prompt trop long) ; la raison est affichée dessous. « Tester la connexion Kling » vérifie la
configuration sans consommer de crédit.

La génération apparaît aussitôt dans la colonne **Sorties** avec son état. Kling met de quelques
secondes à quelques minutes ; vous pouvez continuer à travailler. Les résultats sont ajoutés à
votre bibliothèque et affichés dans la colonne, avec les liens « Ouvrir » et « Télécharger ».
Vous pouvez quitter la page : le serveur suit lui-même les générations en cours et range les
résultats dans votre bibliothèque dès qu'ils sont prêts. Une génération qui n'a pas abouti au bout
de 24 heures est déclarée en échec.

Pour Image vers vidéo et Omni-Video, c'est le média d'origine qui est transmis ; les annotations
sont décrites dans le prompt si la case est cochée.

### Exporter, enregistrer, envoyer (mode Annoter)

| Action | Image | Vidéo |
|---|---|---|
| Envoyer à l'API | envoie l'image (annotée s'il y a des annotations) et le prompt au service de traitement | envoie la vidéo et le prompt |
| Télécharger | PNG à la résolution d'origine, sans les poignées de sélection | vidéo entière avec les annotations incrustées, convertie en MP4 (H.264 et AAC) ; en cas d'échec de conversion, le fichier WebM est téléchargé |
| Enregistrer dans la bibliothèque | le PNG annoté devient un dérivé du média | le MP4 annoté devient un dérivé du média |

L'enregistrement d'une vidéo dure le temps de la vidéo ; la progression s'affiche et le bouton
« Annuler l'enregistrement » l'interrompt.

### Sorties et historique

- **Sorties** : ce que vous avez produit pendant la session (générations, exports enregistrés,
  résultats de traitement), du plus récent au plus ancien.
- **Historique** : les générations faites à partir du média ouvert (ou les plus récentes) et les
  résultats liés à ce média. **Réutiliser** recharge le mode, le prompt, le prompt négatif et les
  paramètres d'une génération passée.

### Supprimer un média

Bouton « Supprimer la vidéo » (ou « Supprimer l'image ») au-dessus du canevas, avec confirmation. Les
dérivés (exports, résultats) sont conservés dans la bibliothèque.

## Le Workflow

L'onglet **Workflow** enchaîne plusieurs étapes dans un graphe de nœuds, sur le modèle de
ComfyUI : par exemple générer une image à partir d'un texte, puis l'animer, puis afficher le
résultat. Il partage le média et les annotations de l'Atelier ; passer d'un onglet à l'autre ne
perd ni le graphe ni le travail en cours.

### Composer un graphe

- **Palette** (à gauche) : cliquez sur un nœud pour l'ajouter au centre, ou faites-le glisser sur
  le canevas.
- **Liens** : tirez une sortie (à droite d'un nœud) vers une entrée (à gauche d'un autre). La
  couleur des points indique le type : image, vidéo, texte ou média (image ou vidéo). Un lien
  incompatible est refusé ; une entrée n'accepte qu'un lien et les boucles sont interdites.
- **Paramètres** : chaque nœud affiche ses réglages (prompt, format, durée...).
- **Supprimer** : sélectionnez un nœud ou un lien puis `Suppr`. Au clavier, `Entrée` ou `Espace`
  sélectionne, les flèches déplacent, `Échap` annule.
- Zoom à la molette, déplacement du canevas en glissant le fond.

| Catégorie | Nœuds |
|---|---|
| Sources | Texte ; Média de la bibliothèque ; Média de l'Atelier (le média ouvert au moment de l'exécution) ; Image annotée de l'Atelier (exportée avec ses annotations et enregistrée) |
| Texte et IA | Assistant IA (prompt construit à partir d'une intention et des annotations de l'Atelier) ; Assembler du texte |
| Génération Kling | Texte vers image ; Texte vers vidéo ; Image vers vidéo ; Omni-Video |
| Traitement | API de traitement (média et consigne facultative) |
| Sortie | Sortie (aperçu du média, lien pour l'ouvrir) |

### Modèles

Le bouton **Modèles** propose des graphes prêts à l'emploi :

- **Texte vers image puis vidéo** : un prompt génère une image, qui est ensuite animée ;
- **Transformer la vidéo de l'Atelier** : l'Assistant IA décrit vos annotations, puis
  Omni-Video transforme la vidéo ouverte ;
- **Animer l'image annotée** : l'image annotée de l'Atelier est enregistrée puis animée ;
- **Traitement par l'API** : un média de la bibliothèque et une consigne sont envoyés au service
  de traitement.

### Exécuter

- **Exécuter** lance tout le graphe ; **Exécuter jusqu'ici** lance seulement le nœud sélectionné
  et ceux dont il dépend.
- Le graphe est d'abord vérifié (liens, entrées obligatoires, réglages). En cas de problème, rien
  n'est lancé et les nœuds concernés affichent le message.
- Les nœuds s'exécutent un par un ; chacun affiche son état (en attente, en cours avec
  progression, terminé, erreur, ignoré) et son résultat. Si un nœud échoue, ceux qui en dépendent
  sont ignorés ; les autres branches continuent.
- **Arrêter** interrompt l'exécution. Une génération déjà envoyée à Kling se poursuit : le
  serveur continue de la suivre et range ses résultats dans votre bibliothèque.
- Les médias produits sont enregistrés dans votre bibliothèque.

### Enregistrer et partager

- **Enregistrer** et **Enregistrer sous** conservent le graphe dans votre compte ; **Ouvrir**
  liste vos workflows (et permet d'en supprimer) ; **Nouveau** repart d'un graphe vide.
- **Exporter** télécharge le graphe en JSON ; **Importer** charge un fichier JSON (par exemple
  exporté par un collègue). Limites : 200 nœuds, 500 liens, 512 Ko.
- L'indicateur sous le nom signale les modifications non enregistrées.

## Bibliothèque

Tous vos médias, du plus récent au plus ancien, filtrables par type, avec leur origine (original,
traité, généré, export), leur taille et leur date ; « Charger plus de médias » affiche la suite.
Chaque carte permet d'ouvrir le média dans l'Atelier, de le télécharger ou de le supprimer. En bas
de page, l'historique des générations IA, lui aussi par pages (« Charger plus de générations »).

## Confidentialité

Vos médias, générations et workflows ne sont visibles que par vous. Pour Omni-Video, Kling reçoit
un lien temporaire (une heure) vers la seule vidéo concernée.
