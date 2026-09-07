#!/usr/bin/env node
/**
 * Holds every colour a map layer paints with to one register.
 *
 * Mapbox GL evaluates paint properties itself, outside the CSS cascade, so a
 * layer cannot read a custom property and the values have to be literals. That
 * is why `packages/design-tokens/src/map-palette.ts` exists: the literals are
 * unavoidable, scattering them is not. This is what stops them scattering
 * again.
 *
 * Six of the 62 modules under `apps/web/src/components/map` had kept a private
 * `colors` block through the consolidation that wrote the register, holding 26
 * hex literals between them, and three roles had drifted inside them:
 *
 * - **Selection painted three colours.** `mapInteraction.selected` is amber and
 *   every tile layer paints it, which is DESIGN.md's One Selection Rule.
 *   `use-geojson-layer.ts` painted dark green under a comment claiming it
 *   matched the explorer, `use-route-layer.ts` painted a pale amber of its own,
 *   and `use-nearby-layer.ts` painted near-black. The same record read as a
 *   different state depending on which map the operator clicked from.
 * - **Lifecycle drifted twice.** `use-route-layer.ts` carried its own inactive
 *   grey and its own inaccessible red beside `mapLifecycle`'s, under a comment
 *   saying the local values predated the register.
 * - **`NEARBY_FAMILY_COLORS` restated `mapFamily` byte for byte**, under a
 *   comment calling its three values "hex approximations" of the tokens. They
 *   were not approximations. They were the same three values under three other
 *   key names, which is the shape a copy takes when nothing holds it to the
 *   original.
 *
 * One rule, gated at zero with no allowance list: no module under the map
 * directory writes a hex colour. A file that wants an exemption is a file that
 * wants a private colour, which is the thing that drifted.
 *
 * The scan reads whole files rather than masking comments and strings. A hex in
 * a comment is a value somebody is about to paste into a paint property, and
 * the register is where a colour gets talked about.
 *
 * Scoped to `apps/web/src/components/map`, which is where the register's
 * consumers live and where the drift happened. Widening it is less of a sweep
 * than it sounds: seven hex literals live in the rest of `apps/web/src` and all
 * seven are tag colours in two test suites, so it would cost two exemptions
 * rather than a backlog. That is still a decision for its own branch, not one
 * to take while settling a drift.
 *
 * Run it with `pnpm check:map-palette`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathFrom } from './lib/relative-path.mjs';
import { typeScriptFilesUnder } from './lib/source-files.mjs';
import { count, failure } from './lib/style-gate.mjs';

const GATE = 'check-map-palette';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

const MAP_DIRECTORY = join(workspaceRoot, 'apps/web/src/components/map');

/** The package a map module reads its colours from. */
const PALETTE_PACKAGE = '@simmer-mosquito/design-tokens';

/**
 * An import of that package, subpath or not.
 *
 * The specifier and not the bare name, so that a docblock naming the package
 * does not count as a module reading it. The floor below exists to catch a scan
 * that has stopped seeing imports, and a textual match would answer yes to the
 * prose describing the very thing that broke.
 */
const PALETTE_IMPORT = new RegExp(`from\\s+'${PALETTE_PACKAGE}(?:/[^']*)?'`);

/**
 * The floors under the scan, both of them #591's rule: a walk that has stopped
 * finding the workspace's files must fail rather than report a clean zero.
 *
 * A renamed directory, a moved module, or a walk that quietly stops descending
 * all produce the same summary line as a green run, because "no hex literals
 * found" is exactly what finding no files looks like. These two numbers are
 * what tell the cases apart, and moving either is a deliberate edit.
 *
 * Twenty-two importers and not twenty-six: four of the six modules holding a
 * private block were already reading the register for part of what they paint,
 * which is how a colour drifts in a file that looks consolidated.
 *
 * Sixty-one and not sixty-two since #640: `draw-vertex-edit.ts` moved to
 * `packages/mapping`, where it paints nothing, so the module left the corpus
 * rather than the walk losing it.
 */
const MINIMUM_MAP_FILES = 61;
const MINIMUM_PALETTE_IMPORTERS = 22;

/**
 * A hex colour, six digits or eight.
 *
 * Six is what the six blocks were written in. Eight is here because a gate
 * reading only six takes `#f59e0bff` as a way past it, and the alternatives are
 * ordered longest first so an eight-digit value is not read as a six-digit one
 * with two characters after it.
 *
 * Three and four digits are deliberately not read. This workspace writes issue
 * numbers as `#517` in comments, three digits of hex every one of them, and a
 * scan that took them reported eleven colours in five modules that paint none.
 * Shorthand is the one evasion left open, and it is open on purpose: a gate
 * that cries on every issue reference is a gate somebody switches off.
 */
const HEX_COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b/g;

function main() {
	const files = [...typeScriptFilesUnder(MAP_DIRECTORY)];
	if (files.length < MINIMUM_MAP_FILES) {
		fail(
			`read ${count(files.length, 'module')} under ${where(MAP_DIRECTORY)}, fewer than the ${MINIMUM_MAP_FILES} this expects. The walk has stopped finding the map directory, so a hex literal in it now passes this. Fix MAP_DIRECTORY in scripts/check-map-palette.mjs, or lower MINIMUM_MAP_FILES if that many modules were genuinely deleted.`,
		);
	}

	const { findings, importers } = scan(files);

	if (findings.length > 0) {
		report(findings);
		return;
	}

	// Only on a clean run. A report full of hex literals has already proved the
	// walk is reading the tree, and this floor would bury it under a refusal.
	if (importers < MINIMUM_PALETTE_IMPORTERS) {
		fail(
			`${count(importers, 'module')} of ${files.length} import ${PALETTE_PACKAGE}, fewer than the ${MINIMUM_PALETTE_IMPORTERS} this expects. The modules are being found and their imports are not, so this run's clean zero is the scan failing rather than the directory being clean.`,
		);
	}

	console.log(
		`Map palette: ${files.length} modules, ${importers} reading the register, no hex literals.`,
	);
}

/** Every hex literal in the directory, and how many of its modules read the register. */
function scan(files) {
	const findings = [];
	let importers = 0;

	for (const file of files) {
		const source = readFileSync(file, 'utf8');
		if (PALETTE_IMPORT.test(source)) {
			importers += 1;
		}
		for (const match of source.matchAll(HEX_COLOR)) {
			findings.push(`${where(file)}:${lineOf(source, match.index)} writes ${match[0]}.`);
		}
	}

	return { findings, importers };
}

function report(findings) {
	console.error(
		`${GATE}: ${count(findings.length, 'hex colour')} under ${where(MAP_DIRECTORY)}.\n`,
	);
	for (const finding of findings) {
		console.error(`  - ${finding}`);
	}
	console.error(
		'\nEvery colour a map layer paints with is named in ' +
			'packages/design-tokens/src/map-palette.ts.\nRead the role off the register rather ' +
			'than writing the value out here, and add a role with a docblock when there is ' +
			'none that fits.',
	);
	process.exitCode = 1;
}

function where(path) {
	return pathFrom(workspaceRoot, path);
}

function lineOf(source, index) {
	return source.slice(0, index).split('\n').length;
}

main();
