# Projet-ChateauGold-ydays – Base de données 

Base SQLite de l'application Flask ChateauGold-ydays, construite à partir du diagramme de classes (Model::Main).

## Fichiers

| Fichier | Rôle |
|---|---|
| `models.py` | Modèles Flask-SQLAlchemy : crée les tables et contient les méthodes du diagramme |
| `schema.sql` | Le même schéma écrit en SQL (contraintes, index, vue `v_historique`) | 
| `README.md` | Ce fichier: Documentation |

> Le fichier `goldfx.db` est généré automatiquement au premier lancement.

## Installation

```bash
pip install flask flask-sqlalchemy
```

Dans `app.py` :

```python
from models import db

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///goldfx.db"
db.init_app(app)

with app.app_context():
    db.create_all()   # crée les tables si elles n'existent pas encore
```

Autre option, sans Flask : exécuter `schema.sql` dans **DB Browser for SQLite** (onglet « Exécuter le SQL »).
⚠️ `schema.sql` commence par des `DROP TABLE` : il efface la base existante.

## Les 6 tables

| Table | Contenu |
|---|---|
| `users` | Comptes (nom, prénom, mail unique, mot de passe hashé, rôle `user`/`admin`, actif) |
| `projet` | Projets créés par un utilisateur |
| `video_in` | Médias d'origine : **chemin du fichier uniquement**, avec format, taille, durée et date d'import |
| `prompt` | Chaque demande de l'utilisateur, numérotée par itération, avec sa date précise (ms) |
| `tache` | Exécution d'un prompt par un moteur (`api_externe`, `assistant_ia`, `kling_ai`) : statut, progression, erreurs |
| `video_out` | Résultat d'une tâche : **chemin du fichier uniquement** |

## Relations (diagramme → SQL)

| Association | Traduction |
|---|---|
| Users 1 — 0..* Projet | `projet.id_user` |
| Projet 1 — 0..* VideoIn | `video_in.id_projet` |
| Users 1 — 0..* Prompt | `prompt.id_user` |
| VideoIn 1 — 0..* Prompt | `prompt.id_video_in` |
| Prompt « précède » Prompt (0..1 / 0..1) | `prompt.id_prompt_precedent` (nullable + UNIQUE) |
| Prompt 1 — 1..* Tache | `tache.id_prompt` |
| Tache 1 — 0..1 VideoOut | `video_out.id_tache` (UNIQUE) |

Une vidéo d'entrée peut donc avoir plusieurs prompts, et chaque prompt peut mener à une vidéo de sortie : **1 input → plusieurs outputs**.

## Règles de fonctionnement

- **Les vidéos ne sont jamais stockées en base**, seulement leur adresse (`uploads/...`, `outputs/...`).
- **Traçabilité des prompts** : un prompt n'est jamais modifié. `Prompt.modifier()` crée une nouvelle itération chaînée à la précédente.
- **Traçabilité des erreurs** : `Tache.relancer()` crée une nouvelle tâche, et l'échec reste enregistré.
- **Suppression en cascade** : supprimer un utilisateur supprime ses projets, vidéos, prompts, tâches et outputs.
- **Clés étrangères SQLite** : elles sont désactivées par défaut. `models.py` exécute `PRAGMA foreign_keys = ON` à chaque connexion.
- **Fichiers physiques** : supprimer une vidéo en base n'efface pas le fichier sur le disque. La route Flask doit aussi faire `os.remove(chemin_fichier)`.


