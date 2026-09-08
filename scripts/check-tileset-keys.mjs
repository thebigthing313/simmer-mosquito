#!/usr/bin/env node
/**
 * Holds one register of tileset names and the three lists that spell it.
 *
 * `MapTilesetLayer` in `packages/db/src/domains/map-layers.ts` is the register,
 * and its header is where the mechanism is written down. The three lists are the
 * keys of `MAP_SURFACES` in `packages/db/src/domains/map-surface-register.ts`,
 * the keys `createTileSetRegistry` registers in `apps/server`, and
 * `TILE_LAYER_BINDINGS` in `apps/web`, whose `*_SOURCE_ID` is the string that
 * goes in the URL.
 *
 * `tsc` holds the first two lists to the register, and only as membership: it
 * cannot see `apps/web`, which has no dependency on `packages/db`, and it cannot
 * see a name sitting over the wrong surface's readers, since both names are
 * real. So this reads all four as text.
 *
 * Four assertions:
 *
 * 1. The surfaces' register keys, the tilesets the server serves and the
 *    client's registry keys are each exactly the register's set.
 * 2. A row's `sourceId` resolves to the same string as its key. The key is what
 *    a caller writes in a `layers` list; the source id is what the URL builder
 *    puts in the path, and they are only the same string by convention.
 * 3. All four parses read the expected number of names, so a refactor that moves
 *    a declaration fails loudly rather than checking nothing.
 * 4. No map surface writes a `layer:` literal of its own. `MAP_SURFACES` hands
 *    each surface the key it is registered under, which is #644's "declared in
 *    exactly one place"; a literal back beside a surface is a second copy of the
 *    name, and this is the walk over `packages/db`'s domain modules that refuses
 *    one.
 *
 * What it does not catch, since every comparison is between sets: two surfaces
 * trading entries in the register. Both names are still spelled everywhere, and
 * pairing a layer to the table behind it is a rule nothing in the source states.
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
const DB_REGISTER = join(workspaceRoot, 'packages/db/src/domains/map-layers.ts');
const DB_SURFACES = join(workspaceRoot, 'packages/db/src/domains/map-surface-register.ts');
const DB_SURFACE_DIR = join(workspaceRoot, 'packages/db/src/domains');

/**
 * How many tilesets there are. Asserted rather than assumed on all four parses:
 * one that stops matching must fail, not pass over nothing. Moving it is a
 * deliberate edit.
 */
const EXPECTED_TILESETS = 11;

/**
 * The floor under the fourth assertion's walk, which is the one input that is a
 * directory listing rather than a single declaration. Thirty-three modules sit
 * there today; the floor sits under that rather than on it because a domain
 * module is deleted now and then, while a walk finding a handful has lost the
 * directory and would report no stray literal under a passing summary line
 * (#591, #599).
 */
const MINIMUM_SURFACE_MODULES = 25;

function main() {
	const register = readRegisterLayers();
	const surfaces = readSurfaceLayers();
	const client = readClientRegistry();
	const server = readServerKeys();
	const sourceIds = readSourceIds();

	const failures = [
		...checkAgainstRegister(register, surfaces, {
			spells: 'the surfaces are keyed by',
			lacks: 'no map surface is registered under it',
		}),
		...checkAgainstRegister(register, server, {
			spells: 'the server serves',
			lacks: 'the server does not serve it',
		}),
		...checkAgainstRegister(
			register,
			client.map((row) => row.key),
			{ spells: 'the client draws', lacks: 'no client row draws it' },
		),
		...checkSourceIdsMatchKeys(client, sourceIds),
		...checkNoSurfaceLayerLiterals(),
	];

	if (failures.length > 0) {
		console.error('Tileset key check failed:\n');
		for (const failure of failures) {
			console.error(`  - ${failure}`);
		}
		console.error('\nThe register is MapTilesetLayer (packages/db/src/domains/map-layers.ts),');
		console.error('the surfaces are keyed by it in MAP_SURFACES, the server rows are');
		console.error('createTileSetRegistry (apps/server/src/map-tiles.ts) and the client rows are');
		console.error('TILE_LAYER_BINDINGS (apps/web/src/components/map/tile-layers.ts). All four');
		console.error('name the /map/tiles/:tileset segment.');
		process.exitCode = 1;
		return;
	}

	console.log(`Tileset keys: ${register.length} layers, db, server and client all agree.`);
}

/** The members of the `MapTilesetLayer` union, in declaration order. */
function readRegisterLayers() {
	const source = readFileSync(DB_REGISTER, 'utf8');
	const union = source.match(/export type MapTilesetLayer =([\s\S]*?);/);
	if (union === null) {
		throw new Error(`Could not find the MapTilesetLayer union in ${DB_REGISTER}.`);
	}

	const layers = [...union[1].matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
	if (layers.length !== EXPECTED_TILESETS) {
		throw new Error(
			`Expected ${EXPECTED_TILESETS} members of MapTilesetLayer, read ${layers.length}. ` +
				'Update EXPECTED_TILESETS if the register grew.',
		);
	}
	return layers;
}

/** The db domain modules the layer-literal walk reads, floor asserted. */
function readSurfaceModules() {
	const modules = readdirSync(DB_SURFACE_DIR).filter((file) => file.endsWith('.ts'));
	if (modules.length < MINIMUM_SURFACE_MODULES) {
		throw new Error(
			`Read ${modules.length} modules under ${DB_SURFACE_DIR}, below the floor of ` +
				`${MINIMUM_SURFACE_MODULES}. The surface scan has lost the directory.`,
		);
	}
	return modules;
}

/** The layer each map surface is registered under, in declaration order. */
function readSurfaceLayers() {
	const source = readFileSync(DB_SURFACES, 'utf8');
	const register = source.match(/buildMapSurfaces\(\{([\s\S]*?)\n\}\);/);
	if (register === null) {
		throw new Error(`Could not find the MAP_SURFACES register in ${DB_SURFACES}.`);
	}

	const layers = [...register[1].matchAll(/^\t'?([a-z-]+)'?: /gm)].map((match) => match[1]);
	if (layers.length !== EXPECTED_TILESETS) {
		throw new Error(
			`Expected ${EXPECTED_TILESETS} entries in MAP_SURFACES, read ${layers.length}. ` +
				'Update EXPECTED_TILESETS if a surface was added.',
		);
	}
	return layers;
}

/**
 * Every `layer:` literal left beside a surface, which is one too many.
 *
 * Read off the raw source rather than a masked copy: a `layer:` line inside a
 * comment is reported, which is noise rather than a hole, and the message says
 * where to look.
 */
function* checkNoSurfaceLayerLiterals() {
	for (const module of readSurfaceModules()) {
		const source = readFileSync(join(DB_SURFACE_DIR, module), 'utf8');
		for (const match of source.matchAll(/^\t+layer: '([a-z-]+)',$/gm)) {
			yield `${module} writes \`layer: '${match[1]}'\` beside a surface. The layer is the key ` +
				'the surface is registered under in MAP_SURFACES, which hands it in.';
		}
	}
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

/** The key every tileset the server registers is declared under. */
function readServerKeys() {
	const source = readFileSync(SERVER_REGISTRY, 'utf8');
	const registry = source.match(/function createTileSetRegistry\([\s\S]*?\n\}/);
	if (registry === null) {
		throw new Error(`Could not find createTileSetRegistry in ${SERVER_REGISTRY}.`);
	}

	const keys = [...registry[0].matchAll(/^\t\t'?([a-z-]+)'?: defineTileSet\(\{$/gm)].map(
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

/**
 * Both directions between the register and one of the three lists that spell it.
 *
 * `spells` and `lacks` are the two halves of the same sentence, because a name
 * on one side and not the other is two different failures: a tileset nothing
 * registers, and a register entry nothing serves.
 */
function checkAgainstRegister(register, names, { spells, lacks }) {
	const registered = new Set(register);
	const spelled = new Set(names);
	return [
		...absent(
			spelled,
			registered,
			(key) => `${spells} '${key}', which MapTilesetLayer does not name.`,
		),
		...absent(registered, spelled, (key) => `MapTilesetLayer names '${key}', but ${lacks}.`),
	];
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
