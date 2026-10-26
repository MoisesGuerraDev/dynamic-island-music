#!/bin/bash
# Renders the app icon for Windows from ../branding/app-icon.svg.
#   build/icon.png   1024 px  (electron-builder turns it into the installer and .exe icon)
#   assets/icon.png   256 px  (window icon)
#   assets/tray.png    64 px  (notification-area icon)
# Needs: rsvg-convert (brew install librsvg)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build assets
rsvg-convert -w 1024 -h 1024 ../branding/app-icon.svg -o build/icon.png
rsvg-convert -w 256 -h 256 ../branding/app-icon.svg -o assets/icon.png
rsvg-convert -w 64 -h 64 ../branding/app-icon.svg -o assets/tray.png
echo "Iconos listos"
