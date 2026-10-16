#!/bin/sh
set -eu
out=front_desk/static/vendor/agents-web.js
pnpm dlx esbuild@0.25.10 ../../packages/agents-web/src/index.ts --bundle --format=esm --target=es2020 --outfile="$out.tmp"
{
  echo "// Bundled from packages/agents-web/src/index.ts in the Cartesia cookbook repo (Apache-2.0)."
  echo "// Regenerate with scripts/vendor-agents-web.sh. Do not edit by hand."
  cat "$out.tmp"
} > "$out"
rm "$out.tmp"
