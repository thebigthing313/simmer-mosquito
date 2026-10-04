#!/usr/bin/env sh
# Cuts the zoom 15 Protomaps file over the box export-data.mjs wrote (#1359).
# Needs go-pmtiles in data/tools (https://github.com/protomaps/go-pmtiles/releases).
set -e
cd "$(dirname "$0")/.."
BUILD=${BUILD:-$(curl -s https://build-metadata.protomaps.dev/builds.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).at(-1).key))")}
BOX=$(node -e "console.log(require('./data/bundle/manifest.json').basemapBox.join(','))")
./data/tools/pmtiles extract "https://build.protomaps.com/$BUILD" data/basemap.pmtiles --bbox="$BOX" --maxzoom=15
ls -l data/basemap.pmtiles
