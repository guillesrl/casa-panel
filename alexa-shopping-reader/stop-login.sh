#!/usr/bin/env bash
set -euo pipefail
BASE=/home/ubuntu/.local/share/alexa-shopping-reader
for name in x11vnc xvfb; do
  file="$BASE/${name}.pid"
  if [ -f "$file" ]; then
    pid=$(cat "$file" || true)
    case "$pid" in (''|*[!0-9]*) ;; (*) kill "$pid" 2>/dev/null || true ;; esac
    rm -f "$file"
  fi
done
