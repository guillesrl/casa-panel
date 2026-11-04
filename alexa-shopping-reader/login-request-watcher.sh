#!/usr/bin/env bash
set -euo pipefail
REQUEST=/home/ubuntu/.local/share/alexa-shopping-reader/login-request
LOCK=/home/ubuntu/.local/share/alexa-shopping-reader/login.lock
while true; do
  if [[ -f "$REQUEST" ]]; then
    rm -f "$REQUEST"
    if flock -n 9; then
      /home/ubuntu/alexa-shopping-reader/start-login.sh || true
    fi 9>"$LOCK"
  fi
  if [[ -f /home/ubuntu/.local/share/alexa-shopping-reader/reconnect-request ]]; then
    rm -f /home/ubuntu/.local/share/alexa-shopping-reader/reconnect-request
    if flock -n 9; then
      /home/ubuntu/alexa-shopping-reader/reconnect.py || true
    else
      printf error > /home/ubuntu/.local/share/alexa-shopping-reader/reconnect-status
    fi 9>"$LOCK"
  fi
  sleep 2
done
