#!/bin/bash
# Renders the app icon for Windows from ../branding/app-icon.svg.
#   assets/icon.png  512 px  (installer and .exe icon, window icon; electron-builder makes the .ico from it)
#   assets/tray.png   64 px  (notification-area icon)
# They live in assets/ (not build/) because the repository ignores every folder called build/.
# Needs: rsvg-convert (brew install librsvg)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets
rsvg-convert -w 512 -h 512 ../branding/app-icon.svg -o assets/icon.png
rsvg-convert -w 64 -h 64 ../branding/app-icon.svg -o assets/tray.png
echo "Iconos listos"
