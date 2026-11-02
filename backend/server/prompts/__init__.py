"""Prompt engineering video-to-video.

Ordre de traitement d'une demande :

1. ``triage``    : decoupage en modifications, moments, intentions, questions ;
2. ``timecodes`` : lecture des reperes temporels (« a 2 s », « de 3 a 5 s ») ;
3. ``cinema``    : jargon de tournage francais -> vocabulaire anglais ;
4. ``lexicon``   : traduction francais -> anglais hors ligne ;
5. ``enhancer``  : prompt adapte au modele cible (regles, ou LLM gratuit guide) ;
6. ``chat``      : assistant conversationnel qui s'appuie sur les etapes 1 a 5.
"""
