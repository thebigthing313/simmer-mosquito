#!/usr/bin/env node
/**
 * Holds the client's tileset names to the ones the server answers on.
 *
 * `/map/tiles/:tileset/{z}/{x}/{y}.mvt` is one endpoint with a name in the path.
 * The server's eleven names are the `key` of each `defineTileSet` in
 * `apps/server/src/map-tiles.ts`; the client's are the keys of
 * `TILE_LAYER_BINDINGS` in `apps/web/src/components/map/tile-layers.ts`, and the
 * `*_SOURCE_ID` constant each row names is the string that actually goes into
 * the URL.
 *
 * Nothing else checks that the three agree. A name that does not 404s every tile
 * and every extent request, and the map draws an empty basemap with no error on
 * screen and nothing in the console but a row of network failures. That is the
 * failure this catches, and it costs a regex.
 *
 * Three assertions:
 *
 * 1. Every registry key is a tileset the server serves, and every tileset the
 *    server serves has a registry key.
 * 2. A row's `sourceId` resolves to the same string as its key. The key is what
 *    a caller writes in a `layers` list; the source id is what the URL builder
 *    puts in the path, and they are only the same string by convention.
 * 3. The parse read the expected number of rows on both sides, so a refactor
 *    that moves the declarations fails loudly rather than checking nothing.
 *
 * Run it with `pnpm check:tileset-keys`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_REGISTRY = join(workspaceRoot, 'apps/web/src/components/map/tile-layers.ts');
const CLIENT_TILES_DIR = join(workspaceRoot, 'apps/web/src/components/map');
const SERVER_REGISTRY = join(workspaceRoot, 'apps/server/src/map-tiles.ts');

/**
 * How many tilesets there are. Asserted rather than assumed: a parse that stops
 * matching must fail, not pass over nothing. Moving it is a deliberate edit.
 */
const EXPECTED_TILESETS = 11;

function main() {
	const client = readClientRegistry();
	const server = readServerKeys();
	const sourceIds = readSourceIds();

	const failures = [
		...checkKeysAgree(client, server),
		...checkSourceIdsMatchKeys(client, sourceIds),
	];

	if (failures.length > 0) {
		console.error('Tileset key check failed:\n');
		for (const failure of failures) {
			console.error(`  - ${failure}`);
		}
		console.error('\nThe client rows are TILE_LAYER_BINDINGS (apps/web/src/components/map/');
		console.error('tile-layers.ts) and the server rows are createTileSetRegistry');
		console.error('(apps/server/src/map-tiles.ts). Both name the /map/tiles/:tileset segment.');
		process.exitCode = 1;
		return;
	}

	console.log(`Tileset keys: ${server.length} tilesets, client and server agree.`);
}

/** The registry keys and the `*_SOURCE_ID` each row names, in declaration order. */
function readClientRegistry() {
	const source = readFileSync(CLIENT_REGISTRY, 'utf8');
	const table = source.match(/const TILE_LAYER_BINDINGS = \{([\s\S]*?)\n\};/);
	if (table === null) {
		throw new Error(`Could not find TILE_LAYER_BINDINGS in ${CLIENT_REGISTRY}.`);
	}

	const rows = [
		...table[1].matchAll(/^\t'?([a-z-]+)'?: defineTileLayer[\s\S]*?sourceId: ([A-Z_]+),/gm),
	].map((match) => ({ key: match[1], sourceIdName: match[2] }));

	if (rows.length !== EXPECTED_TILESETS) {
		throw new Error(
			`Expected ${EXPECTED_TILESETS} rows in TILE_LAYER_BINDINGS, read ${rows.length}. ` +
				'Update EXPECTED_TILESETS if the table grew.',
		);
	}
	return rows;
}

/** The `key` of every `defineTileSet` the server registers. */
function readServerKeys() {
	const source = readFileSync(SERVER_REGISTRY, 'utf8');
	const registry = source.match(/function createTileSetRegistry\([\s\S]*?\n\}/);
	if (registry === null) {
		throw new Error(`Could not find createTileSetRegistry in ${SERVER_REGISTRY}.`);
	}

	const keys = [...registry[0].matchAll(/defineTileSet\(\{\s*key: '([a-z-]+)'/g)].map(
		(match) => match[1],
	);

	if (keys.length !== EXPECTED_TILESETS) {
		throw new Error(
			`Expected ${EXPECTED_TILESETS} defineTileSet calls, read ${keys.length}. ` +
				'Update EXPECTED_TILESETS if the registry grew.',
		);
	}
	return keys;
}

/** Every `export const *_SOURCE_ID = '...'` the tile modules declare. */
function readSourceIds() {
	const ids = new Map();
	for (const file of readdirSync(CLIENT_TILES_DIR)) {
		if (!file.endsWith('-tiles.ts')) {
			continue;
		}
		const source = readFileSync(join(CLIENT_TILES_DIR, file), 'utf8');
		for (const match of source.matchAll(/export const ([A-Z_]+_SOURCE_ID) = '([a-z-]+)';/g)) {
			ids.set(match[1], match[2]);
		}
	}
	return ids;
}

function checkKeysAgree(client, server) {
	const clientKeys = new Set(client.map((row) => row.key));
	const serverKeys = new Set(server);
	return [
		...absent(
			clientKeys,
			serverKeys,
			(key) => `the client draws '${key}', which the server does not serve.`,
		),
		...absent(
			serverKeys,
			clientKeys,
			(key) => `the server serves '${key}', which no client row draws.`,
		),
	];
}

/** Describe each key of `keys` that `present` does not hold. */
function* absent(keys, present, describe) {
	for (const key of keys) {
		if (!present.has(key)) {
			yield describe(key);
		}
	}
}

function checkSourceIdsMatchKeys(client, sourceIds) {
	const failures = [];
	for (const row of client) {
		const value = sourceIds.get(row.sourceIdName);
		if (value === undefined) {
			failures.push(`${row.sourceIdName} is not an exported *_SOURCE_ID in any *-tiles.ts.`);
			continue;
		}
		if (value !== row.key) {
			failures.push(
				`row '${row.key}' names ${row.sourceIdName}, which is '${value}'. ` +
					'The key and the source id are the same path segment.',
			);
		}
	}
	return failures;
}

main();
