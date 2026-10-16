#!/bin/sh
set -eu
src=../../packages/agents-web/src/index.ts
if [ ! -f "$src" ]; then
  echo "vendor-agents-web.sh is for cookbook maintainers. Run it from examples/front-desk inside the cartesia-ai/cookbook repo." >&2
  echo "A standalone copy already ships the bundle in front_desk/static/vendor/agents-web.js." >&2
  exit 1
fi
out=front_desk/static/vendor/agents-web.js
pnpm dlx esbuild@0.25.10 "$src" --bundle --format=esm --target=es2020 --outfile="$out.tmp"
{
  echo "// Bundled from packages/agents-web/src/index.ts in the Cartesia cookbook repo (Apache-2.0)."
  echo "// Regenerate with scripts/vendor-agents-web.sh. Do not edit by hand."
  cat "$out.tmp"
} > "$out"
rm "$out.tmp"
