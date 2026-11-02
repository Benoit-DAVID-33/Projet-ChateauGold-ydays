"""Briques transverses, sans logique metier.

- ``caching``         : cache memoire TTL, gzip selectif, cache des fichiers statiques ;
- ``http_clients``    : clients httpx partages (pool keep-alive), fermes a l'arret ;
- ``request_context`` : X-Request-ID et Server-Timing sur chaque reponse ;
- ``auth_deps``       : dependances d'authentification (utilisateur, page, admin) ;
- ``templating``      : rendu Jinja2 (contexte commun, ETag) ;
- ``forms``           : lecture typee des formulaires.
"""
