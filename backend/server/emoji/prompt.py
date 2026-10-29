"""Analyse d'une composition en langage naturel (« 2 voitures et un avion »).

Portage fidele de `parsePrompt` du studio client : detecte les quantites
(chiffres ou mots) et les termes connus, en ignorant les conjonctions.
"""

from .search import normalize

QUANTITY_WORDS = {
    "one": 1,
    "a": 1,
    "an": 1,
    "un": 1,
    "une": 1,
    "unseul": 1,
    "two": 2,
    "deux": 2,
    "three": 3,
    "trois": 3,
    "four": 4,
    "quatre": 4,
    "five": 5,
    "cinq": 5,
    "six": 6,
    "seven": 7,
    "sept": 7,
    "eight": 8,
    "huit": 8,
    "nine": 9,
    "neuf": 9,
    "ten": 10,
    "dix": 10,
}

CONJUNCTIONS = {"et", "and", ",", "plus"}
_ARTICLES = {"des", "les", "the", "some", "a", "an", "un", "une"}
_QUANTITY_ARTICLES = {"a", "an", "un", "une"}

# Termes reconnus (permet de detecter les expressions de plusieurs mots).
KNOWN_TERMS = {
    "voiture",
    "voitures",
    "car",
    "cars",
    "automobile",
    "automobiles",
    "avion",
    "avions",
    "plane",
    "planes",
    "airplane",
    "airplanes",
    "aeroplane",
    "aeroplanes",
    "train",
    "trains",
    "chat",
    "chats",
    "cat",
    "cats",
    "chien",
    "chiens",
    "dog",
    "dogs",
    "soleil",
    "sun",
    "lune",
    "moon",
    "fleur",
    "fleurs",
    "flower",
    "flowers",
    "arbre",
    "arbres",
    "tree",
    "trees",
    "coeur",
    "heart",
    "coeurs",
    "hearts",
    "etoile",
    "etoiles",
    "star",
    "stars",
    "maison",
    "maisons",
    "house",
    "houses",
    "velo",
    "velos",
    "bike",
    "bikes",
    "bateau",
    "bateaux",
    "boat",
    "boats",
    "bus",
    "pomme",
    "pommes",
    "apple",
    "apples",
    "pizza",
    "pizzas",
}

MAX_QUANTITY = 200


def _is_number(token: str) -> bool:
    return token.isdigit()


def parse_prompt(text: str) -> list[dict]:
    """Retourne la liste des mentions [{query, count}] contenues dans le texte."""
    tokens = [token for token in normalize(text).split(" ") if token]
    mentions: list[dict] = []
    index = 0

    while index < len(tokens):
        if tokens[index] in CONJUNCTIONS:
            index += 1
            continue

        count = 1
        had_quantity = False
        token = tokens[index]
        if _is_number(token):
            count = max(1, min(MAX_QUANTITY, int(token)))
            had_quantity = True
            index += 1
        elif token in QUANTITY_WORDS:
            count = QUANTITY_WORDS[token]
            had_quantity = True
            index += 1

        if index < len(tokens) and tokens[index] in _ARTICLES:
            if tokens[index] in _QUANTITY_ARTICLES and not had_quantity:
                count = 1
            index += 1

        if index >= len(tokens):
            break

        best = ""
        best_length = 0
        for size in range(min(3, len(tokens) - index), 0, -1):
            phrase = " ".join(tokens[index : index + size])
            singular = phrase[:-1] if phrase.endswith("s") else phrase
            if phrase in KNOWN_TERMS or singular in KNOWN_TERMS:
                best = phrase
                best_length = size
                break

        if not best:
            if tokens[index] in CONJUNCTIONS:
                index += 1
                continue
            best = tokens[index]
            best_length = 1

        mentions.append({"query": best, "count": count})
        index += best_length
        while (
            index < len(tokens)
            and not _is_number(tokens[index])
            and tokens[index] not in QUANTITY_WORDS
            and tokens[index] not in CONJUNCTIONS
        ):
            index += 1

    return mentions
