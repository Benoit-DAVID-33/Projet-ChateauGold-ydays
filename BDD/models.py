"""
GOLD FX - Modèles Flask-SQLAlchemy 
    pip install flask flask-sqlalchemy

Dans app.py :
    from models import db
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///goldfx.db"
    db.init_app(app)
    with app.app_context():
        db.create_all()          # crée les tables si elles n'existent pas
"""
from datetime import datetime

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import CheckConstraint, UniqueConstraint, event
from sqlalchemy.engine import Engine
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


# SQLite désactive les clés étrangères par défaut : on les active à chaque connexion
@event.listens_for(Engine, "connect")
def _activer_cles_etrangeres(dbapi_conn, _record):
    if dbapi_conn.__class__.__module__.startswith("sqlite3"):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys = ON")
        cur.close()


MOTEURS = ("api_externe", "assistant_ia", "kling_ai")
STATUTS = ("en_attente", "en_cours", "termine", "erreur", "annule")


# ---------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------
class Users(db.Model):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
    )

    id_user = db.Column(db.Integer, primary_key=True)
    nom = db.Column(db.String(100), nullable=False)
    prenom = db.Column(db.String(100), nullable=False)
    adresse_mail = db.Column(db.String(255), nullable=False, unique=True)
    mot_de_passe_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="user")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    date_creation = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    projets = db.relationship("Projet", back_populates="user", cascade="all, delete-orphan")
    prompts = db.relationship("Prompt", back_populates="user", cascade="all, delete-orphan")

    # --- méthodes du diagramme ---
    @classmethod
    def creer_compte(cls, nom, prenom, adresse_mail, mot_de_passe, role="user"):
        user = cls(nom=nom, prenom=prenom, adresse_mail=adresse_mail.lower(), role=role,
                   mot_de_passe_hash=generate_password_hash(mot_de_passe))
        db.session.add(user)
        db.session.commit()
        return user

    @classmethod
    def s_authentifier(cls, adresse_mail, mot_de_passe):
        user = cls.query.filter_by(adresse_mail=adresse_mail.lower(), is_active=True).first()
        if user and check_password_hash(user.mot_de_passe_hash, mot_de_passe):
            return user
        return None

    def supprimer_compte(self):
        db.session.delete(self)        # cascade : projets, vidéos, prompts, tâches, outputs
        db.session.commit()

    def gerer_profil(self, **champs):
        for cle in ("nom", "prenom", "adresse_mail"):
            if cle in champs:
                setattr(self, cle, champs[cle])
        if "mot_de_passe" in champs:
            self.mot_de_passe_hash = generate_password_hash(champs["mot_de_passe"])
        db.session.commit()

    def creer_projet(self, nom, description=None):
        projet = Projet(user=self, nom=nom, description=description)
        db.session.add(projet)
        db.session.commit()
        return projet

    def gerer_projet(self, projet, **champs):
        if projet.id_user != self.id_user and self.role != "admin":
            raise PermissionError("Ce projet n'appartient pas à cet utilisateur")
        for cle in ("nom", "description"):
            if cle in champs:
                setattr(projet, cle, champs[cle])
        db.session.commit()


# ---------------------------------------------------------------------
# Projet
# ---------------------------------------------------------------------
class Projet(db.Model):
    __tablename__ = "projet"

    id_projet = db.Column(db.Integer, primary_key=True)
    id_user = db.Column(db.Integer, db.ForeignKey("users.id_user", ondelete="CASCADE"),
                        nullable=False, index=True)
    nom = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text)
    date_creation = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    user = db.relationship("Users", back_populates="projets")
    videos = db.relationship("VideoIn", back_populates="projet", cascade="all, delete-orphan")

    def ajouter_media(self, nom_original, chemin_fichier, type_media="video",
                      format=None, taille=None, duree=None):
        return VideoIn.importer(self, nom_original, chemin_fichier, type_media,
                                format, taille, duree)

    def renommer(self, nouveau_nom):
        self.nom = nouveau_nom
        db.session.commit()


# ---------------------------------------------------------------------
# VideoIn  (chemin du fichier uniquement)
# ---------------------------------------------------------------------
class VideoIn(db.Model):
    __tablename__ = "video_in"
    __table_args__ = (
        CheckConstraint("type_media IN ('video', 'image')", name="ck_video_in_type"),
    )

    id_video_in = db.Column(db.Integer, primary_key=True)
    id_projet = db.Column(db.Integer, db.ForeignKey("projet.id_projet", ondelete="CASCADE"),
                          nullable=False, index=True)
    nom_original = db.Column(db.String(255), nullable=False)
    type_media = db.Column(db.String(10), nullable=False)
    format = db.Column(db.String(10))
    taille = db.Column(db.BigInteger)            # octets
    duree = db.Column(db.Float)                  # secondes
    chemin_fichier = db.Column(db.String(500), nullable=False, unique=True)
    date_import = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    projet = db.relationship("Projet", back_populates="videos")
    prompts = db.relationship("Prompt", back_populates="video_in", cascade="all, delete-orphan",
                              order_by="Prompt.numero_iteration")

    @classmethod
    def importer(cls, projet, nom_original, chemin_fichier, type_media="video",
                 format=None, taille=None, duree=None):
        video = cls(projet=projet, nom_original=nom_original, chemin_fichier=chemin_fichier,
                    type_media=type_media, format=format, taille=taille, duree=duree)
        db.session.add(video)
        db.session.commit()
        return video

    def supprimer(self):
        # NB : supprimer aussi le fichier physique (os.remove) côté route Flask
        db.session.delete(self)
        db.session.commit()

    @property
    def outputs(self):
        """Toutes les vidéos de sortie générées à partir de cette vidéo."""
        return (VideoOut.query.join(Tache).join(Prompt)
                .filter(Prompt.id_video_in == self.id_video_in)
                .order_by(VideoOut.date_generation).all())


# ---------------------------------------------------------------------
# Prompt  (avec auto-association "précède")
# ---------------------------------------------------------------------
class Prompt(db.Model):
    __tablename__ = "prompt"
    __table_args__ = (
        UniqueConstraint("id_video_in", "numero_iteration", name="uq_prompt_iteration"),
        CheckConstraint("numero_iteration >= 1", name="ck_prompt_iteration"),
    )

    id_prompt = db.Column(db.Integer, primary_key=True)
    id_user = db.Column(db.Integer, db.ForeignKey("users.id_user", ondelete="CASCADE"),
                        nullable=False, index=True)
    id_video_in = db.Column(db.Integer, db.ForeignKey("video_in.id_video_in", ondelete="CASCADE"),
                            nullable=False, index=True)
    id_prompt_precedent = db.Column(db.Integer,
                                    db.ForeignKey("prompt.id_prompt", ondelete="SET NULL"),
                                    unique=True)
    contenu = db.Column(db.Text, nullable=False)
    numero_iteration = db.Column(db.Integer, nullable=False, default=1)
    date_creation = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)

    user = db.relationship("Users", back_populates="prompts")
    video_in = db.relationship("VideoIn", back_populates="prompts")
    taches = db.relationship("Tache", back_populates="prompt", cascade="all, delete-orphan",
                             order_by="Tache.id_tache")
    precedent = db.relationship("Prompt", remote_side=[id_prompt],
                                backref=db.backref("suivant", uselist=False))

    @classmethod
    def soumettre(cls, user, video_in, contenu, moteur="api_externe"):
        """Enregistre un nouveau prompt (traçabilité) chaîné au précédent,
        et déclenche immédiatement sa première tâche."""
        dernier = (cls.query.filter_by(id_video_in=video_in.id_video_in)
                   .order_by(cls.numero_iteration.desc()).first())
        prompt = cls(user=user, video_in=video_in, contenu=contenu,
                     precedent=dernier,
                     numero_iteration=(dernier.numero_iteration + 1) if dernier else 1)
        db.session.add(prompt)
        tache = Tache(prompt=prompt, moteur=moteur)  # Prompt 1 -> 1..* Tache
        db.session.add(tache)
        db.session.commit()
        return prompt, tache

    def modifier(self, nouveau_contenu, moteur="api_externe"):
        """On ne réécrit PAS l'historique : modifier = créer une nouvelle itération."""
        return Prompt.soumettre(self.user, self.video_in, nouveau_contenu, moteur)


# ---------------------------------------------------------------------
# Tache  (exécution d'un prompt par un moteur)
# ---------------------------------------------------------------------
class Tache(db.Model):
    __tablename__ = "tache"
    __table_args__ = (
        CheckConstraint("moteur IN %s" % (MOTEURS,), name="ck_tache_moteur"),
        CheckConstraint("statut IN %s" % (STATUTS,), name="ck_tache_statut"),
        CheckConstraint("progression BETWEEN 0 AND 100", name="ck_tache_progression"),
    )

    id_tache = db.Column(db.Integer, primary_key=True)
    id_prompt = db.Column(db.Integer, db.ForeignKey("prompt.id_prompt", ondelete="CASCADE"),
                          nullable=False, index=True)
    moteur = db.Column(db.String(20), nullable=False, default="api_externe")
    statut = db.Column(db.String(20), nullable=False, default="en_attente", index=True)
    progression = db.Column(db.Integer, nullable=False, default=0)
    message_erreur = db.Column(db.Text)
    date_debut = db.Column(db.DateTime)
    date_fin = db.Column(db.DateTime)

    prompt = db.relationship("Prompt", back_populates="taches")
    video_out = db.relationship("VideoOut", back_populates="tache", uselist=False,
                                cascade="all, delete-orphan")

    def lancer(self):
        self.statut = "en_cours"
        self.progression = 0
        self.date_debut = datetime.utcnow()
        self.date_fin = None
        self.message_erreur = None
        db.session.commit()

    def mettre_a_jour(self, progression):
        self.progression = max(0, min(100, int(progression)))
        db.session.commit()

    def terminer(self, chemin_fichier, format=None, taille=None, duree=None):
        self.statut = "termine"
        self.progression = 100
        self.date_fin = datetime.utcnow()
        out = VideoOut(tache=self, chemin_fichier=chemin_fichier,
                       format=format, taille=taille, duree=duree)
        db.session.add(out)
        db.session.commit()
        return out

    def echouer(self, message):
        self.statut = "erreur"
        self.message_erreur = message
        self.date_fin = datetime.utcnow()
        db.session.commit()

    def annuler(self):
        self.statut = "annule"
        self.date_fin = datetime.utcnow()
        db.session.commit()

    def relancer(self):
        """Relancer = nouvelle tâche pour le même prompt (on garde la trace de l'échec)."""
        nouvelle = Tache(prompt=self.prompt, moteur=self.moteur)
        db.session.add(nouvelle)
        db.session.commit()
        nouvelle.lancer()
        return nouvelle


# ---------------------------------------------------------------------
# VideoOut  (chemin du fichier uniquement)
# ---------------------------------------------------------------------
class VideoOut(db.Model):
    __tablename__ = "video_out"

    id_video_out = db.Column(db.Integer, primary_key=True)
    id_tache = db.Column(db.Integer, db.ForeignKey("tache.id_tache", ondelete="CASCADE"),
                         nullable=False, unique=True)
    format = db.Column(db.String(10))
    taille = db.Column(db.BigInteger)
    duree = db.Column(db.Float)
    chemin_fichier = db.Column(db.String(500), nullable=False, unique=True)
    date_generation = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    tache = db.relationship("Tache", back_populates="video_out")

    def telecharger(self):
        """Renvoie le chemin à passer à flask.send_file()."""
        return self.chemin_fichier
