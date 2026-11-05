#!/usr/bin/env python3
"""Local read-only HTTP adapter for Casa panel."""
from __future__ import annotations

import json
import fcntl
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from time import time

from reader import read_list

HOST = os.environ.get("ALEXA_BRIDGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("ALEXA_BRIDGE_PORT", "8765"))
TOKEN = os.environ.get("ALEXA_BRIDGE_TOKEN", "")
TOKEN_FILE = os.environ.get("ALEXA_BRIDGE_TOKEN_FILE", "")
if not TOKEN and TOKEN_FILE:
    TOKEN = Path(TOKEN_FILE).read_text(encoding="utf-8").strip()
PROFILE_LOCK = Path("/data/login.lock")
RECONNECT_REQUEST = Path("/data/reconnect-request")
RECONNECT_STATUS = Path("/data/reconnect-status")
LOGIN_REQUEST = Path(os.environ.get("ALEXA_LOGIN_REQUEST_FILE", "/data/login-request"))


class Handler(BaseHTTPRequestHandler):
    server_version = "AlexaShoppingReader/1.0"

    def log_message(self, fmt, *args):
        # Never log Authorization headers or list contents.
        return

    def send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        return not TOKEN or self.headers.get("Authorization") == f"Bearer {TOKEN}"

    def do_POST(self):
        if self.path == "/reconnect/start":
            if not self.authorized():
                self.send_json(401, {"error": "Unauthorized"}); return
            try:
                if RECONNECT_REQUEST.exists() or (RECONNECT_STATUS.exists() and RECONNECT_STATUS.read_text().strip() == "running" and time() - RECONNECT_STATUS.stat().st_mtime < 180):
                    self.send_json(202, {"status": "running"}); return
                RECONNECT_STATUS.write_text("queued", encoding="utf-8")
                RECONNECT_REQUEST.touch()
                self.send_json(202, {"status": "queued"})
            except OSError:
                self.send_json(503, {"status": "unavailable"})
            return
        if self.path != "/login/start":
            self.send_json(404, {"error": "Not found"})
            return
        if not self.authorized():
            self.send_json(401, {"error": "Unauthorized"})
            return
        try:
            if LOGIN_REQUEST.exists() and time() - LOGIN_REQUEST.stat().st_mtime < 300:
                self.send_json(202, {"status": "already_queued"})
                return
            LOGIN_REQUEST.parent.mkdir(parents=True, exist_ok=True)
            temp=LOGIN_REQUEST.with_suffix(".tmp")
            temp.write_text(str(int(time())), encoding="utf-8")
            temp.replace(LOGIN_REQUEST)
            self.send_json(202, {"status": "queued"})
        except OSError:
            self.send_json(503, {"status": "unavailable"})

    def do_GET(self):
        if self.path == "/reconnect/status":
            if not self.authorized():
                self.send_json(401, {"error": "Unauthorized"}); return
            try:
                status = RECONNECT_STATUS.read_text().strip() if RECONNECT_STATUS.exists() else "idle"
                if status in ("queued", "running") and time() - RECONNECT_STATUS.stat().st_mtime > 180:
                    status = "error"
                self.send_json(200, {"status": status if status in ("idle", "queued", "running", "ok", "login_required", "error") else "error"})
            except OSError:
                self.send_json(503, {"status": "unavailable"})
            return
        if self.path != "/":
            self.send_json(404, {"error": "Not found"})
            return
        if not self.authorized():
            self.send_json(401, {"error": "Unauthorized"})
            return
        try:
            with PROFILE_LOCK.open("a") as lock:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    self.send_json(503, {"status": "busy"})
                    return
                result = read_list()
        except OSError:
            self.send_json(503, {"status": "unavailable"})
            return
        if not result.get("ok"):
            self.send_json(503, {"error": result.get("message", "Alexa unavailable"), "status": result.get("status")})
            return
        self.send_json(200, {
            "updatedAt": result["checked_at"],
            "items": [
                {"id": str(i), "name": name, "completed": False}
                for i, name in enumerate(result["items"])
            ],
        })


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("ALEXA_BRIDGE_TOKEN must be set")
    print(f"Alexa bridge listening on {HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
