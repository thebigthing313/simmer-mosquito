/**
 * Emits the four SIMMER Mapbox styles from one layer graph and four palettes.
 *
 *   node scripts/map-style/build.mjs        # write scripts/map-style/*.json
 *   node scripts/map-style/build.mjs --check  # verify only, write nothing
 *
 * The checks at the bottom are the point of building rather than hand-writing
 * these. A Mapbox style fails *silently*: a misspelled `source-layer` renders
 * nothing, a font Mapbox does not host falls back without warning, and a filter
 * comparing a string field to a boolean matches zero features. None of that
 * throws, and all of it looks like a design decision when you open the map. So
 * every source layer is checked against the published tileset schema, every
 * colour against the Map-Room Neutral Rule, and every layer id for collisions.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLayers } from './layers.mjs';
import { VARIANTS } from './palette.mjs';
import { renderPreview } from './preview.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Source layers published by each tileset. Verified against
 * docs.mapbox.com/data/tilesets/reference/ — a name not on this list is a typo,
 * and a typo is invisible at runtime.
 */
const SOURCE_LAYERS = new Set([
	// mapbox-streets-v8
	'admin',
	'aeroway',
	'airport_label',
	'building',
	'housenum_label',
	'landuse',
	'landuse_overlay',
	'motorway_junction',
	'natural_label',
	'place_label',
	'poi_label',
	'road',
	'structure',
	'transit_stop_label',
	'water',
	'waterway',
	// mapbox-terrain-v2
	'contour',
	'hillshade',
	'landcover',
]);

/** Camera default, kept in step with DEFAULT_MAP_CAMERA in apps/web map-styles.ts. */
const CAMERA = { center: [-95.7, 37.1], zoom: 3.4, bearing: 0, pitch: 0 };

function buildStyle(variant) {
	const layers = buildLayers(variant);

	const sources = {};
	if (variant.imagery) {
		sources.satellite = {
			type: 'raster',
			url: 'mapbox://mapbox.satellite',
			tileSize: 256,
		};
	}
	// Compositing streets + terrain into one source halves the tile requests. Only
	// ask for terrain on the variants that actually paint hillshade.
	sources.composite = {
		type: 'vector',
		url: variant.terrain
			? 'mapbox://mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2'
			: 'mapbox://mapbox.mapbox-streets-v8',
	};

	return {
		version: 8,
		name: variant.name,
		metadata: {
			'mapbox:autocomposite': false,
			'mapbox:type': 'default',
			'simmer:variant': variant.id,
			'simmer:generator': 'scripts/map-style/build.mjs',
			'simmer:note':
				'Generated. Edit scripts/map-style/{palette,layers}.mjs and rebuild; ' +
				'do not hand-edit this file or a Studio round-trip will lose the change.',
		},
		center: CAMERA.center,
		zoom: CAMERA.zoom,
		bearing: CAMERA.bearing,
		pitch: CAMERA.pitch,
		// Mapbox-hosted fonts only, so this resolves for any account without an upload.
		glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
		// Nothing in the graph uses an icon today; the sprite is declared so maki
		// icons can be switched on later without touching the style root.
		sprite: 'mapbox://sprites/mapbox/streets-v12',
		sources,
		layers,
	};
}

// ------------------------------------------------------------------- checks --

const problems = [];

function fail(styleId, message) {
	problems.push(`${styleId}: ${message}`);
}

/** Walk every nested value and hand each string to `visit`. */
function walkStrings(node, visit) {
	if (typeof node === 'string') {
		visit(node);
	} else if (Array.isArray(node)) {
		for (const item of node) walkStrings(item, visit);
	} else if (node && typeof node === 'object') {
		for (const value of Object.values(node)) walkStrings(value, visit);
	}
}

const HEX = /^#[0-9a-f]{6}$/;
const RGBA = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/;

/**
 * A fontstack naming a font Mapbox does not serve falls back silently. These are
 * the only faces the graph is allowed to ask for.
 */
const ALLOWED_FONTS = new Set([
	'Roboto Condensed Regular',
	'Roboto Condensed Bold',
	'Roboto Condensed Light',
	'Arial Unicode MS Regular',
	'Arial Unicode MS Bold',
]);

/** Two layers sharing an id means the second silently replaces the first. */
function checkLayerIds(style, id) {
	const seen = new Set();
	for (const layer of style.layers) {
		if (seen.has(layer.id)) fail(id, `duplicate layer id "${layer.id}"`);
		seen.add(layer.id);
	}
}

/** Every layer is wired to a source and a source-layer that actually exist. */
function checkLayerSources(style, id) {
	for (const layer of style.layers) {
		if (layer.source && !style.sources[layer.source]) {
			fail(id, `layer "${layer.id}" references missing source "${layer.source}"`);
		}
		const sourceLayer = layer['source-layer'];
		if (sourceLayer && !SOURCE_LAYERS.has(sourceLayer)) {
			fail(id, `layer "${layer.id}" references unknown source-layer "${sourceLayer}"`);
		}
		if (layer.type !== 'background' && layer.type !== 'raster' && !sourceLayer) {
			fail(id, `layer "${layer.id}" has no source-layer`);
		}
	}
}

/** An inverted zoom window renders nothing, and looks like a missing layer. */
function checkLayerZoom(style, id) {
	for (const layer of style.layers) {
		if (layer.minzoom === undefined || layer.maxzoom === undefined) continue;
		if (layer.minzoom >= layer.maxzoom) {
			fail(id, `layer "${layer.id}" has minzoom >= maxzoom`);
		}
	}
}

/**
 * The Map-Room Neutral Rule, enforced rather than trusted: neutrals are tinted
 * toward green and blue, and pure white or black never appears.
 */
function checkColours(style, id) {
	walkStrings({ layers: style.layers }, (value) => {
		if (!value.startsWith('#') && !value.startsWith('rgb')) return;
		if (value.startsWith('#') && !HEX.test(value)) {
			fail(id, `malformed colour "${value}" (six-digit lowercase hex only)`);
			return;
		}
		if (value.startsWith('rgb') && !RGBA.test(value)) {
			fail(id, `malformed colour "${value}"`);
			return;
		}
		if (value === '#ffffff' || value === '#000000') {
			fail(
				id,
				`pure ${value === '#ffffff' ? 'white' : 'black'} "${value}" breaks the Map-Room Neutral Rule`,
			);
		}
	});
}

/** No layer asks for a face Mapbox does not host. */
function checkFonts(style, id) {
	for (const layer of style.layers) {
		for (const font of layer.layout?.['text-font'] ?? []) {
			if (!ALLOWED_FONTS.has(font)) {
				fail(id, `layer "${layer.id}" uses unhosted font "${font}"`);
			}
		}
	}
}

function checkStyle(style) {
	const id = style.metadata['simmer:variant'];
	checkLayerIds(style, id);
	checkLayerSources(style, id);
	checkLayerZoom(style, id);
	checkColours(style, id);
	checkFonts(style, id);
}

// -------------------------------------------------------------------- write --

const checkOnly = process.argv.includes('--check');
const written = [];
const built = [];

for (const variant of VARIANTS) {
	const style = buildStyle(variant);
	checkStyle(style);
	built.push(style);

	const path = join(HERE, `${variant.id}.json`);
	const json = `${JSON.stringify(style, null, '\t')}\n`;

	if (checkOnly) {
		let current = null;
		try {
			current = readFileSync(path, 'utf8');
		} catch {
			fail(variant.id, 'no built style on disk — run without --check');
		}
		if (current !== null && current !== json) {
			fail(variant.id, 'built style is stale — rerun scripts/map-style/build.mjs');
		}
	} else {
		mkdirSync(HERE, { recursive: true });
		writeFileSync(path, json, 'utf8');
	}

	written.push({ id: variant.id, layers: style.layers.length, bytes: json.length });
}

// The preview harness inlines the styles, so it can only ever show what was just
// built — there is no version of this that drifts from the JSON beside it.
if (!checkOnly) {
	writeFileSync(join(HERE, 'preview.html'), renderPreview(built), 'utf8');
}

for (const { id, layers, bytes } of written) {
	const size = `${(bytes / 1024).toFixed(1)} KB`;
	console.log(`${checkOnly ? 'checked' : 'wrote'}  ${id}.json  ${layers} layers  ${size}`);
}
if (!checkOnly) {
	console.log('wrote  preview.html  (open it, paste a pk. token, walk the zoom stages)');
}

if (problems.length > 0) {
	console.error(`\n${problems.length} problem(s):`);
	for (const problem of problems) console.error(`  - ${problem}`);
	process.exit(1);
}

console.log(`\n${written.length} styles OK.`);
