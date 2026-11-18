-- =====================================================================
--  GOLD FX - Base de données SQLite
--  Conforme au diagramme de classes (Model::Main)
--
--  6 tables : users, projet, video_in, prompt, tache, video_out
--  Les fichiers vidéo/image NE SONT PAS stockés en BDD :
--  on stocke uniquement leur chemin (dossier uploads/ ou outputs/).
-- =====================================================================

PRAGMA foreign_keys = ON;   -- SQLite : active les clés étrangères (à refaire à chaque connexion)

-- On supprime dans l'ordre inverse des dépendances (enfants d'abord)
DROP TABLE IF EXISTS video_out;
DROP TABLE IF EXISTS tache;
DROP TABLE IF EXISTS prompt;
DROP TABLE IF EXISTS video_in;
DROP TABLE IF EXISTS projet;
DROP TABLE IF EXISTS users;

-- ---------------------------------------------------------------------
-- 1. USERS
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id_user            INTEGER PRIMARY KEY AUTOINCREMENT,
    nom                TEXT    NOT NULL,
    prenom             TEXT    NOT NULL,
    adresse_mail       TEXT    NOT NULL UNIQUE,
    mot_de_passe_hash  TEXT    NOT NULL,                 -- jamais le mot de passe en clair
    role               TEXT    NOT NULL DEFAULT 'user'
                       CHECK (role IN ('user', 'admin')),
    is_active          INTEGER NOT NULL DEFAULT 1
                       CHECK (is_active IN (0, 1)),      -- SQLite n'a pas de BOOLEAN
    date_creation      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 2. PROJET   (Users 1 ── créer ── 0..* Projet)
-- ---------------------------------------------------------------------
CREATE TABLE projet (
    id_projet      INTEGER PRIMARY KEY AUTOINCREMENT,
    id_user        INTEGER NOT NULL,
    nom            TEXT    NOT NULL,
    description    TEXT,
    date_creation  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 3. VIDEO_IN   (Projet 1 ── contenir ── 0..* VideoIn)
--    Média d'origine : on stocke l'ADRESSE du fichier, pas le fichier.
-- ---------------------------------------------------------------------
CREATE TABLE video_in (
    id_video_in     INTEGER PRIMARY KEY AUTOINCREMENT,
    id_projet       INTEGER NOT NULL,
    nom_original    TEXT    NOT NULL,                    -- nom chez l'utilisateur
    type_media      TEXT    NOT NULL
                    CHECK (type_media IN ('video', 'image')),
    format          TEXT,                                -- mp4, webm, png, jpg...
    taille          INTEGER CHECK (taille >= 0),         -- en octets
    duree           REAL    CHECK (duree >= 0),          -- en secondes, NULL pour une image
    chemin_fichier  TEXT    NOT NULL UNIQUE,             -- ex: uploads/2026/11/a1b2c3.mp4
    date_import     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_projet) REFERENCES projet(id_projet) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 4. PROMPT
--    Users   1 ── écrire    ── 0..* Prompt
--    VideoIn 1 ── concerner ── 0..* Prompt
--    Prompt 0..1 ── précède ── 0..1 Prompt   (chaînage des itérations)
-- ---------------------------------------------------------------------
CREATE TABLE prompt (
    id_prompt            INTEGER PRIMARY KEY AUTOINCREMENT,
    id_user              INTEGER NOT NULL,
    id_video_in          INTEGER NOT NULL,
    id_prompt_precedent  INTEGER UNIQUE,                 -- UNIQUE => 0..1 successeur
    contenu              TEXT    NOT NULL,
    numero_iteration     INTEGER NOT NULL DEFAULT 1
                         CHECK (numero_iteration >= 1),
    date_creation        TEXT    NOT NULL
                         DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')), -- date précise (ms)
    FOREIGN KEY (id_user)             REFERENCES users(id_user)         ON DELETE CASCADE,
    FOREIGN KEY (id_video_in)         REFERENCES video_in(id_video_in)  ON DELETE CASCADE,
    FOREIGN KEY (id_prompt_precedent) REFERENCES prompt(id_prompt)      ON DELETE SET NULL,
    CHECK (id_prompt_precedent IS NULL OR id_prompt_precedent <> id_prompt),
    UNIQUE (id_video_in, numero_iteration)               -- pas deux "itération 2" sur la même vidéo
);

-- ---------------------------------------------------------------------
-- 5. TACHE   (Prompt 1 ── déclencher ── 1..* Tache)
--    Exécution d'un prompt par un moteur (API externe, Assistant IA, Kling)
-- ---------------------------------------------------------------------
CREATE TABLE tache (
    id_tache        INTEGER PRIMARY KEY AUTOINCREMENT,
    id_prompt       INTEGER NOT NULL,
    moteur          TEXT    NOT NULL DEFAULT 'api_externe'
                    CHECK (moteur IN ('api_externe', 'assistant_ia', 'kling_ai')),
    statut          TEXT    NOT NULL DEFAULT 'en_attente'
                    CHECK (statut IN ('en_attente', 'en_cours', 'termine', 'erreur', 'annule')),
    progression     INTEGER NOT NULL DEFAULT 0
                    CHECK (progression BETWEEN 0 AND 100),
    message_erreur  TEXT,
    date_debut      TEXT,                                -- rempli au lancement
    date_fin        TEXT,                                -- rempli à la fin / erreur / annulation
    FOREIGN KEY (id_prompt) REFERENCES prompt(id_prompt) ON DELETE CASCADE,
    CHECK (date_fin IS NULL OR date_debut IS NULL OR date_fin >= date_debut)
);

-- ---------------------------------------------------------------------
-- 6. VIDEO_OUT   (Tache 1 ── générer ── 0..1 VideoOut)
--    Résultat produit par une tâche : ADRESSE du fichier seulement.
-- ---------------------------------------------------------------------
CREATE TABLE video_out (
    id_video_out     INTEGER PRIMARY KEY AUTOINCREMENT,
    id_tache         INTEGER NOT NULL UNIQUE,            -- UNIQUE => 0..1 vidéo par tâche
    format           TEXT,
    taille           INTEGER CHECK (taille >= 0),
    duree            REAL    CHECK (duree >= 0),
    chemin_fichier   TEXT    NOT NULL UNIQUE,            -- ex: outputs/2026/11/a1b2c3_v1.mp4
    date_generation  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_tache) REFERENCES tache(id_tache) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Index : accélèrent les recherches par clé étrangère et par date
-- ---------------------------------------------------------------------
CREATE INDEX idx_projet_user      ON projet(id_user);
CREATE INDEX idx_video_in_projet  ON video_in(id_projet);
CREATE INDEX idx_prompt_user      ON prompt(id_user);
CREATE INDEX idx_prompt_video     ON prompt(id_video_in);
CREATE INDEX idx_prompt_date      ON prompt(date_creation);
CREATE INDEX idx_tache_prompt     ON tache(id_prompt);
CREATE INDEX idx_tache_statut     ON tache(statut);

-- ---------------------------------------------------------------------
-- Vue pratique : historique complet "vidéo -> prompts -> tâches -> outputs"
-- ---------------------------------------------------------------------
CREATE VIEW v_historique AS
SELECT  u.id_user, u.prenom || ' ' || u.nom   AS auteur,
        pj.id_projet, pj.nom                  AS projet,
        vi.id_video_in, vi.nom_original,
        p.id_prompt, p.numero_iteration, p.contenu, p.date_creation AS date_prompt,
        t.id_tache, t.moteur, t.statut, t.progression,
        vo.chemin_fichier                     AS fichier_sortie, vo.date_generation
FROM prompt p
JOIN users     u  ON u.id_user      = p.id_user
JOIN video_in  vi ON vi.id_video_in = p.id_video_in
JOIN projet    pj ON pj.id_projet   = vi.id_projet
LEFT JOIN tache     t  ON t.id_prompt = p.id_prompt
LEFT JOIN video_out vo ON vo.id_tache = t.id_tache;
