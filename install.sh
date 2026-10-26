#!/bin/bash
# Instala Dynamic Island Music en tu escritorio, sin aviso de macOS y sin permisos de administrador.
#
#   curl -fsSL https://raw.githubusercontent.com/MoisesGuerraDev/dynamic-island-music/main/install.sh | bash -s -- MoisesGuerraDev/dynamic-island-music
#
# Opciones (después del MoisesGuerraDev/dynamic-island-music):
#   --applications   instalarla en /Applications en vez del escritorio
#
# Qué hace: descarga la última versión (.dmg) y su suma de verificación, comprueba que coinciden, copia la app a tu
# escritorio y la abre. Si todavía no hay una versión publicada y estás dentro del código con Xcode, la compila (build-mac.sh).
# Lo único fuera de lo común: quita la marca de cuarentena SOLO de la app que acaba de bajar de este repositorio y
# comprobar, para que macOS no muestre el aviso de "desarrollador no identificado". No usa sudo, no instala nada más
# y no toca ningún otro archivo. Léelo antes de ejecutarlo: son pocas líneas.
set -euo pipefail

APP_NAME="Dynamic Island Music"
DEST="${DIM_DEST:-$HOME/Desktop}"
REPO="${DIM_REPO:-}"
for arg in "$@"; do
  case "$arg" in
    --applications) DEST="/Applications" ;;
    --desktop) DEST="$HOME/Desktop" ;;
    */*) REPO="$arg" ;;
  esac
done

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Este instalador es solo para macOS. En Windows usa windows/install.ps1." >&2
  exit 1
fi
if [ "$(sw_vers -productVersion | cut -d. -f1)" -lt 14 ]; then
  echo "Necesitas macOS 14 (Sonoma) o más nuevo." >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"
IN_REPO=0
[ -n "$HERE" ] && [ -f "$HERE/boringNotch.xcodeproj/project.pbxproj" ] && IN_REPO=1

# Dentro de una copia del repositorio no hace falta decir cuál es.
if [ -z "$REPO" ] && [ "$IN_REPO" = 1 ] && command -v git >/dev/null; then
  url="$(git -C "$HERE" config --get remote.origin.url 2>/dev/null || true)"
  REPO="$(printf '%s' "$url" | sed -E 's#^(git@github.com:|https://github.com/)##; s#\.git$##')"
fi

BASE="${DIM_BASE_URL:-}"
if [ -z "$BASE" ]; then
  if [ -z "$REPO" ]; then
    echo "Uso: bash install.sh USUARIO/REPOSITORIO [--applications]" >&2
    exit 1
  fi
  BASE="https://github.com/$REPO/releases/latest/download"
fi

TMP="$(mktemp -d)"
MNT="$TMP/mnt"
cleanup() { hdiutil detach "$MNT" -quiet 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT

echo "Descargando $APP_NAME…"
if ! curl -fL --progress-bar "$BASE/DynamicIslandMusic.dmg" -o "$TMP/app.dmg" 2>/dev/null; then
  if [ "$IN_REPO" = 1 ]; then
    echo "Todavía no hay una versión publicada. La compilo desde el código…"
    DIM_DEST="$DEST" exec "$HERE/build-mac.sh"
  fi
  echo "No encontré una versión publicada en $BASE" >&2
  echo "Si estás en una copia del repositorio, ejecuta ./build-mac.sh (necesita Xcode)." >&2
  exit 1
fi
curl -fsSL "$BASE/DynamicIslandMusic.dmg.sha256" -o "$TMP/app.sha256"

echo "Comprobando la descarga…"
EXPECTED="$(cut -d' ' -f1 "$TMP/app.sha256")"
ACTUAL="$(shasum -a 256 "$TMP/app.dmg" | cut -d' ' -f1)"
if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "La suma de verificación no coincide. No se instaló nada." >&2
  exit 1
fi

mkdir -p "$MNT" "$DEST"
hdiutil attach "$TMP/app.dmg" -nobrowse -quiet -mountpoint "$MNT"
pkill -f "MacOS/$APP_NAME" 2>/dev/null || true
sleep 0.5
rm -rf "$DEST/$APP_NAME.app"
ditto "$MNT/$APP_NAME.app" "$DEST/$APP_NAME.app"
xattr -dr com.apple.quarantine "$DEST/$APP_NAME.app" 2>/dev/null || true

echo "Lista en: $DEST/$APP_NAME.app"
echo "Abriéndola… (la isla aparece arriba y al centro; pasa el mouse por el notch)"
open "$DEST/$APP_NAME.app"
