from flask import Flask, request, send_file
import os
from werkzeug.utils import secure_filename

app = Flask(__name__)

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"))
UPLOAD_FOLDER = os.path.join(DATA_DIR, "api_uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route("/process-video", methods=["POST"])
def process_video():
    file = request.files.get("file")
    if not file:
        return {"error": "Aucun fichier reçu"}, 400

    # Récupérer le texte de la requête s'il existe
    query = request.form.get("query", "")
    
    filename = secure_filename(file.filename)
    path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(path)

    # 👉 Ici normalement : traitement vidéo/image (IA, compression, etc.)
    # Le texte de la requête (query) est disponible pour le traitement
    # Pour la démo : on renvoie le même fichier
    
    # Détecter le type de fichier
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    if ext in ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']:
        mimetype = f"image/{ext}" if ext != 'jpg' else "image/jpeg"
    elif ext in ['mp4', 'avi', 'mov', 'mkv', 'webm']:
        mimetype = "video/mp4"
    else:
        mimetype = "application/octet-stream"

    # Log pour debug (peut être retiré en production)
    if query:
        print(f"📝 Requête texte reçue avec le média: {query}")

    return send_file(
        path,
        mimetype=mimetype,
        as_attachment=True,
        download_name="processed_" + filename
    )

@app.route("/process-query", methods=["POST"])
def process_query():
    """Route pour traiter les requêtes texte de la barre de recherche"""
    data = request.get_json()
    query = data.get("query", "")
    
    if not query:
        return {"error": "Aucune requête reçue"}, 400
    
    # 👉 Ici normalement : traitement de la requête (IA, recherche, etc.)
    # Pour la démo : on renvoie une réponse simple
    
    return {
        "status": "success",
        "query": query,
        "response": f"Requête reçue : '{query}'. Traitement en cours...",
        "timestamp": __import__('datetime').datetime.now().isoformat()
    }

if __name__ == "__main__":
    app.run(port=5001, debug=True)
