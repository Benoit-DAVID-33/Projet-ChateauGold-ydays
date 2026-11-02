"""Acces type aux champs de formulaire.

``request.form()`` renvoie ``str | UploadFile`` selon le champ. Ce helper
n'extrait que les valeurs texte, ce qui evite les erreurs de typage.
"""

from starlette.datastructures import FormData


def form_str(form: FormData, key: str, default: str = "") -> str:
    """Retourne la valeur texte du champ ``key``, ou ``default``."""
    value = form.get(key)
    if isinstance(value, str):
        return value
    return default
