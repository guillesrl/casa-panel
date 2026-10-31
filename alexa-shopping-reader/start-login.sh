#!/usr/bin/env bash
set -euo pipefail

BASE=/home/ubuntu/.local/share/alexa-shopping-reader
DISPLAY_NUM="${DISPLAY_NUM:-99}"
VNC_PORT="${VNC_PORT:-5901}"
export DISPLAY=":${DISPLAY_NUM}"

if ! [ -f "$BASE/xvfb.pid" ] || ! kill -0 "$(cat "$BASE/xvfb.pid" 2>/dev/null || echo 0)" 2>/dev/null; then
  Xvfb ":${DISPLAY_NUM}" -screen 0 1280x900x24 -nolisten tcp >/tmp/alexa-xvfb.log 2>&1 &
  echo $! > "$BASE/xvfb.pid"
fi

for _ in $(seq 1 20); do
  [ -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ] && break
  sleep 0.25
done
[ -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ] || { cat /tmp/alexa-xvfb.log >&2 || true; exit 1; }

if ! [ -f "$BASE/x11vnc.pid" ] || ! kill -0 "$(cat "$BASE/x11vnc.pid" 2>/dev/null || echo 0)" 2>/dev/null; then
  x11vnc -display "$DISPLAY" -localhost -rfbport "$VNC_PORT" -nopw -forever -shared >/tmp/alexa-x11vnc.log 2>&1 &
  echo $! > "$BASE/x11vnc.pid"
fi

for _ in $(seq 1 20); do
  ss -ltn 2>/dev/null | grep -q "127.0.0.1:${VNC_PORT} " && break
  sleep 0.25
done
ss -ltn 2>/dev/null | grep -q "127.0.0.1:${VNC_PORT} " || { cat /tmp/alexa-x11vnc.log >&2 || true; exit 1; }

exec /home/ubuntu/alexa-shopping-reader/.venv/bin/python /home/ubuntu/alexa-shopping-reader/login_browser.py
