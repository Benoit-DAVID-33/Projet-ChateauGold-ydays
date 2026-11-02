"""Lexique francais -> anglais pour le prompt engineering hors ligne.

Les modeles video suivent nettement mieux les prompts **anglais**. En mode
« regles » (sans LLM), les fragments extraits de la demande (« un chapeau
rouge », « la personne derriere ») sont traduits mot a mot avec un lexique
specialise (objets, vetements, couleurs, meteo, lumiere, styles, cadrage), puis
remis dans l'ordre anglais (adjectif et matiere avant le nom).

La traduction est **honnete** : si un mot n'est pas connu, ``translate``
le signale (``complete=False``) et l'appelant garde alors le francais plutot
que de produire un melange des deux langues.
"""

from __future__ import annotations

import re

from server.prompts import cinema

# --- Expressions de plusieurs mots (prioritaires, plus longue correspondance) ---

PHRASES: dict[str, tuple[str, str]] = {
    "au coucher de soleil": ("at sunset", "p"),
    "au coucher du soleil": ("at sunset", "p"),
    "au lever du soleil": ("at sunrise", "p"),
    "coucher de soleil": ("sunset", "n"),
    "coucher du soleil": ("sunset", "n"),
    "lever de soleil": ("sunrise", "n"),
    "heure dorée": ("golden hour", "n"),
    "heure doree": ("golden hour", "n"),
    "heure bleue": ("blue hour", "n"),
    "noir et blanc": ("black and white", "a"),
    "dessin animé": ("cartoon", "n"),
    "dessin anime": ("cartoon", "n"),
    "bande dessinée": ("comic book", "n"),
    "bande dessinee": ("comic book", "n"),
    "peinture à l'huile": ("oil painting", "n"),
    "pâte à modeler": ("claymation", "n"),
    "pate a modeler": ("claymation", "n"),
    "pixel art": ("pixel art", "n"),
    "film noir": ("film noir", "n"),
    "gros plan": ("close-up shot", "n"),
    "très gros plan": ("extreme close-up shot", "n"),
    "plan large": ("wide shot", "n"),
    "plan moyen": ("medium shot", "n"),
    "plan d'ensemble": ("establishing shot", "n"),
    "vue de dessus": ("top-down view", "n"),
    "vue aérienne": ("aerial view", "n"),
    "vue aerienne": ("aerial view", "n"),
    "vue de face": ("front view", "n"),
    "vue de profil": ("side view", "n"),
    "en haut à droite": ("in the top right corner", "p"),
    "en haut à gauche": ("in the top left corner", "p"),
    "en bas à droite": ("in the bottom right corner", "p"),
    "en bas à gauche": ("in the bottom left corner", "p"),
    "en haut": ("at the top", "p"),
    "en bas": ("at the bottom", "p"),
    "au centre": ("in the center", "p"),
    "à gauche": ("on the left", "p"),
    "a gauche": ("on the left", "p"),
    "à droite": ("on the right", "p"),
    "a droite": ("on the right", "p"),
    "au premier plan": ("in the foreground", "p"),
    "en arrière-plan": ("in the background", "p"),
    "à l'arrière-plan": ("in the background", "p"),
    "au fond": ("in the background", "p"),
    "à côté de": ("next to", "p"),
    "a cote de": ("next to", "p"),
    "au-dessus de": ("above", "p"),
    "en face de": ("opposite", "p"),
    "de nuit": ("at night", "p"),
    "de jour": ("in daylight", "p"),
    "en plein jour": ("in broad daylight", "p"),
    "sous la pluie": ("in the rain", "p"),
    "sous la neige": ("in the snow", "p"),
    "lunettes de soleil": ("sunglasses", "n"),
    "pomme de terre": ("potato", "n"),
    "feu d'artifice": ("fireworks", "n"),
    "feux d'artifice": ("fireworks", "n"),
    "arc-en-ciel": ("rainbow", "n"),
    "arc en ciel": ("rainbow", "n"),
    "panneau publicitaire": ("billboard", "n"),
    "vieux film": ("old film", "n"),
}

# Jargon de tournage (« travelling avant », « contre-plongée »...) : voir ``cinema``.
for _french, _entry in cinema.phrases().items():
    PHRASES.setdefault(_french, _entry)

# --- Mots simples, par categorie grammaticale ---

DETERMINERS: dict[str, str] = {
    "le": "the",
    "la": "the",
    "les": "the",
    "l'": "the",
    "un": "a",
    "une": "a",
    "ce": "this",
    "cet": "this",
    "cette": "this",
    "ces": "these",
    "son": "its",
    "sa": "its",
    "ses": "its",
    "mon": "my",
    "ma": "my",
    "mes": "my",
    "leur": "their",
    "leurs": "their",
    "tout": "all",
    "toute": "all",
    "tous": "all",
    "toutes": "all",
    "deux": "two",
    "trois": "three",
    "quatre": "four",
    "plusieurs": "several",
    "quelques": "a few",
}

PREPOSITIONS: dict[str, str] = {
    "avec": "with",
    "sans": "without",
    "sur": "on",
    "dans": "in",
    "sous": "under",
    "devant": "in front of",
    "derrière": "behind",
    "derriere": "behind",
    "entre": "between",
    "près": "near",
    "pres": "near",
    "autour": "around",
    "vers": "toward",
    "pour": "for",
    "à": "to",
    "a": "to",
    "au": "to the",
    "aux": "to the",
    "et": "and",
    "ou": "or",
    "qui": "that",
    "est": "is",
    "sont": "are",
}

ADVERBS: dict[str, str] = {
    "très": "very",
    "tres": "very",
    "plus": "more",
    "moins": "less",
    "trop": "too",
    "légèrement": "slightly",
    "legerement": "slightly",
    "complètement": "completely",
    "completement": "completely",
    "lentement": "slowly",
    "rapidement": "quickly",
    "doucement": "gently",
}

NOUNS: dict[str, str] = {
    # personnes et corps
    "personne": "person",
    "personnes": "people",
    "homme": "man",
    "hommes": "men",
    "femme": "woman",
    "femmes": "women",
    "enfant": "child",
    "enfants": "children",
    "fille": "girl",
    "garçon": "boy",
    "garcon": "boy",
    "bébé": "baby",
    "bebe": "baby",
    "mec": "man",
    "mecs": "men",
    "gars": "guy",
    "type": "man",
    "meuf": "woman",
    "nana": "woman",
    "gamin": "kid",
    "gamine": "kid",
    "passant": "passerby",
    "passants": "passersby",
    "foule": "crowd",
    "acteur": "actor",
    "actrice": "actress",
    "danseur": "dancer",
    "danseuse": "dancer",
    "sujet": "subject",
    "visage": "face",
    "cheveux": "hair",
    "barbe": "beard",
    "moustache": "mustache",
    "yeux": "eyes",
    "oeil": "eye",
    "main": "hand",
    "mains": "hands",
    "bras": "arm",
    "tête": "head",
    "tete": "head",
    "sourire": "smile",
    "tatouage": "tattoo",
    # vetements et accessoires
    "chapeau": "hat",
    "casquette": "cap",
    "bonnet": "beanie",
    "casque": "helmet",
    "lunettes": "glasses",
    "veste": "jacket",
    "manteau": "coat",
    "blouson": "jacket",
    "chemise": "shirt",
    "t-shirt": "t-shirt",
    "tee-shirt": "t-shirt",
    "pull": "sweater",
    "robe": "dress",
    "jupe": "skirt",
    "pantalon": "trousers",
    "jean": "jeans",
    "costume": "suit",
    "cravate": "tie",
    "écharpe": "scarf",
    "echarpe": "scarf",
    "chaussures": "shoes",
    "chaussettes": "socks",
    "baskets": "sneakers",
    "bottes": "boots",
    "gants": "gloves",
    "sac": "bag",
    "collier": "necklace",
    "bague": "ring",
    "montre": "watch",
    "masque": "mask",
    "couronne": "crown",
    "cape": "cape",
    "armure": "armor",
    "armures": "armor",
    "uniforme": "uniform",
    "tenue": "outfit",
    "vêtements": "clothes",
    "vetements": "clothes",
    # objets et vehicules
    "voiture": "car",
    "voitures": "cars",
    "vélo": "bicycle",
    "velo": "bicycle",
    "moto": "motorcycle",
    "bus": "bus",
    "camion": "truck",
    "bateau": "boat",
    "avion": "airplane",
    "train": "train",
    "trottinette": "scooter",
    "logo": "logo",
    "texte": "text",
    "écriture": "writing",
    "ecriture": "writing",
    "filigrane": "watermark",
    "panneau": "sign",
    "affiche": "poster",
    "téléphone": "phone",
    "telephone": "phone",
    "ordinateur": "laptop",
    "écran": "screen",
    "ecran": "screen",
    "table": "table",
    "chaise": "chair",
    "canapé": "sofa",
    "canape": "sofa",
    "lampe": "lamp",
    "bougie": "candle",
    "fleur": "flower",
    "fleurs": "flowers",
    "bouquet": "bouquet",
    "tasse": "cup",
    "verre": "glass",
    "bouteille": "bottle",
    "livre": "book",
    "ballon": "balloon",
    "parapluie": "umbrella",
    "guitare": "guitar",
    "micro": "microphone",
    "épée": "sword",
    "epee": "sword",
    "drapeau": "flag",
    "objet": "object",
    "objets": "objects",
    "fil": "wire",
    "fils": "wires",
    "poubelle": "trash can",
    "déchets": "litter",
    "dechets": "litter",
    # personnages et elements de fiction
    "chevalier": "knight",
    "chevaliers": "knights",
    "soldat": "soldier",
    "soldats": "soldiers",
    "sorcier": "wizard",
    "sorcière": "witch",
    "sorciere": "witch",
    "pirate": "pirate",
    "fantôme": "ghost",
    "fantome": "ghost",
    "zombie": "zombie",
    "robot": "robot",
    "monstre": "monster",
    "extraterrestre": "alien",
    "astronaute": "astronaut",
    "ninja": "ninja",
    "samouraï": "samurai",
    "samourai": "samurai",
    "super-héros": "superhero",
    "vaisseau": "spaceship",
    "soucoupe": "flying saucer",
    "explosion": "explosion",
    "météorite": "meteor",
    "meteorite": "meteor",
    "portail": "portal",
    "licorne": "unicorn",
    "phénix": "phoenix",
    "phenix": "phoenix",
    # animaux
    "chat": "cat",
    "chien": "dog",
    "oiseau": "bird",
    "oiseaux": "birds",
    "cheval": "horse",
    "lion": "lion",
    "tigre": "tiger",
    "dragon": "dragon",
    "dragons": "dragons",
    "papillon": "butterfly",
    "papillons": "butterflies",
    "poisson": "fish",
    "poissons": "fish",
    "dauphin": "dolphin",
    "lapin": "rabbit",
    "ours": "bear",
    "loup": "wolf",
    # decor et lieux
    "fond": "background",
    "arrière-plan": "background",
    "arriere-plan": "background",
    "décor": "set",
    "decor": "set",
    "scène": "scene",
    "scene": "scene",
    "vidéo": "video",
    "video": "video",
    "image": "image",
    "plage": "beach",
    "mer": "sea",
    "océan": "ocean",
    "ocean": "ocean",
    "montagne": "mountain",
    "montagnes": "mountains",
    "forêt": "forest",
    "foret": "forest",
    "jungle": "jungle",
    "désert": "desert",
    "desert": "desert",
    "ville": "city",
    "rue": "street",
    "route": "road",
    "parc": "park",
    "jardin": "garden",
    "maison": "house",
    "château": "castle",
    "chateau": "castle",
    "bureau": "office",
    "cuisine": "kitchen",
    "salon": "living room",
    "chambre": "bedroom",
    "studio": "studio",
    "espace": "outer space",
    "lune": "moon",
    "ciel": "sky",
    "nuage": "cloud",
    "nuages": "clouds",
    "étoiles": "stars",
    "etoiles": "stars",
    "arbre": "tree",
    "arbres": "trees",
    "herbe": "grass",
    "eau": "water",
    "lac": "lake",
    "rivière": "river",
    "riviere": "river",
    "cascade": "waterfall",
    "pont": "bridge",
    "immeuble": "building",
    "immeubles": "buildings",
    "mur": "wall",
    "sol": "floor",
    "fenêtre": "window",
    "fenetre": "window",
    "porte": "door",
    "neon": "neon",
    "néons": "neon lights",
    "neons": "neon lights",
    # meteo et lumiere
    "pluie": "rain",
    "neige": "snow",
    "orage": "thunderstorm",
    "éclairs": "lightning",
    "eclairs": "lightning",
    "brouillard": "fog",
    "brume": "mist",
    "tempête": "storm",
    "tempete": "storm",
    "vent": "wind",
    "soleil": "sun",
    "nuit": "night",
    "jour": "day",
    "aube": "dawn",
    "crépuscule": "dusk",
    "crepuscule": "dusk",
    "hiver": "winter",
    "été": "summer",
    "ete": "summer",
    "automne": "autumn",
    "printemps": "spring",
    "lumière": "light",
    "lumiere": "light",
    "éclairage": "lighting",
    "eclairage": "lighting",
    "ombre": "shadow",
    "ombres": "shadows",
    "reflets": "reflections",
    "feu": "fire",
    "flammes": "flames",
    "fumée": "smoke",
    "fumee": "smoke",
    "étincelles": "sparks",
    "etincelles": "sparks",
    "bougies": "candles",
    # styles et cadrage
    "style": "style",
    "anime": "anime",
    "animé": "anime",
    "manga": "manga",
    "cartoon": "cartoon",
    "aquarelle": "watercolor",
    "peinture": "painting",
    "croquis": "sketch",
    "argile": "clay",
    "cyberpunk": "cyberpunk",
    "steampunk": "steampunk",
    "ghibli": "Ghibli-like hand-drawn animation",
    "pixar": "3D animated film",
    "vintage": "vintage",
    "angle": "angle",
    "caméra": "camera",
    "camera": "camera",
    "plan": "shot",
    "travelling": "tracking shot",
    "zoom": "zoom",
    "plongée": "high-angle shot",
    "plongee": "high-angle shot",
    "contre-plongée": "low-angle shot",
    "contre-plongee": "low-angle shot",
    "couleur": "color",
    "couleurs": "colors",
    "teinte": "tint",
    "effet": "effect",
    "ralenti": "slow motion",
}

ADJECTIVES: dict[str, str] = {
    # couleurs
    "rouge": "red",
    "bleu": "blue",
    "bleue": "blue",
    "vert": "green",
    "verte": "green",
    "jaune": "yellow",
    "orange": "orange",
    "violet": "purple",
    "violette": "purple",
    "rose": "pink",
    "noir": "black",
    "noire": "black",
    "blanc": "white",
    "blanche": "white",
    "gris": "gray",
    "grise": "gray",
    "marron": "brown",
    "brun": "brown",
    "brune": "brown",
    "beige": "beige",
    "doré": "golden",
    "dore": "golden",
    "dorée": "golden",
    "doree": "golden",
    "argenté": "silver",
    "argente": "silver",
    "argentée": "silver",
    "turquoise": "turquoise",
    "bordeaux": "burgundy",
    "fluo": "neon",
    "pastel": "pastel",
    "foncé": "dark",
    "fonce": "dark",
    "foncée": "dark",
    "clair": "light",
    "claire": "light",
    "vif": "vivid",
    "vive": "vivid",
    # finitions et matieres (adjectifs)
    "mat": "matte",
    "brillant": "glossy",
    "brillante": "glossy",
    "métallique": "metallic",
    "metallique": "metallic",
    "transparent": "transparent",
    "transparente": "transparent",
    # taille, age, aspect
    "grand": "large",
    "grande": "large",
    "petit": "small",
    "petite": "small",
    "gros": "big",
    "grosse": "big",
    "énorme": "huge",
    "enorme": "huge",
    "minuscule": "tiny",
    "long": "long",
    "longue": "long",
    "court": "short",
    "courte": "short",
    "vieux": "old",
    "vieille": "old",
    "ancien": "old",
    "ancienne": "old",
    "jeune": "young",
    "nouveau": "new",
    "nouvelle": "new",
    "moderne": "modern",
    "futuriste": "futuristic",
    "rétro": "retro",
    "retro": "retro",
    "beau": "beautiful",
    "belle": "beautiful",
    "joli": "pretty",
    "jolie": "pretty",
    "élégant": "elegant",
    "elegant": "elegant",
    "élégante": "elegant",
    "elegante": "elegant",
    "magique": "magical",
    "lumineux": "bright",
    "lumineuse": "bright",
    "sombre": "dark",
    "chaud": "warm",
    "chaude": "warm",
    "froid": "cold",
    "froide": "cold",
    "doux": "soft",
    "douce": "soft",
    "dramatique": "dramatic",
    "cinématographique": "cinematic",
    "cinematographique": "cinematic",
    "réaliste": "realistic",
    "realiste": "realistic",
    "enneigé": "snowy",
    "enneige": "snowy",
    "enneigée": "snowy",
    "pluvieux": "rainy",
    "pluvieuse": "rainy",
    "nuageux": "cloudy",
    "ensoleillé": "sunny",
    "ensoleille": "sunny",
    "brumeux": "misty",
    "tropical": "tropical",
    "tropicale": "tropical",
    "urbain": "urban",
    "urbaine": "urban",
    "médiéval": "medieval",
    "medieval": "medieval",
    "médiévale": "medieval",
    "japonais": "Japanese",
    "japonaise": "Japanese",
    "spatial": "space",
    "flou": "blurred",
    "floue": "blurred",
    "animé": "animated",
    "seul": "alone",
    "seule": "alone",
    "derrière": "behind",
}

# Matieres introduites par « en » (« une veste en cuir » -> « a leather jacket »).
MATERIALS: dict[str, str] = {
    "cuir": "leather",
    "bois": "wooden",
    "laine": "wool",
    "soie": "silk",
    "coton": "cotton",
    "jean": "denim",
    "or": "gold",
    "argent": "silver",
    "métal": "metal",
    "metal": "metal",
    "verre": "glass",
    "pierre": "stone",
    "plastique": "plastic",
    "papier": "paper",
    "velours": "velvet",
    "dentelle": "lace",
    "fourrure": "fur",
    "marbre": "marble",
    "cristal": "crystal",
    "glace": "ice",
    "lego": "LEGO-brick",
}

# Mots-outils ignores (partitifs, pronoms) : ils n'empechent pas une traduction complete.
_DROP = {"de", "du", "des", "d'", "en", "y", "lui", "elle", "il", "qu'", "s'", "là", "là-bas"}

_EN_MARKERS = {
    "the",
    "a",
    "an",
    "with",
    "and",
    "of",
    "to",
    "in",
    "on",
    "remove",
    "add",
    "replace",
    "change",
    "make",
    "turn",
    "into",
    "background",
    "from",
    "it",
    "is",
    "style",
}
_FR_MARKERS = {
    "le",
    "la",
    "les",
    "un",
    "une",
    "des",
    "du",
    "de",
    "et",
    "avec",
    "par",
    "dans",
    "sur",
    "en",
    "au",
    "aux",
    "pour",
    "mets",
    "met",
    "fais",
    "fait",
    "rends",
    "est",
}

_RIGHT_QUOTE = chr(0x2019)  # apostrophe typographique, normalisee en "'"
_TOKEN_PATTERN = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9'-]+|[^\sA-Za-zÀ-ÖØ-öø-ÿ0-9]")
_ELISION_PATTERN = re.compile(r"^(l|d|j|qu|s|n|c)'(.+)$", re.I)


def tokenize(text: str) -> list[str]:
    """Decoupe en mots (elisions separees : « l'homme » -> « l' », « homme »)."""
    tokens: list[str] = []
    for raw in _TOKEN_PATTERN.findall(text.replace(_RIGHT_QUOTE, "'")):
        match = _ELISION_PATTERN.match(raw)
        if match:
            tokens.extend([f"{match.group(1)}'", match.group(2)])
        else:
            tokens.append(raw)
    return tokens


def looks_english(text: str) -> bool:
    """Indique si la demande est deja redigee en anglais (marqueurs grammaticaux)."""
    words = [token.lower() for token in tokenize(text)]
    english = sum(word in _EN_MARKERS for word in words)
    french = sum(word in _FR_MARKERS for word in words)
    return english > french


def _singular_forms(word: str) -> list[str]:
    """Formes candidates d'un mot francais (pluriel et feminin retires)."""
    forms = [word]
    for suffix in ("s", "x", "es", "e"):
        if word.endswith(suffix) and len(word) > len(suffix) + 2:
            forms.append(word[: -len(suffix)])
    return forms


def _pluralize(english: str) -> str:
    if " " in english or english.endswith(("s", "sh", "ch")):
        return english
    if english.endswith("y") and english[-2:-1] not in "aeiou":
        return english[:-1] + "ies"
    return english + "s"


_FUNCTION_WORDS: tuple[tuple[dict[str, str], str], ...] = (
    (DETERMINERS, "det"),
    (PREPOSITIONS, "p"),
    (ADVERBS, "adv"),
)


def _lookup_word(word: str, previous: str) -> tuple[str, str] | None:
    """Traduit un mot isole : (anglais, categorie) ou None s'il est inconnu."""
    lower = word.lower()
    if previous == "en" and lower in MATERIALS:
        return MATERIALS[lower], "m"
    for table, category in _FUNCTION_WORDS:
        if lower in table:
            return table[lower], category
    for index, form in enumerate(_singular_forms(lower)):
        if form in NOUNS:
            english = NOUNS[form]
            is_plural = index > 0 and lower.endswith(("s", "x"))
            return (_pluralize(english) if is_plural else english), "n"
        if form in ADJECTIVES:
            return ADJECTIVES[form], "a"
    return None


def _match_phrase(lowered: list[str], start: int) -> tuple[int, tuple[str, str]] | None:
    """Cherche l'expression la plus longue commencant a ``start``."""
    for length in range(5, 0, -1):
        chunk = lowered[start : start + length]
        if len(chunk) < length:
            continue
        candidate = " ".join(chunk).replace(" ' ", "'").replace("' ", "'")
        if candidate in PHRASES:
            return length, PHRASES[candidate]
    return None


def _reorder(tagged: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Place adjectifs et matieres avant le nom (« chapeau rouge » -> « red hat »)."""
    result = list(tagged)
    index = 0
    while index < len(result):
        if result[index][1] == "n":
            end = index + 1
            while end < len(result) and result[end][1] in {"a", "m"}:
                end += 1
            if end > index + 1:
                modifiers = result[index + 1 : end]
                adjectives = [item for item in modifiers if item[1] == "a"]
                materials = [item for item in modifiers if item[1] == "m"]
                result[index:end] = [*adjectives, *materials, result[index]]
                index = end
                continue
        index += 1
    return result


def _function_word(lower: str, next_word: str, tagged: list[tuple[str, str]]) -> str:
    """Mot-outil (de, du, en...) : traduction selon le contexte, ou "" s'il disparait."""
    after_noun = bool(tagged) and tagged[-1][1] == "n"
    if lower in {"de", "d'", "du", "des"} and after_noun:
        return "of the" if lower in {"du", "des"} else "of"  # « la couleur de la voiture »
    if lower == "en" and after_noun and next_word and next_word not in MATERIALS:
        return "in"  # « un chevalier en armure » -> « a knight in armor » (pas une matiere)
    return ""


def _step(tokens: list[str], lowered: list[str], index: int, tagged: list) -> tuple[int, bool]:
    """Traduit le mot (ou l'expression) en ``index`` ; retourne (pas, mot connu)."""
    phrase = _match_phrase(lowered, index)
    if phrase is not None:
        tagged.append(phrase[1])
        return phrase[0], True
    token, lower = tokens[index], lowered[index]
    next_word = lowered[index + 1] if index + 1 < len(lowered) else ""
    found = _lookup_word(token, lowered[index - 1] if index else "")
    if found is not None:
        tagged.append(found)
        return 1, True
    if lower == "de" and next_word in {"la", "l'"} and not (tagged and tagged[-1][1] == "n"):
        return 2, True  # partitif « de la neige » -> « snow »
    if lower in _DROP:
        word = _function_word(lower, next_word, tagged)
        if word:
            tagged.append((word, "p"))
        return 1, True
    tagged.append((token, "x"))
    # nombre, ponctuation ou nom propre : conserves tels quels sans penaliser
    return 1, token.isdigit() or not token.isalpha() or token[:1].isupper()


def translate(fragment: str) -> tuple[str, bool]:
    """Traduit un fragment francais en anglais.

    Retourne ``(traduction, complete)`` ; ``complete`` vaut False si au moins
    un mot porteur de sens est inconnu du lexique.
    """
    tokens = tokenize(fragment)
    lowered = [token.lower() for token in tokens]
    tagged: list[tuple[str, str]] = []
    complete = True
    index = 0
    while index < len(tokens):
        step, known = _step(tokens, lowered, index, tagged)
        complete = complete and known
        index += step

    text = " ".join(english for english, _ in _reorder(tagged) if english)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\ba ([aeiouAEIOU])", r"an \1", text)
    text = re.sub(r"\bthe the\b", "the", text)
    return text.strip(), complete
