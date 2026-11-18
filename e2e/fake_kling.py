"""Faux serveur Kling pour les tests de bout en bout.

Deux écoutes :
- API HTTP (``--api-port``) : mêmes chemins que Kling, réponses au format Kling.
- Fichiers HTTPS (``--files-port``) : résultats des tâches. L'API GOLD FX n'accepte que des
  URL de résultat en HTTPS ; le certificat auto-signé est fourni à l'API via ``SSL_CERT_FILE``.

Chaque tâche passe à « succeed » ``--delay`` secondes après sa création. ``GET /__requests``
renvoie les requêtes reçues (pour les assertions du parcours).
"""

from __future__ import annotations

import argparse
import json
import ssl
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

PATHS = {
    "/v1/images/generations": "image",
    "/v1/videos/text2video": "video",
    "/v1/videos/image2video": "video",
    "/v1/videos/omni-video": "video",
}


class State:
    def __init__(self, files_base: str, delay: float) -> None:
        self.files_base = files_base
        self.delay = delay
        self.tasks: dict[str, dict[str, Any]] = {}
        self.requests: list[dict[str, Any]] = []
        self.lock = threading.Lock()


def make_api_handler(state: State) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args: Any) -> None:  # silencieux
            return

        def _send(self, status: int, body: dict[str, Any] | list[Any]) -> None:
            raw = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def _authorized(self) -> bool:
            if not self.headers.get("Authorization", "").startswith("Bearer "):
                self._send(401, {"code": 1000, "message": "Authorization manquante"})
                return False
            return True

        def do_POST(self) -> None:
            if not self._authorized():
                return
            kind = PATHS.get(self.path)
            if kind is None:
                self._send(404, {"code": 1203, "message": "chemin inconnu"})
                return
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            task_id = uuid.uuid4().hex
            with state.lock:
                state.tasks[task_id] = {"kind": kind, "created": time.time(), "body": body}
                summary = {k: v for k, v in body.items() if k != "image"}
                state.requests.append({"path": self.path, "task_id": task_id, "body": summary})
            self._send(200, {"code": 0, "message": "SUCCEED", "data": {"task_id": task_id}})

        def do_GET(self) -> None:
            if self.path == "/__requests":
                with state.lock:
                    self._send(200, state.requests)
                return
            if not self._authorized():
                return
            base, _, task_id = self.path.split("?")[0].rpartition("/")
            if self.path.split("?")[0] in PATHS:  # liste (test de connexion)
                self._send(200, {"code": 0, "message": "SUCCEED", "data": []})
                return
            task = state.tasks.get(task_id)
            if base not in PATHS or task is None:
                self._send(404, {"code": 1203, "message": "tâche inconnue"})
                return
            if time.time() - task["created"] < state.delay:
                data = {"task_id": task_id, "task_status": "processing"}
            elif task["kind"] == "image":
                count = int(task["body"].get("n", 1))
                images = [
                    {"index": i, "url": f"{state.files_base}/result.png"} for i in range(count)
                ]
                data = {
                    "task_id": task_id,
                    "task_status": "succeed",
                    "task_result": {"images": images},
                }
            else:
                data = {
                    "task_id": task_id,
                    "task_status": "succeed",
                    "task_result": {
                        "videos": [{"id": "v1", "url": f"{state.files_base}/result.mp4"}]
                    },
                }
            self._send(200, {"code": 0, "message": "SUCCEED", "data": data})

    return Handler


def make_files_handler(root: Path) -> type[BaseHTTPRequestHandler]:
    types = {".png": "image/png", ".mp4": "video/mp4"}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args: Any) -> None:
            return

        def do_GET(self) -> None:
            path = root / Path(self.path).name
            if not path.is_file():
                self.send_error(404)
                return
            data = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", types.get(path.suffix, "application/octet-stream"))
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-port", type=int, required=True)
    parser.add_argument("--files-port", type=int, required=True)
    parser.add_argument("--files-dir", type=Path, required=True)
    parser.add_argument("--cert", type=Path, required=True)
    parser.add_argument("--key", type=Path, required=True)
    parser.add_argument("--delay", type=float, default=2.0)
    args = parser.parse_args()

    state = State(f"https://localhost:{args.files_port}", args.delay)
    api = ThreadingHTTPServer(("127.0.0.1", args.api_port), make_api_handler(state))
    files = ThreadingHTTPServer(("127.0.0.1", args.files_port), make_files_handler(args.files_dir))
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(args.cert, args.key)
    files.socket = context.wrap_socket(files.socket, server_side=True)

    threading.Thread(target=files.serve_forever, daemon=True).start()
    print(f"faux Kling : API http://127.0.0.1:{args.api_port}, fichiers {state.files_base}")
    api.serve_forever()


if __name__ == "__main__":
    main()
