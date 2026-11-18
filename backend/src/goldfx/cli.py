"""Commandes d'administration : ``goldfx <commande>``.

* ``goldfx import-users chemin/users.json`` : importe les comptes de l'ancienne
  application (hashes werkzeug conservés, re-hachés en Argon2id à la connexion).
* ``goldfx create-user <username> <email>`` : crée un compte (mot de passe demandé).
* ``goldfx openapi openapi.json`` : exporte le contrat OpenAPI (types du frontend).
"""

from __future__ import annotations

import argparse
import getpass
import json
import sys
import uuid
from pathlib import Path

from goldfx.config import get_settings
from goldfx.container import Container, build_container
from goldfx.domain.models import User


def import_users(path: Path) -> int:
    container = build_container(get_settings())
    try:
        return _import_users(container, path)
    finally:
        container.engine.dispose()


def _import_users(container: Container, path: Path) -> int:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        print("Format inattendu : un objet {username: {email, password}} est attendu.")
        return 1
    created = skipped = 0
    with container.unit_of_work() as uow:
        for username, data in raw.items():
            email = str(data.get("email", "")).strip().lower()
            password_hash = str(data.get("password", ""))
            if not email or not password_hash:
                print(f"  ignoré (incomplet) : {username}")
                skipped += 1
                continue
            if uow.users.get_by_username(username) or uow.users.get_by_email(email):
                print(f"  ignoré (déjà présent) : {username}")
                skipped += 1
                continue
            uow.users.add(
                User(
                    id=uuid.uuid4(),
                    username=username,
                    email=email,
                    password_hash=password_hash,
                    created_at=container.clock.now(),
                )
            )
            created += 1
        uow.commit()
    print(f"{created} compte(s) importé(s), {skipped} ignoré(s).")
    return 0


def create_user(username: str, email: str) -> int:
    container = build_container(get_settings())
    try:
        return _create_user(container, username, email)
    finally:
        container.engine.dispose()


def _create_user(container: Container, username: str, email: str) -> int:
    password = getpass.getpass("Mot de passe : ")
    if password != getpass.getpass("Confirmation : "):
        print("Les mots de passe ne correspondent pas.")
        return 1
    with container.unit_of_work() as uow:
        user = container.auth_service(uow).register(username, email, password)
    print(f"Compte créé : {user.username} <{user.email}>")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="goldfx", description="Administration GOLD FX")
    sub = parser.add_subparsers(dest="command", required=True)

    p_import = sub.add_parser("import-users", help="Importer un users.json de l'ancienne app")
    p_import.add_argument("path", type=Path)

    p_create = sub.add_parser("create-user", help="Créer un compte")
    p_create.add_argument("username")
    p_create.add_argument("email")

    p_openapi = sub.add_parser("openapi", help="Exporter le contrat OpenAPI (JSON)")
    p_openapi.add_argument("output", type=Path)

    args = parser.parse_args(argv)
    if args.command == "import-users":
        return import_users(args.path)
    if args.command == "openapi":
        return export_openapi(args.output)
    return create_user(args.username, args.email)


def export_openapi(output: Path) -> int:
    """Écrit le schéma OpenAPI (source des types TypeScript du frontend)."""
    from goldfx.config import Environment, Settings
    from goldfx.main import create_app

    settings = Settings(environment=Environment.DEVELOPMENT, database_url="sqlite://")
    app = create_app(settings)
    output.write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n", "utf-8")
    print(f"Schéma OpenAPI écrit dans {output}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
