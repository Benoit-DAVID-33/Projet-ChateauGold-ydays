# Workflow

Éditeur de graphes à nœuds, dans l'esprit de ComfyUI : on relie des médias, des
textes et des étapes IA (Assistant, Kling, API de traitement), puis on exécute
le pipeline. Rendu par React Flow (`@xyflow/react`), état dans un magasin zustand,
moteur d'exécution en TypeScript pur.

## Intégration

```tsx
import { WorkflowEditor, type WorkflowHost } from "@/features/workflow";

<div style={{ height: "calc(100vh - var(--header-h))" }}>
  <WorkflowEditor host={host} />
</div>;
```

- Le parent doit avoir une **hauteur définie** : l'éditeur occupe 100 % (520 px minimum).
- Un `QueryClientProvider` doit être présent (c'est le cas dans l'application).
- `host` est facultatif. Il expose le média ouvert dans l'Atelier, ses annotations,
  `mediaInfo` et `exportAnnotatedImage()`. Sans hôte, les nœuds « Média de
  l'Atelier » et « Image annotée de l'Atelier » sont signalés invalides, et
  l'Assistant IA transmet l'intention telle quelle.
- `services` (facultatif) remplace l'API HTTP : utile pour les tests.
- Le magasin est unique au niveau du module : le graphe en cours et une
  exécution lancée survivent au démontage de l'onglet.

## Concepts

- **Nœud** : un type déclaré dans `nodes/<nom>.node.tsx` (titre, catégorie,
  ports, paramètres, exécuteur).
- **Port typé** : `image`, `video`, `text`, ou `media` (entrée acceptant image ou
  vidéo). Une sortie `image` ou `video` peut alimenter une entrée `media` ; sinon
  les types doivent être identiques. Une entrée accepte un seul lien (un nouveau
  lien remplace l'ancien) et les boucles sont refusées dès la connexion.
- **Ports dynamiques** : `inputs` et `outputs` peuvent dépendre des paramètres
  (ex. « Média de la bibliothèque » sort une image ou une vidéo selon le média
  choisi). Les liens devenus incompatibles sont retirés automatiquement.

## Schéma du graphe enregistré

```json
{
  "version": 1,
  "nodes": [
    { "id": "n1", "type": "text", "position": { "x": 0, "y": 0 }, "data": { "text": "..." } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "sourceHandle": "text", "target": "n2", "targetHandle": "prompt" }
  ]
}
```

`data` contient les paramètres du nœud ; `sourceHandle` et `targetHandle` sont
les identifiants des ports. Limites (vérifiées aussi côté client par
`parseWorkflowGraph`) : version 1, au plus 200 nœuds, 500 liens et 512 Ko ; nom
de 1 à 120 caractères. L'import et l'export JSON utilisent exactement ce schéma.
`graphToFlow` et `flowToGraph` convertissent vers et depuis l'état React Flow.

## Ajouter un type de nœud

1. Créer `nodes/mon-noeud.node.tsx` : il est découvert automatiquement par le
   registre (`import.meta.glob`), aucun autre fichier n'est à modifier.
2. Exporter `node = defineNode<MesParametres>({ ... })` avec :
   - `type` (identifiant stable, enregistré dans les graphes), `title`,
     `category` (`sources`, `text`, `kling`, `processing`, `output`),
     `description`, `icon` (icône lucide-react) ;
   - `inputs` / `outputs` : liste de ports `{ id, type, label, optional? }`, ou
     fonction des paramètres ;
   - `defaultData` : paramètres par défaut (toujours fusionnés avec `data`) ;
   - `Params` : composant de paramètres (`ParamSelect`, `ParamTextArea`… de
     `nodes/fields.tsx`), ou `null` ;
   - `execute(ctx, inputs, data, signal)` : renvoie `{ outputs, message?, preview?, mediaIds? }`,
     une valeur par port de sortie ;
   - facultatif : `validate(data, { host })` (erreurs de configuration) et
     `initialData(host)` (paramètres à la création).
3. Dans l'exécuteur, n'utiliser que `ctx.api` et `ctx.host` (jamais d'import
   direct de l'API), lire les entrées avec `textInput` / `mediaInput`, signaler
   l'avancement par `ctx.reportProgress`, et respecter `signal`.
4. Ajouter des tests de l'exécuteur avec `fakeServices()` et `makeContext()`
   (`test/fakes.ts`).

## Sémantique d'exécution

1. **Portée** : tout le graphe (« Exécuter »), ou le nœud sélectionné et ses
   ancêtres (« Exécuter jusqu'ici »).
2. **Validation** de la portée : types inconnus, liens orphelins, ports
   inconnus, types incompatibles, entrées multiples, entrées obligatoires
   manquantes, boucles et configuration des nœuds. En cas d'erreur, rien n'est
   exécuté et les nœuds fautifs passent en « Erreur » avec le message.
3. **Ordre** topologique déterministe (à égalité, l'ordre des nœuds dans le
   graphe) ; les nœuds s'exécutent un par un.
4. **États** : `idle`, `queued`, `running` (message et progression), `done`,
   `error`, `skipped`. Un nœud dont une entrée n'a pas abouti est ignoré ; les
   branches indépendantes continuent. Les sorties produites sont vérifiées
   contre les types déclarés.
5. **Arrêt** : le nœud en cours est interrompu, les suivants sont ignorés. Une
   tâche Kling déjà envoyée peut se terminer côté serveur (historique).
6. **Kling** : création de la tâche, suivi toutes les 5 s (séquentiel) jusqu'à
   réussite ou échec, abandon après 30 min ; le premier média est transmis, tous
   les identifiants restent visibles dans le nœud.

## Organisation

- `model/` : ports, valeurs, schéma du graphe, conversion React Flow.
- `engine/` : validation, tri topologique, exécution (sans React).
- `nodes/` : définitions des nœuds, registre, aide Kling, champs de paramètres.
- `state/` : magasin zustand et opérations pures sur le graphe.
- `templates/` : modèles prêts à l'emploi.
- `components/` : éditeur, nœud, palette, barre d'outils, boîtes de dialogue.
- `test/` : doubles de test et compléments jsdom pour React Flow.
