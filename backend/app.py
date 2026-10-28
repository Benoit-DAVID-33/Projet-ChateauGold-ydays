from flask import Flask, render_template, request, redirect, url_for, send_from_directory, jsonify, send_file, abort, flash, session
from flask_mail import Mail, Message
from dotenv import load_dotenv
import os
import requests
import subprocess
import tempfile
import json
from werkzeug.utils import secure_filename
from werkzeug.security import check_password_hash
from functools import wraps

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(BASE_DIR, "data"))

app = Flask(
    __name__,
    template_folder=os.path.join(FRONTEND_DIR, "templates"),
    static_folder=os.path.join(FRONTEND_DIR, "static"),
)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Fichier JSON pour stocker les utilisateurs
USERS_FILE = os.path.join(DATA_DIR, 'users.json')

def load_users():
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_users(users):
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            flash('Veuillez vous connecter pour accéder à cette page.', 'error')
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

# URL de l'API externe (configurable via variable d'environnement pour Docker)
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:5001")

# Import du client Kling API
import kling_api

# Configuration Flask-Mail
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')  # Email d'envoi
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')  # Mot de passe d'application
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_USERNAME', 'noreply@projet-ydays.com')

mail = Mail(app)

VIDEO_FOLDER = os.path.join(DATA_DIR, "videos")
IMAGE_FOLDER = os.path.join(DATA_DIR, "images")
os.makedirs(VIDEO_FOLDER, exist_ok=True)
os.makedirs(IMAGE_FOLDER, exist_ok=True)

ALLOWED_VIDEO_EXTENSIONS = {"mp4", "avi", "mov", "mkv", "webm"}
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"}
ALLOWED_EXTENSIONS = ALLOWED_VIDEO_EXTENSIONS | ALLOWED_IMAGE_EXTENSIONS

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def is_image(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

def is_video(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_VIDEO_EXTENSIONS

@app.context_processor
def inject_user():
    """Injecte les informations utilisateur dans tous les templates"""
    if 'username' in session:
        users = load_users()
        user_email = users.get(session['username'], {}).get('email', 'Non renseigné')
        return {'user_email': user_email}
    return {'user_email': ''}

@app.route("/")
@login_required
def index():
    video = request.args.get('video')
    image = request.args.get('image')
    processed_video = request.args.get('processed')
    processed_image = request.args.get('processed_image')
    return render_template("home.html", title="Accueil", video=video, image=image, processed_video=processed_video, processed_image=processed_image)

@app.route("/video")
@login_required
def video_page():
    video = request.args.get('video')
    processed_video = request.args.get('processed')
    return render_template("video.html", title="Vidéo", video=video, image=None, processed_video=processed_video)

@app.route("/image")
@login_required
def image_page():
    image = request.args.get('image')
    processed_image = request.args.get('processed_image')
    return render_template("image.html", title="Image", video=None, image=image, processed_image=processed_image)

@app.route("/information")
@login_required
def information():
    return render_template("information.html", title="Information")

@app.route("/contact", methods=["GET", "POST"])
@login_required
def contact():
    message_sent = False
    error_message = None
    
    if request.method == "POST":
        name = request.form.get("name")
        email = request.form.get("email")
        message = request.form.get("message")
        
        if name and email and message:
            try:
                # Créer le message email
                msg = Message(
                    subject=f"Message de contact depuis Château Gold - {name}",
                    recipients=["ricardo.mbesob@ynov.com"],
                    body=f"""
Nom: {name}
Email: {email}

Message:
{message}
                    """,
                    reply_to=email
                )
                
                # Envoyer l'email
                mail.send(msg)
                message_sent = True
            except Exception as e:
                error_message = f"Erreur lors de l'envoi de l'email: {str(e)}"
        else:
            error_message = "Veuillez remplir tous les champs."
    
    return render_template("contact.html", title="Contact", message_sent=message_sent, error_message=error_message)

@app.route("/search")
@login_required
def search():
    query = request.args.get('q', '')
    # Ici vous pouvez implémenter la recherche dans vos fichiers
    return render_template("search.html", title="Recherche", query=query)

@app.route("/send-query-to-api", methods=["POST"])
def send_query_to_api():
    """Route proxy pour envoyer une requête texte à l'API externe, avec média optionnel"""
    try:
        data = request.get_json()
        query = data.get("query", "")
        filename = data.get("filename", None)
        
        if not query and not filename:
            return jsonify({"error": "Requête vide et aucun média fourni"}), 400
        
        # Si un média est fourni, l'envoyer avec la requête
        if filename:
            is_img = is_image(filename)
            is_vid = is_video(filename)
            
            if is_img:
                file_path = os.path.join(IMAGE_FOLDER, filename)
                mime_type = f"image/{filename.rsplit('.', 1)[1].lower()}"
                if mime_type == "image/jpg":
                    mime_type = "image/jpeg"
            elif is_vid:
                file_path = os.path.join(VIDEO_FOLDER, filename)
                mime_type = "video/mp4"
            else:
                return jsonify({"error": "Type de fichier non supporté"}), 400
            
            if os.path.exists(file_path):
                with open(file_path, 'rb') as media_file:
                    files = {'file': (filename, media_file, mime_type)}
                    data_to_send = {}
                    if query:
                        data_to_send['query'] = query
                    response = requests.post(f'{API_BASE_URL}/process-video', files=files, data=data_to_send, timeout=300)
            else:
                # Si le fichier n'existe pas, envoyer juste la requête texte
                response = requests.post(
                    f'{API_BASE_URL}/process-query',
                    json={"query": query},
                    timeout=30
                )
        else:
            # Envoyer seulement la requête texte
            response = requests.post(
                f'{API_BASE_URL}/process-query',
                json={"query": query},
                timeout=30
            )
        
        if response.status_code == 200:
            return jsonify(response.json())
        else:
            return jsonify({"error": f"Erreur API: {response.status_code}"}), response.status_code
            
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Impossible de se connecter à l'API externe. Assurez-vous qu'elle est démarrée sur le port 5001."}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/upload", methods=["POST"])
@login_required
def upload_file():
    file = request.files.get("file")
    if not file or not allowed_file(file.filename):
        return redirect(request.referrer or url_for("index"))

    filename = secure_filename(file.filename)
    
    if is_image(filename):
        path = os.path.join(IMAGE_FOLDER, filename)
        file.save(path)
        return redirect(url_for("image_page", image=filename))
    elif is_video(filename):
        path = os.path.join(VIDEO_FOLDER, filename)
        file.save(path)
        return redirect(url_for("video_page", video=filename))
    else:
        return redirect(request.referrer or url_for("index"))

@app.route("/videos/<filename>")
def serve_video(filename):
    path = os.path.join(VIDEO_FOLDER, filename)
    if not os.path.isfile(path):
        abort(404)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mime_map = {
        "mp4": "video/mp4",
        "mov": "video/quicktime",
        "webm": "video/webm",
        "avi": "video/x-msvideo",
        "mkv": "video/x-matroska",
    }
    mimetype = mime_map.get(ext)
    return send_file(path, mimetype=mimetype, as_attachment=False)

@app.route("/images/<filename>")
def serve_image(filename):
    return send_from_directory(IMAGE_FOLDER, filename)

@app.route("/delete/<filename>", methods=["POST"])
def delete_file(filename):
    # Essayer de supprimer depuis les vidéos
    video_path = os.path.join(VIDEO_FOLDER, filename)
    if os.path.exists(video_path):
        os.remove(video_path)
        return jsonify({"status": "deleted"})
    
    # Essayer de supprimer depuis les images
    image_path = os.path.join(IMAGE_FOLDER, filename)
    if os.path.exists(image_path):
        os.remove(image_path)
        return jsonify({"status": "deleted"})
    
    return jsonify({"error": "Fichier non trouvé"}), 404

@app.route("/send-to-api/<filename>", methods=["POST"])
def send_to_api(filename):
    """Route proxy pour envoyer une vidéo ou une image à l'API externe de traitement"""
    try:
        # Récupérer le texte de la barre de recherche s'il existe
        query = request.json.get("query", "") if request.is_json else ""
        
        # Vérifier si c'est une image ou une vidéo
        is_img = is_image(filename)
        is_vid = is_video(filename)
        
        if is_img:
            file_path = os.path.join(IMAGE_FOLDER, filename)
            folder = IMAGE_FOLDER
            mime_type = f"image/{filename.rsplit('.', 1)[1].lower()}"
            if mime_type == "image/jpg":
                mime_type = "image/jpeg"
        elif is_vid:
            file_path = os.path.join(VIDEO_FOLDER, filename)
            folder = VIDEO_FOLDER
            mime_type = "video/mp4"
        else:
            return jsonify({"error": "Type de fichier non supporté"}), 400
        
        if not os.path.exists(file_path):
            return jsonify({"error": "Fichier non trouvé"}), 404
        
        # Envoyer le fichier et le texte à l'API externe simultanément
        with open(file_path, 'rb') as media_file:
            files = {'file': (filename, media_file, mime_type)}
            # Toujours envoyer le query, même s'il est vide, pour que l'API reçoive les deux paramètres
            data = {'query': query if query else ''}
            response = requests.post(f'{API_BASE_URL}/process-video', files=files, data=data, timeout=300)
        
        if response.status_code == 200:
            # Sauvegarder le fichier traité
            processed_filename = f"processed_{filename}"
            processed_path = os.path.join(folder, processed_filename)
            with open(processed_path, 'wb') as f:
                f.write(response.content)
            
            if is_img:
                return jsonify({
                    "status": "success",
                    "message": "Image traitée avec succès",
                    "processed_image": processed_filename
                })
            else:
                return jsonify({
                    "status": "success",
                    "message": "Vidéo traitée avec succès",
                    "processed_video": processed_filename
                })
        else:
            return jsonify({"error": f"Erreur API: {response.status_code}"}), response.status_code
            
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Impossible de se connecter à l'API externe. Assurez-vous qu'elle est démarrée sur le port 5001."}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/convert-webm-to-mp4", methods=["POST"])
def convert_webm_to_mp4():
    """Reçoit un fichier WebM (enregistrement avec annotations), le convertit en MP4 avec ffmpeg, renvoie le fichier."""
    if "file" not in request.files:
        return "Aucun fichier", 400
    f = request.files["file"]
    if not f or f.filename == "":
        return "Aucun fichier", 400
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_in:
            f.save(tmp_in.name)
            path_in = tmp_in.name
        path_out = path_in.replace(".webm", ".mp4")
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", path_in,
                    "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart",
                    path_out
                ],
                check=True,
                capture_output=True,
                timeout=600,
            )
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            if os.path.exists(path_in):
                os.unlink(path_in)
            return ("Conversion impossible (ffmpeg manquant ou erreur). Installez ffmpeg sur le serveur.", 500)
        if not os.path.exists(path_out):
            if os.path.exists(path_in):
                os.unlink(path_in)
            return "Fichier MP4 non créé", 500
        try:
            return send_file(
                path_out,
                mimetype="video/mp4",
                as_attachment=True,
                download_name="video_modifiee_annotations.mp4",
            )
        finally:
            if os.path.exists(path_in):
                os.unlink(path_in)
            if os.path.exists(path_out):
                os.unlink(path_out)
    except Exception as e:
        return (str(e), 500)

@app.route("/login", methods=["GET", "POST"])
def login():
    if 'username' in session:
        return redirect(url_for('index'))
    
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        
        users = load_users()
        if username in users and check_password_hash(users[username]['password'], password):
            session['username'] = username
            next_page = request.args.get('next')
            return redirect(next_page or url_for('index'))
        
        flash('Identifiants incorrects', 'error')
    
    return render_template("login.html", title="Connexion")

@app.route("/register", methods=["GET", "POST"])
def register():
    if 'username' in session:
        return redirect(url_for('index'))
    
    if request.method == "POST":
        username = request.form.get("username")
        email = request.form.get("email")
        password = request.form.get("password")
        
        users = load_users()
        
        if username in users:
            flash('Ce nom d\'utilisateur existe déjà', 'error')
        elif any(u['email'] == email for u in users.values()):
            flash('Cet email est déjà utilisé', 'error')
        else:
            from werkzeug.security import generate_password_hash
            users[username] = {
                'email': email,
                'password': generate_password_hash(password)
            }
            save_users(users)
            flash('Compte créé avec succès ! Vous pouvez maintenant vous connecter.', 'success')
            return redirect(url_for('login'))
    
    return render_template("register.html", title="Inscription")

@app.route("/logout")
@login_required
def logout():
    session.pop('username', None)
    return redirect(url_for('login'))
# ============================================
# ROUTES KLING AI API
# ============================================

@app.route("/kling/test")
def kling_test_connection():
    """Teste la connexion à l'API Kling sans consommer de crédits."""
    result = kling_api.test_connection()
    status_code = 200 if result["ok"] else 502
    return jsonify(result), status_code


@app.route("/kling/generate-image", methods=["POST"])
def kling_generate_image():
    """Génère une image via Kling AI."""
    try:
        data = request.get_json()
        prompt = data.get("prompt", "")
        if not prompt:
            return jsonify({"error": "Le prompt est requis"}), 400

        negative_prompt = data.get("negative_prompt", "")
        aspect_ratio = data.get("aspect_ratio", "16:9")
        n = data.get("n", 1)

        result = kling_api.generate_image(prompt, negative_prompt=negative_prompt, n=n, aspect_ratio=aspect_ratio)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/kling/image-status/<task_id>")
def kling_image_status(task_id):
    """Vérifie le statut d'une tâche de génération d'image."""
    try:
        result = kling_api.get_image_task(task_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/kling/generate-video", methods=["POST"])
def kling_generate_video():
    """Génère une vidéo à partir d'un prompt via Kling AI."""
    try:
        data = request.get_json()
        prompt = data.get("prompt", "")
        if not prompt:
            return jsonify({"error": "Le prompt est requis"}), 400

        duration = data.get("duration", "5")
        aspect_ratio = data.get("aspect_ratio", "16:9")
        mode = data.get("mode", "std")

        result = kling_api.generate_video(prompt, duration=duration, aspect_ratio=aspect_ratio, mode=mode)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/kling/video-status/<task_id>")
def kling_video_status(task_id):
    """Vérifie le statut d'une tâche de génération vidéo."""
    try:
        result = kling_api.get_video_task(task_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/kling/image-to-video", methods=["POST"])
def kling_image_to_video():
    """Génère une vidéo à partir d'une image via Kling AI."""
    try:
        data = request.get_json()
        image_url = data.get("image_url", "")
        if not image_url:
            return jsonify({"error": "L'URL de l'image est requise"}), 400

        prompt = data.get("prompt", "")
        duration = data.get("duration", "5")
        mode = data.get("mode", "std")

        result = kling_api.image_to_video(image_url, prompt=prompt, duration=duration, mode=mode)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/kling/image-to-video-status/<task_id>")
def kling_image_to_video_status(task_id):
    """Vérifie le statut d'une tâche image-to-video."""
    try:
        result = kling_api.get_image2video_task(task_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# URL publique de l'app (ngrok, déploiement...) pour que Kling puisse accéder aux vidéos
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")


@app.route("/kling/omni-video", methods=["POST"])
def kling_omni_video():
    """Envoie une vidéo + prompt à Kling Omni-Video pour transformation.
    Le frontend envoie : { prompt, filename, mode, refer_type }
    """
    try:
        data = request.get_json()
        prompt = data.get("prompt", "")
        filename = data.get("filename", "")
        mode = data.get("mode", "pro")
        refer_type = data.get("refer_type", "base")
        duration = data.get("duration", "5")
        aspect_ratio = data.get("aspect_ratio", None)

        if not prompt:
            return jsonify({"error": "Le prompt est requis"}), 400

        video_url = None
        if filename:
            if not PUBLIC_BASE_URL:
                return jsonify({
                    "error": "PUBLIC_BASE_URL non configurée. Lancez ngrok (ngrok http 5000) et ajoutez PUBLIC_BASE_URL=https://xxxx.ngrok.io dans le .env"
                }), 400
            # Construire l'URL publique de la vidéo
            video_url = f"{PUBLIC_BASE_URL}/videos/{filename}"

        result = kling_api.omni_video(
            prompt=prompt,
            video_url=video_url,
            duration=duration,
            mode=mode,
            refer_type=refer_type,
            aspect_ratio=aspect_ratio
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/kling/omni-video-status/<task_id>")
def kling_omni_video_status(task_id):
    """Vérifie le statut d'une tâche Omni-Video et télécharge la vidéo si prête."""
    try:
        result = kling_api.get_omni_video_task(task_id)

        # Si la tâche est terminée, télécharger la vidéo résultante
        task_data = result.get("data", {})
        if task_data.get("task_status") == "succeed":
            videos = task_data.get("task_result", {}).get("videos", [])
            if videos:
                video_result_url = videos[0].get("url", "")
                if video_result_url:
                    # Télécharger la vidéo depuis Kling et la sauvegarder
                    video_resp = requests.get(video_result_url, timeout=300)
                    if video_resp.status_code == 200:
                        output_filename = f"kling_{task_id}.mp4"
                        output_path = os.path.join(VIDEO_FOLDER, output_filename)
                        with open(output_path, 'wb') as f:
                            f.write(video_resp.content)
                        result["local_video"] = output_filename

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)