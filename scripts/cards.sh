#!/usr/bin/env bash
# Regenerates the README cards and the social preview with cardshot
# (https://github.com/whosdrix/cardshot). Start it first:
#
#   docker run -p 3000:3000 ghcr.io/whosdrix/cardshot
#   scripts/cards.sh
#
# The numbers come from examples/changelog/results. Update them here if
# that trial is ever rerun.
set -euo pipefail

CARDSHOT="${CARDSHOT_URL:-http://localhost:3000}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/.github/assets"
mkdir -p "$OUT"

card() {
  local file="$1"
  shift
  local args=()
  for pair in "$@"; do args+=(--data-urlencode "$pair"); done
  curl -fsS -G "$CARDSHOT/og" "${args[@]}" -o "$OUT/$file"
  echo "$file"
}

# The mark: a short bar and a tall one, without the skill and with it.
LOGO_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><rect width="44" height="44" rx="10" fill="#5b8cff"/><rect x="12" y="23" width="8" height="11" rx="2" fill="#09090b" opacity=".45"/><rect x="24" y="10" width="8" height="24" rx="2" fill="#09090b"/></svg>'
LOGO="data:image/svg+xml;base64,$(printf '%s' "$LOGO_SVG" | base64 | tr -d '\n')"

feature() {
  card "$1.png" template=basic site=skilltrial "logo=$LOGO" accent=5b8cff "title=$2" "subtitle=$3"
}

feature arms "Paired. Shuffled. Fair." \
  "Every task runs with the skill and without it, in random order."

feature stats "+32 points, with a range." \
  "95% CI +22 to +42. If it crosses zero, the verdict is “unclear”."

feature report "Every run, every diff." \
  "One HTML file: the verdict, each task, and what the agent changed."

feature ci "Fails CI on a regression." \
  "Compare with --against, then gate on --fail-on-regression."

card social-preview.png template=basic w=1280 h=640 \
  title=skilltrial \
  "subtitle=Find out if an agent skill actually helps." \
  site=github.com/whosdrix/skilltrial
