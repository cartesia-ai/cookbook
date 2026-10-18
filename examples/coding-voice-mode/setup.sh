#!/bin/sh
set -e
cd "$(dirname "$0")"
command -v uv >/dev/null 2>&1 || { echo "install uv first: https://docs.astral.sh/uv/"; exit 1; }
uv sync --quiet
target="${1:-all}"
[ "$#" -gt 0 ] && shift
exec uv run --quiet cartesia-voice-mode install "$target" "$@"
