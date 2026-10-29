Architecture
============

Modules du paquet ``server``
----------------------------

.. list-table::
   :header-rows: 1

   * - Module
     - Responsabilite
   * - ``config``
     - Configuration (variables d'environnement, chemins)
   * - ``caching``
     - Cache memoire, compression gzip selective, cache statique
   * - ``security``
     - Facade utilisateurs (hachage, authentification, cache)
   * - ``db``
     - Persistance SQLAlchemy (contrat, modele, repository, seed)
   * - ``deps``
     - Dependances d'authentification (401 / redirection)
   * - ``schemas``
     - Modeles Pydantic (validation des corps de requete)
   * - ``forms``
     - Lecture typee des champs de formulaire
   * - ``http``
     - Fabrique de clients HTTP asynchrones partages
   * - ``kling``
     - Client async de l'API Kling (JWT, erreurs typees)
   * - ``llm``
     - Proxy multi-fournisseurs (routeur, quotas, providers)
   * - ``emoji``
     - Studio emoji backend (donnees, recherche, plan de calques)
   * - ``prompting``
     - Amelioration de prompt (prompt engineering video-to-video)
   * - ``mailer``
     - Envoi d'emails SMTP dans un thread
   * - ``media_tools``
     - Helpers medias (extensions, chemins surs, FFmpeg)
   * - ``templating``
     - Rendu Jinja2 + compatibilite Flask (url_for, flash, ETag)
   * - ``routers``
     - Endpoints HTTP (auth, pages, media, kling, llm)

Principes de conception
-----------------------

- **KISS** : solutions les plus simples possibles, interfaces minimales.
- **YAGNI** : pas de code pour des cas hypothetiques.
- **Moindre surprise** : le comportement est celui auquel on s'attend.
- **Compartimentalisation** : un module = une responsabilite ; le reste du code
  ne connait que les interfaces (``Provider``, ``UserStore``).
