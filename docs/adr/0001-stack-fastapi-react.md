# ADR 0001 : FastAPI + React/TypeScript plutôt que Flask + JS inline

- **Statut** : accepté
- **Contexte** : la v1 mélangeait routes, logique et accès disque dans un `app.py` de 600 lignes, et
  ~6 500 lignes de JavaScript dans des templates (deux copies divergentes de l'éditeur). Aucune
  frontière testable, aucun typage.
- **Décision** : backend FastAPI (typage, validation Pydantic, OpenAPI généré) en couches ;
  frontend React + TypeScript strict avec Vite.
- **Conséquences** : le contrat d'API est généré et vérifié en CI ; le code est typé de bout en
  bout ; l'équipe reste sur Python côté serveur. Coût : un build front (Vite) et deux conteneurs.
