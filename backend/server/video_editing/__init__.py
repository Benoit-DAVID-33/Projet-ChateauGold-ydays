"""Edition video par IA : modifier une video existante a des moments precis.

- ``catalog``   : fiches des modeles (formats, qualites reelles, prix, preuves) ;
- ``routing``   : choix du modele le plus coherent pour chaque modification ;
- ``planner``   : decoupage en segments, contexte, morceaux, cout estime ;
- ``providers`` : adaptateurs d'API (Kling, fal.ai, Decart, Luma) ;
- ``jobs``      : travaux persistes et file prioritaire ;
- ``pipeline``  : decoupe -> edition -> assemblage -> audio d'origine ;
- ``service``   : orchestration (offre, tri, plan, prompts, quota).
"""
