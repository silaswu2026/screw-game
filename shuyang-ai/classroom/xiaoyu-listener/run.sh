#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -U pip wheel
  .venv/bin/pip install -r requirements.txt
fi
if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and fill LIVEKIT_* (do not commit .env)" >&2
  exit 1
fi
exec .venv/bin/python listen.py
