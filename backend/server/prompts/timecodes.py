"""Lecture des reperes temporels d'une demande (« a 2 s », « de 3 a 5 s »...).

Formats reconnus (francais et anglais) :

- instant : « a 2 s », « a 2 secondes », « a la 2e seconde », « a la deuxieme
  seconde », « a 0:15 », « a 1 min 30 », « at 2s », « at 0:15 » ;
- intervalle : « de 3 a 5 s », « entre 3 et 5 secondes », « from 3s to 5s »,
  « de 0:10 a 0:15 » ;
- duree : « pendant 4 s », « durant 3 secondes », « for 4 seconds » ;
- bornes : « au debut », « des le debut », « jusqu'a la fin », « a la fin ».

``extract`` retourne la fenetre trouvee **et** le texte nettoye des reperes,
pour que le prompt envoye au modele ne contienne pas « a la 2e seconde ».
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_NUMBER_WORDS = {
    "zéro": 0,
    "zero": 0,
    "un": 1,
    "une": 1,
    "deux": 2,
    "trois": 3,
    "quatre": 4,
    "cinq": 5,
    "six": 6,
    "sept": 7,
    "huit": 8,
    "neuf": 9,
    "dix": 10,
    "onze": 11,
    "douze": 12,
    "treize": 13,
    "quatorze": 14,
    "quinze": 15,
    "seize": 16,
    "vingt": 20,
    "trente": 30,
    "quarante": 40,
    "cinquante": 50,
    "soixante": 60,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "ten": 10,
    "fifteen": 15,
    "twenty": 20,
    "thirty": 30,
}
_ORDINALS = {
    "première": 1,
    "premiere": 1,
    "premier": 1,
    "deuxième": 2,
    "deuxieme": 2,
    "seconde": 2,
    "troisième": 3,
    "troisieme": 3,
    "quatrième": 4,
    "quatrieme": 4,
    "cinquième": 5,
    "cinquieme": 5,
    "sixième": 6,
    "sixieme": 6,
    "septième": 7,
    "septieme": 7,
    "huitième": 8,
    "huitieme": 8,
    "neuvième": 9,
    "neuvieme": 9,
    "dixième": 10,
    "dixieme": 10,
    "quinzième": 15,
    "quinzieme": 15,
    "vingtième": 20,
    "vingtieme": 20,
    "trentième": 30,
    "trentieme": 30,
}

_NUM = r"\d+(?:[.,]\d+)?"
_WORD_NUM = "|".join(sorted(_NUMBER_WORDS, key=len, reverse=True))
_ORD_WORD = "|".join(sorted(_ORDINALS, key=len, reverse=True))
_UNIT = r"(?:s\b|sec\b|secs\b|secondes?\b|seconds?\b)"
_CLOCK = r"\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?"
_MINSEC = rf"{_NUM}\s*(?:min|mn|minutes?|m(?=\s*\d))\s*(?:{_NUM}\s*{_UNIT}?)?"
# Une valeur temporelle : horloge, « 1 min 30 », « 2 s », « deux secondes », « 2e seconde ».
_VALUE = (
    rf"(?:{_CLOCK}|{_MINSEC}|(?:{_NUM}|{_WORD_NUM})\s*{_UNIT}"
    rf"|(?:{_NUM})\s*(?:e|ème|eme|è|er|re)\s+{_UNIT}|(?:{_ORD_WORD})\s+{_UNIT})"
)
_AT = r"(?:à\s+la|a\s+la|à|a|au|dès|des|at|from|starting at)"

_RANGE = re.compile(
    rf"\b(?:de|entre|from|between)\s+(?P<start>{_VALUE}|{_NUM}|{_WORD_NUM})\s+"
    rf"(?:à|a|et|to|and|-)\s+(?:la\s+)?(?P<end>{_VALUE})",
    re.I,
)
_INSTANT = re.compile(rf"\b{_AT}\s+(?P<at>{_VALUE})", re.I)
_DURATION = re.compile(rf"\b(?:pendant|durant|sur|for|during)\s+(?P<length>{_VALUE})", re.I)
_UNTIL_END = re.compile(
    r"\b(?:jusqu'?\s*(?:à|a)\s+la\s+fin(?:\s+de\s+la\s+vid[ée]o)?|until the end|to the end)\b",
    re.I,
)
_AT_START = re.compile(
    r"\b(?:au\s+d[ée]but(?:\s+de\s+la\s+vid[ée]o)?|d[èe]s\s+le\s+d[ée]but"
    r"|at the (?:start|beginning))\b",
    re.I,
)
_AT_END = re.compile(
    r"\b(?:à|a)\s+la\s+fin(?:\s+de\s+la\s+vid[ée]o)?\b|\bat the end\b",
    re.I,
)

# Fenetre appliquee pour « a la fin » sans duree precisee.
END_WINDOW_SECONDS = 5.0


def parse_value(text: str) -> float | None:
    """Convertit une valeur temporelle (« 1 min 30 », « 0:15 », « deux secondes ») en secondes."""
    value = text.strip().lower().replace(",", ".")
    if ":" in value:
        parts = [float(part) for part in re.findall(r"\d+(?:\.\d+)?", value)]
        seconds = 0.0
        for part in parts:
            seconds = seconds * 60 + part
        return seconds
    minutes = re.match(
        rf"^({_NUM.replace(',', '.')})\s*(?:min|mn|minutes?|m)\s*(\d+(?:\.\d+)?)?", value
    )
    if minutes:
        return float(minutes.group(1)) * 60 + float(minutes.group(2) or 0)
    number = re.match(r"^(\d+(?:\.\d+)?)", value)
    if number:
        return float(number.group(1))
    first = value.split()[0] if value.split() else ""
    if first in _NUMBER_WORDS:
        return float(_NUMBER_WORDS[first])
    if first in _ORDINALS:
        return float(_ORDINALS[first])
    return None


@dataclass(frozen=True)
class TimeWindow:
    """Fenetre temporelle d'une modification (``end`` None = jusqu'a la fin)."""

    start: float | None = None
    end: float | None = None
    length: float | None = None
    anchor: str = ""  # "" | "start" | "end"

    @property
    def is_set(self) -> bool:
        """Indique si la demande precisait un moment."""
        values = (self.start, self.end, self.length)
        return any(value is not None for value in values) or bool(self.anchor)

    def resolve(self, video_duration: float) -> tuple[float, float, list[str]]:
        """Fenetre concrete [debut, fin] pour une video donnee + hypotheses faites."""
        notes: list[str] = []
        if self.anchor == "end":
            length = self.length or END_WINDOW_SECONDS
            start = max(0.0, video_duration - length)
            notes.append(f"« à la fin » interprété comme les {length:g} dernières secondes.")
            return start, video_duration, notes
        if self.start is None and self.length is not None:
            notes.append(f"Début non précisé : les {self.length:g} premières secondes.")
        start = self.start if self.start is not None else 0.0
        if self.end is not None:
            end = self.end
        elif self.length is not None:
            end = start + self.length
        else:
            end = video_duration
            if self.start is not None:
                notes.append(
                    f"Fin non précisée : modification appliquée de {start:g} s jusqu'à la "
                    "fin de la vidéo."
                )
        start = min(max(0.0, start), video_duration)
        end = min(max(start, end), video_duration)
        return start, end, notes


def extract(text: str) -> tuple[TimeWindow, str]:
    """Extrait la fenetre temporelle d'une clause et retourne le texte sans reperes."""
    start = end = length = None
    anchor = ""
    cleaned = text.replace(chr(0x2019), "'")

    match = _RANGE.search(cleaned)
    if match:
        start, end = parse_value(match["start"]), parse_value(match["end"])
        cleaned = cleaned[: match.start()] + cleaned[match.end() :]
    else:
        match = _INSTANT.search(cleaned)
        if match:
            start = parse_value(match["at"])
            cleaned = cleaned[: match.start()] + cleaned[match.end() :]

    match = _DURATION.search(cleaned)
    if match:
        length = parse_value(match["length"])
        cleaned = cleaned[: match.start()] + cleaned[match.end() :]

    if _UNTIL_END.search(cleaned):
        cleaned = _UNTIL_END.sub("", cleaned)
        end = None
    elif _AT_START.search(cleaned):
        cleaned = _AT_START.sub("", cleaned)
        start = 0.0 if start is None else start
    elif _AT_END.search(cleaned) and start is None:
        cleaned = _AT_END.sub("", cleaned)
        anchor = "end"

    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" ,;:.")
    return TimeWindow(start=start, end=end, length=length, anchor=anchor), cleaned


# Expression reconnue en debut de clause (sert au decoupage « puis a 15 s ajoute... »).
LEADING_TIME = (
    rf"(?:{_AT}\s+{_VALUE}|(?:de|entre|from|between)\s+\S+\s+(?:à|a|et|to|and)\s+{_VALUE})"
)
