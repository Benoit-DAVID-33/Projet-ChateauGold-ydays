"""Import one-shot des utilisateurs depuis ``users.json`` vers le store actif.

Permet de conserver les comptes existants (dont le compte de demonstration)
lors du passage du stockage JSON a la base SQLAlchemy.
"""

import json
import logging
from pathlib import Path

from .contract import UserStore

logger = logging.getLogger("goldfx")


def seed_from_json(path: Path, store: UserStore) -> int:
    """Importe les utilisateurs de ``path`` absents du store. Retourne le nombre importe."""
    path = Path(path)
    if not path.exists():
        return 0

    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Import utilisateurs ignoré (%s) : %s", path, exc)
        return 0

    if not isinstance(data, dict):
        return 0

    imported = 0
    for username, user in data.items():
        if not isinstance(user, dict) or "password" not in user:
            continue
        if store.exists_username(username):
            continue
        store.create(username, user.get("email", ""), user["password"])
        imported += 1

    if imported:
        logger.info("%s utilisateur(s) importé(s) depuis %s", imported, path)
    return imported
