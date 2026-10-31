#!/usr/bin/env python3
"""Local read-only HTTP adapter for Casa panel."""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from reader import read_list

HOST = os.environ.get("ALEXA_BRIDGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("ALEXA_BRIDGE_PORT", "8765"))
TOKEN = os.environ.get("ALEXA_BRIDGE_TOKEN", "")
TOKEN_FILE = os.environ.get("ALEXA_BRIDGE_TOKEN_FILE", "")
if not TOKEN and TOKEN_FILE:
    TOKEN = Path(TOKEN_FILE).read_text(encoding="utf-8").strip()


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

    def do_GET(self):
        if self.path != "/":
            self.send_json(404, {"error": "Not found"})
            return
        if TOKEN and self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.send_json(401, {"error": "Unauthorized"})
            return
        result = read_list()
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
