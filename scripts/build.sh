#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUTFILE="dist/skill"

usage() {
  cat <<'USAGE'
Usage: scripts/build.sh [--outfile PATH]

Build the skill Bun JS bundle.

Options:
  --outfile PATH Write the executable bundle to PATH. Default: dist/skill.
  -h, --help     Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --outfile)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --outfile" >&2
        exit 1
      fi
      OUTFILE="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

VERSION="$(bun -e 'import packageJson from "./package.json" with { type: "json" }; console.log(packageJson.version);')"

OUTDIR="$(dirname "$OUTFILE")"
ENTRY_NAME="$(basename "$OUTFILE")"

mkdir -p "$OUTDIR"
rm -f "$OUTFILE" "$OUTFILE.map"
bun build ./src/cli.ts \
  --target=bun \
  --format=esm \
  --minify \
  --sourcemap=linked \
  --outdir="$OUTDIR" \
  --entry-naming="$ENTRY_NAME"
chmod +x "$OUTFILE"

echo "Built skill v$VERSION at $OUTFILE"
