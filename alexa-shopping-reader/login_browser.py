#!/usr/bin/env python3
"""Interactive first-login helper; credentials are entered by the user in VNC."""
from __future__ import annotations

import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

profile = Path("/home/ubuntu/.local/share/alexa-shopping-reader/profile")
profile.mkdir(mode=0o700, parents=True, exist_ok=True)
with sync_playwright() as pw:
    context = pw.chromium.launch_persistent_context(
        str(profile), headless=False, viewport={"width": 1280, "height": 900}
    )
    page = context.pages[0] if context.pages else context.new_page()
    page.goto("https://www.amazon.es/gp/alexa-shopping-list", wait_until="domcontentloaded", timeout=45_000)
    print("LOGIN_BROWSER_READY", flush=True)
    print("Completa el inicio de sesión en Amazon España desde la ventana VNC. El proceso se cerrará al detectar la lista autenticada o tras 30 minutos.", flush=True)
    deadline = time.time() + 1800
    while time.time() < deadline:
        url = page.url.lower()
        text = page.locator("body").inner_text(timeout=10_000).lower()
        still_login = ("/ap/signin" in url or "signin" in url or "sign-in" in url
                       or "sign in or create account" in text
                       or "scan qr code with your phone" in text
                       or "iniciar sesión" in text)
        has_list = page.locator(".item-title").count() > 0
        if not still_login and "amazon.es" in url and has_list:
            print("LOGIN_BROWSER_AUTHENTICATED", flush=True)
            time.sleep(10)
            break
        time.sleep(2)
    context.close()
