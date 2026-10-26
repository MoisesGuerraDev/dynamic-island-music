#!/bin/bash
# Instala Dynamic Island Music en /Applications descargando la última versión desde GitHub.
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | bash -s -- OWNER/REPO
#
# Lo que hace: descarga el .dmg y su suma de verificación, comprueba que coincide, copia la app a
# /Applications y la abre. No usa sudo ni toca nada más. Léelo antes de ejecutarlo: son pocas líneas.
set -euo pipefail

REPO="${1:-${DIM_REPO:-}}"
if [ -z "$REPO" ]; then
  echo "Uso: bash install.sh OWNER/REPO" >&2
  exit 1
fi
if [ "$(uname -s)" != "Darwin" ]; then
  echo "Este instalador es solo para macOS." >&2
  exit 1
fi
MAJOR="$(sw_vers -productVersion | cut -d. -f1)"
if [ "$MAJOR" -lt 14 ]; then
  echo "Necesitas macOS 14 (Sonoma) o más nuevo." >&2
  exit 1
fi

BASE="https://github.com/$REPO/releases/latest/download"
TMP="$(mktemp -d)"
MNT="$TMP/mnt"
cleanup() { hdiutil detach "$MNT" -quiet 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT

echo "Descargando Dynamic Island Music…"
curl -fL --progress-bar "$BASE/DynamicIslandMusic.dmg" -o "$TMP/app.dmg"
curl -fsSL "$BASE/DynamicIslandMusic.dmg.sha256" -o "$TMP/app.sha256"

echo "Comprobando la descarga…"
EXPECTED="$(cut -d' ' -f1 "$TMP/app.sha256")"
ACTUAL="$(shasum -a 256 "$TMP/app.dmg" | cut -d' ' -f1)"
if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "La suma de verificación no coincide. No se instaló nada." >&2
  exit 1
fi

mkdir -p "$MNT"
hdiutil attach "$TMP/app.dmg" -nobrowse -quiet -mountpoint "$MNT"
pkill -x "Dynamic Island Music" 2>/dev/null || true
rm -rf "/Applications/Dynamic Island Music.app"
ditto "$MNT/Dynamic Island Music.app" "/Applications/Dynamic Island Music.app"
xattr -dr com.apple.quarantine "/Applications/Dynamic Island Music.app" 2>/dev/null || true

echo "Instalada en /Applications. Abriéndola…"
open "/Applications/Dynamic Island Music.app"
