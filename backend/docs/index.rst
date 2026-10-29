Documentation technique du backend GOLD FX
==========================================

Cette documentation est generee automatiquement a partir des docstrings du
code (Sphinx + autodoc + napoleon).

.. toctree::
   :maxdepth: 2
   :caption: Sommaire

   installation
   architecture
   api

Pourquoi ce backend ?
---------------------

Le backend est une application **FastAPI** (ASGI) modulaire, issue d'un
refactoring d'un monolithe Flask. Les objectifs : fiabilite (tests),
performance (I/O asynchrone, cache), maintenabilite (modules, documentation),
et extensibilite (base de donnees et fournisseurs de modeles branchables).

Voir aussi le fichier ``backend/README.md`` pour le comparatif avant/apres et
les mesures de performance.
