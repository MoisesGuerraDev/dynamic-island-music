#!/bin/bash
# Compila Dynamic Island Music desde el código y la deja en tu escritorio, lista para usar. Necesita Xcode.
#
#   git clone https://github.com/OWNER/REPO.git && cd REPO && ./build-mac.sh
#
# Opciones:
#   --applications   dejarla en /Applications en vez del escritorio
#
# La app queda firmada solo en tu Mac ("ad hoc"), así que macOS no muestra ningún aviso: la hiciste tú.
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="Dynamic Island Music"
DEST="${DIM_DEST:-$HOME/Desktop}"
[ "${1:-}" = "--applications" ] && DEST="/Applications"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Solo para macOS." >&2
  exit 1
fi
if ! xcodebuild -version >/dev/null 2>&1; then
  echo "Hace falta Xcode (gratis en la App Store; después abre Xcode una vez para aceptar la licencia)." >&2
  echo "Sin Xcode puedes instalarla ya compilada: mira install.sh en el README." >&2
  exit 1
fi

mkdir -p build
echo "Compilando $APP_NAME (la primera vez tarda unos minutos)…"
if ! xcodebuild -project boringNotch.xcodeproj -scheme boringNotch -configuration Release \
      -derivedDataPath build -destination 'platform=macOS' \
      CODE_SIGN_IDENTITY="-" ENABLE_HARDENED_RUNTIME=NO DEVELOPMENT_TEAM="" CODE_SIGN_STYLE=Manual \
      -skipMacroValidation -skipPackagePluginValidation -quiet build > build/xcodebuild.log 2>&1; then
  echo "La compilación falló. Últimas líneas del registro (build/xcodebuild.log):" >&2
  tail -25 build/xcodebuild.log >&2
  exit 1
fi

APP="build/Build/Products/Release/$APP_NAME.app"
mkdir -p "$DEST"
pkill -f "MacOS/$APP_NAME" 2>/dev/null || true
sleep 0.5
rm -rf "$DEST/$APP_NAME.app"
ditto "$APP" "$DEST/$APP_NAME.app"
xattr -cr "$DEST/$APP_NAME.app" 2>/dev/null || true

echo "Lista en: $DEST/$APP_NAME.app"
echo "Abriéndola… (la isla aparece arriba y al centro; pasa el mouse por el notch)"
open "$DEST/$APP_NAME.app"
