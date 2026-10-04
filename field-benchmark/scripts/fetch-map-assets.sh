#!/usr/bin/env sh
# Copies Protomaps' Noto Sans glyphs and v4 sprites into public/map-assets so
# the basemap style needs no network (#1359 ships glyphs and sprites in the bundle).
set -e
cd "$(dirname "$0")/.."
rm -rf data/assets-src
git clone -q --depth 1 --filter=blob:none --sparse https://github.com/protomaps/basemaps-assets.git data/assets-src
git -C data/assets-src sparse-checkout set "fonts/Noto Sans Regular" "fonts/Noto Sans Medium" "fonts/Noto Sans Italic" sprites/v4
mkdir -p public/map-assets
cp -r data/assets-src/fonts data/assets-src/sprites public/map-assets/
