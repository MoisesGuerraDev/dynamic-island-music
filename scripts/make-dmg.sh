#!/bin/bash
# Builds DynamicIslandMusic.dmg (and its .sha256) from the Release build in ./build
set -euo pipefail
cd "$(dirname "$0")/.."
APP="build/Build/Products/Release/Dynamic Island Music.app"
OUT="dist"
rm -rf "$OUT" stage && mkdir -p "$OUT" stage
ditto "$APP" "stage/Dynamic Island Music.app"
ln -s /Applications stage/Applications
cat > "stage/LEEME.txt" <<'TXT'
Arrastra "Dynamic Island Music" a la carpeta Applications.

Si macOS dice que no puede verificar la app (es normal: es de código abierto y no está
firmada por Apple), abre Ajustes del Sistema > Privacidad y seguridad y pulsa
"Abrir de todos modos". Solo hace falta una vez.

Más fácil: instálala con un comando desde la página de descarga del proyecto.
TXT
hdiutil create -volname "Dynamic Island Music" -srcfolder stage -ov -format UDZO "$OUT/DynamicIslandMusic.dmg" >/dev/null
( cd "$OUT" && shasum -a 256 DynamicIslandMusic.dmg > DynamicIslandMusic.dmg.sha256 )
rm -rf stage
echo "Listo: $OUT/DynamicIslandMusic.dmg"
