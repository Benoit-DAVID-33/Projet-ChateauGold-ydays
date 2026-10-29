"""Studio emoji cote backend (donnees, recherche, plan de calques).

Objectif : exposer en API la logique du studio client (`emoji-studio.html`)
afin qu'elle soit reutilisable : recherche bilingue, analyse d'une composition
en langage naturel, et plan de calques deterministe.

- ``dataset`` : jeu emojibase FR/EN (CDN ou fichier local), mis en cache.
- ``search``  : normalisation, alias FR/EN, classement par pertinence.
- ``prompt``  : analyse d'une phrase (« 2 voitures et un avion »).
- ``layout``  : plan de calques (positions deterministes, sans rendu image).
"""

from .dataset import EmojiDataError, get_dataset, merge_languages, reset_cache
from .layout import LayerOptions, make_rng, plan_layers, safe_name
from .prompt import parse_prompt
from .search import alias_queries, normalize, rank_matches

__all__ = [
    "EmojiDataError",
    "LayerOptions",
    "alias_queries",
    "get_dataset",
    "make_rng",
    "merge_languages",
    "normalize",
    "parse_prompt",
    "plan_layers",
    "rank_matches",
    "reset_cache",
    "safe_name",
]
