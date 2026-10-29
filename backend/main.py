"""Point d'entree ASGI.

Developpement :  python -m uvicorn main:app --reload --port 5000
Production    :  granian --interface asgi --host 0.0.0.0 --port 5000 --workers 2 main:app
"""

from server import create_app

app = create_app()
