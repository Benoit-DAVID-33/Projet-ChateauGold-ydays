# ADR 0002 : Sessions opaques en cookie plutôt que JWT dans le navigateur

- **Statut** : accepté
- **Contexte** : SPA et API servies sur la même origine (nginx). Besoin de déconnexion effective et
  de ne pas exposer de jeton au JavaScript (XSS).
- **Décision** : jeton aléatoire en cookie `HttpOnly; Secure; SameSite=Lax`, seul son hash est en
  base ; protection CSRF par double-submit.
- **Conséquences** : déconnexion et révocation immédiates ; aucun secret lisible par le JS. Une
  requête base par appel authentifié (négligeable à cette échelle ; un cache est possible).
