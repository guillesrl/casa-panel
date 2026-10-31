#!/usr/bin/env python3
"""Hourly scheduler wrapper: emit output only at 09:00 and 20:00 Europe/Andorra."""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
PYTHON = ROOT / ".venv" / "bin" / "python"
READER = ROOT / "reader.py"
TZ = ZoneInfo("Europe/Andorra")
now = datetime.now(TZ)

if now.minute != 0 or now.hour not in (9, 20):
    raise SystemExit(0)

proc = subprocess.run(
    [str(PYTHON), str(READER), "--read"],
    capture_output=True,
    text=True,
    timeout=90,
)
try:
    result = json.loads(proc.stdout.strip())
except Exception:
    print("No pude consultar la lista de compras de Alexa: respuesta no válida.")
    raise SystemExit(0)

if result.get("ok"):
    items = result.get("items", [])
    if items:
        print("Lista de compras de Alexa:")
        for item in items:
            print(f"- {item}")
    else:
        print("La lista de compras de Alexa está vacía.")
else:
    status = result.get("status", "error")
    messages = {
        "login_required": "No pude leer la lista de compras de Alexa porque la sesión necesita iniciar sesión.",
        "selector_drift_or_empty": "No pude confirmar la lista de compras de Alexa; puede estar vacía o haber cambiado la página.",
        "timeout": "No pude leer la lista de compras de Alexa porque la página tardó demasiado.",
    }
    print(messages.get(status, "No pude leer la lista de compras de Alexa."))
