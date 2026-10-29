"""Configuration Sphinx de la documentation du backend GOLD FX.

Generation (depuis ``backend/``) :

    pip install -r requirements-dev.txt
    sphinx-build -b html docs docs/_build/html

Le resultat est ecrit dans ``docs/_build/html/index.html``.
"""

import sys
from pathlib import Path

# Rend le paquet ``server`` importable par autodoc.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

project = "GOLD FX - Backend"
author = "Equipe YDays"
release = "4.0"
language = "fr"

extensions = [
    "sphinx.ext.autodoc",  # documentation generee depuis les docstrings
    "sphinx.ext.napoleon",  # prise en charge des docstrings style Google
    "sphinx.ext.viewcode",  # liens vers le code source
]

# Docstrings : le projet utilise le style Google (et des commentaires simples).
napoleon_google_docstring = True
napoleon_numpy_docstring = False

autodoc_member_order = "bysource"
autodoc_typehints = "description"

html_theme = "sphinx_rtd_theme"
html_title = "GOLD FX - Documentation du backend"

# Fichiers du dossier docs/ qui ne font pas partie de la documentation Sphinx
# (documents projet deposes par l'equipe).
exclude_patterns = ["_build", "*.pdf", "*.html"]
