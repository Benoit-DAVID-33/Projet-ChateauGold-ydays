#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script de test pour l'application Flask - Projet YDays.
Exécuter : python run_tests.py
"""
import sys

def test_imports():
    """Vérifier que tous les modules s'importent correctement."""
    try:
        from app import app
        import external_api
        return True
    except Exception as e:
        print("ERREUR imports:", e)
        return False

def test_routes():
    """Tester les routes principales avec le client de test Flask."""
    from app import app
    routes_ok = []
    routes_fail = []
    with app.test_client() as c:
        for path, expected_codes in [
            ("/", [200]),
            ("/image", [200]),
            ("/video", [200]),
            ("/information", [200]),
            ("/contact", [200]),
            ("/search", [200]),
            ("/search?q=test", [200]),
            ("/image?image=test.png", [200]),
        ]:
            r = c.get(path)
            if r.status_code in expected_codes:
                routes_ok.append(f"GET {path} -> {r.status_code}")
            else:
                routes_fail.append(f"GET {path} -> {r.status_code} (attendu {expected_codes})")
    return routes_ok, routes_fail

def test_templates():
    """Vérifier que les templates image contiennent les éléments attendus."""
    from app import app
    with app.test_client() as c:
        r = c.get("/image?image=test.png")
        if r.status_code != 200:
            return False, f"GET /image -> {r.status_code}"
        data = r.get_data(as_text=True)
        if "editingCanvas" not in data:
            return False, "Template image: 'editingCanvas' non trouvé"
        if "editableImage" not in data:
            return False, "Template image: 'editableImage' non trouvé"
    return True, "OK"

def main():
    print("=== Tests Projet YDays ===\n")
    all_ok = True

    print("1. Imports...")
    if test_imports():
        print("   OK (app, external_api)\n")
    else:
        print("   ÉCHEC\n")
        return 1

    print("2. Routes principales...")
    routes_ok, routes_fail = test_routes()
    for s in routes_ok:
        print("   OK", s)
    for s in routes_fail:
        print("   ÉCHEC", s)
        all_ok = False
    print()

    print("3. Templates (image)...")
    ok, msg = test_templates()
    if ok:
        print("   OK", msg, "\n")
    else:
        print("   ÉCHEC", msg, "\n")
        all_ok = False

    if all_ok:
        print("=== Tous les tests sont passés ===\n")
        return 0
    print("=== Certains tests ont échoué ===\n")
    return 1

if __name__ == "__main__":
    sys.exit(main())
