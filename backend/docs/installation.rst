Installation et utilisation
===========================

Installation
------------

.. code-block:: bash

   cd backend
   pip install -r requirements.txt          # execution
   pip install -r requirements-dev.txt      # outils de developpement

Configuration
-------------

Copier ``.env.example`` vers ``.env`` (a la racine du depot) et renseigner les
variables. ``SECRET_KEY`` est obligatoire.

Lancement
---------

.. code-block:: bash

   uvicorn main:app --reload --port 5000                       # developpement
   granian --interface asgi --host 0.0.0.0 --port 5000 main:app # production

Tests
-----

.. code-block:: bash

   python run_tests.py            # toute la suite
   pytest -m unit                 # tests unitaires
   pytest -m integration          # tests d'integration
   pytest -m functional           # tests fonctionnels
   pytest -m regression           # tests de non-regression
   pytest -m performance          # tests de performance (exclus par defaut)

Qualite
-------

.. code-block:: bash

   ruff check . && ruff format --check .
   mypy
   pylint server main.py external_api.py --fail-under=9.5
   bandit -q -r server main.py external_api.py
