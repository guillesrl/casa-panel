#!/usr/bin/env python3
"""Read-only Alexa shopping-list extractor using a persistent Playwright profile."""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

BASE = Path(os.environ.get("ALEXA_READER_HOME", "/home/ubuntu/.local/share/alexa-shopping-reader"))
PROFILE = BASE / "profile"
STATE = BASE / "state"
BASE.mkdir(mode=0o700, parents=True, exist_ok=True)
PROFILE.mkdir(mode=0o700, exist_ok=True)
STATE.mkdir(mode=0o700, exist_ok=True)

URLS = [
    "https://www.amazon.es/gp/alexa-shopping-list",
    "https://www.amazon.com/gp/alexa-shopping-list",
]
LOGIN_MARKERS = ("/ap/signin", "signin", "sign-in")


def page_text(page) -> str:
    return (page.locator("body").inner_text(timeout=10_000) or "").strip()


def looks_logged_out(page) -> bool:
    url = page.url.lower()
    text = page_text(page).lower()
    return (any(marker in url for marker in LOGIN_MARKERS)
            or "sign in or create account" in text
            or "enter your mobile number or email" in text
            or "scan qr code with your phone" in text
            or "iniciar sesión" in text)


def extract_items(page) -> list[str]:
    # Keep this deliberately conservative. Selectors will be adjusted only after
    # a real authenticated page is inspected; never turn an empty result into OK.
    selectors = [
        ".item-title",
        '[data-testid*="list-item"]',
        '[class*="list-item"]',
        '[class*="ListItem"]',
        'li',
    ]
    candidates: list[str] = []
    for index, selector in enumerate(selectors):
        for node in page.locator(selector).all():
            try:
                value = node.inner_text(timeout=1000).strip()
            except Exception:
                continue
            if value and len(value) <= 300 and value not in candidates:
                candidates.append(value)
        # Amazon Spain exposes active list entries as .item-title. Do not fall
        # back to generic navigation selectors when that provider selector has
        # returned data, otherwise menu labels become false products.
        if index == 0 and candidates:
            break
    # Remove obvious navigation/UI labels. Keep exact visible item text otherwise.
    ignored = {"shopping list", "lista de compras", "add item", "añadir elemento", "add", "añadir producto"}
    return [x for x in candidates if x.casefold() not in ignored]


def read_list() -> dict[str, Any]:
    with sync_playwright() as pw:
        browser = pw.chromium.launch_persistent_context(
            str(PROFILE), headless=True, viewport={"width": 1280, "height": 900}
        )
        page = browser.pages[0] if browser.pages else browser.new_page()
        try:
            page.goto(URLS[0], wait_until="domcontentloaded", timeout=45_000)
            page.wait_for_timeout(2500)
            if looks_logged_out(page):
                return {"ok": False, "status": "login_required", "message": "La sesión de Alexa no está iniciada."}
            items = extract_items(page)
            if not items:
                text = page_text(page)
                if not text:
                    return {"ok": False, "status": "empty_page", "message": "Alexa devolvió una página vacía."}
                return {"ok": False, "status": "selector_drift_or_empty", "message": "No se detectaron productos; revisar selectores o lista vacía."}
            return {
                "ok": True,
                "status": "ok",
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "items": items,
                "count": len(items),
            }
        except PlaywrightTimeoutError as exc:
            return {"ok": False, "status": "timeout", "message": str(exc)}
        except Exception as exc:
            return {"ok": False, "status": "error", "message": f"{type(exc).__name__}: {exc}"}
        finally:
            browser.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--read", action="store_true", help="read the list")
    args = parser.parse_args()
    if not args.read:
        parser.error("solo se admite --read; el lector no tiene operaciones de escritura")
    result = read_list()
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
