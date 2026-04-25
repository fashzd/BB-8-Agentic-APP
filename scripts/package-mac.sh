#!/bin/zsh

set -euo pipefail

npm run build

if [ ! -f assets/icon.icns ]; then
  npm run build:icon
fi

npx electron-packager . "BB-8" \
  --platform=darwin \
  --arch=arm64 \
  --overwrite \
  --out=release \
  --app-bundle-id=com.bb8.desktop \
  --app-version=0.1.0 \
  --icon=assets/icon \
  --prune=true \
  --ignore='^/release($|/)' \
  --ignore='^/test($|/)'
