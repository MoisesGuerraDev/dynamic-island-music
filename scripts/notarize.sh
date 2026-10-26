#!/bin/bash
# Firma con Developer ID y notariza la app para que macOS no muestre ningún aviso.
# Hace falta una cuenta de Apple Developer (US$99 al año). Una sola vez, guarda las credenciales:
#   xcrun notarytool store-credentials dim-notary --apple-id TU_CORREO --team-id TU_TEAM_ID --password CONTRASEÑA_DE_APP
# Uso: scripts/notarize.sh "Developer ID Application: Tu Nombre (TEAMID)"
set -euo pipefail
cd "$(dirname "$0")/.."
IDENTITY="${1:?Falta la identidad de firma (Developer ID Application: ...)}"
APP="build/Build/Products/Release/Dynamic Island Music.app"
ZIP="dist/notarize.zip"
mkdir -p dist
codesign --force --deep --options runtime --timestamp --sign "$IDENTITY" "$APP"
ditto -c -k --keepParent "$APP" "$ZIP"
xcrun notarytool submit "$ZIP" --keychain-profile dim-notary --wait
xcrun stapler staple "$APP"
rm -f "$ZIP"
echo "Lista y notarizada. Ahora ejecuta scripts/make-dmg.sh"
