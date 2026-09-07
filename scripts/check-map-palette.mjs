#!/usr/bin/env node
/**
 * Holds every colour `apps/web` writes to a register, and the map's to
 * `packages/design-tokens/src/map-palette.ts`.
 *
 * Mapbox GL evaluates paint properties itself, outside the CSS cascade, so a
 * layer cannot read a custom property and the values have to be literals. That
 * is why the map palette exists: the literals are unavoidable, scattering them
 * is not. This is what stops them scattering again.
 *
 * Six of the modules under `apps/web/src/components/map` had kept a private
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
 * The scan reads whole files rather than masking comments and strings. A hex in
 * a comment is a value somebody is about to paste into a paint property, and
 * the register is where a colour gets talked about.
 *
 * Run it with `pnpm check:map-palette`.
 *
 * ## What the corpus is, since #711
 *
 * Every `.ts` and `.tsx` file under `apps/web/src`, the suites included. #618
 * scoped this to the map directory and wrote down that widening it would be a
 * sweep with a backlog behind it. Measured, that was false: outside the map
 * directory the app holds eight hex literals in three files and nothing else,
 * so the whole of `apps/web` sits at the zero the map directory was gated at.
 *
 * Widening is not a second rule bolted on. `CLAUDE.md` already says to style
 * with Tailwind semantic tokens and to keep durable raw values in
 * `packages/design-tokens`, so a hex literal anywhere in `apps/web` is out of
 * policy and the map directory was only where somebody had counted. What the
 * wider scan buys is the case the narrow one could not see: a colour copied
 * *out* of the map directory. `explorer-row.test.tsx` was passing `#e11d48`
 * under the label "Inaccessible" while `mapLifecycle.inaccessible` had been
 * `brand.red`, `#ef2352`, since the register was written. Nothing painted it
 * and no user saw it, which is exactly why it sat there.
 *
 * The suites are in for that reason. `source-files.mjs` skips them by default
 * because a suite spells a register out as input data, and every finding this
 * gate has outside the map directory is in one. Skipping them would put the
 * count at zero, cost no exemptions, and miss the only drift the widening
 * found.
 *
 * ## What is not in it
 *
 * Stylesheets. `tokens.css` and an app's globals are where a colour is
 * *defined* and handed to Tailwind, so a gate reading them would refuse the
 * register it is pointing people at.
 *
 * `apps/admin`, `apps/preview` and `packages/ui-web`. The register's consumers
 * and the measured drift are in `apps/web`. Each of the others is its own
 * corpus with its own count, and `apps/preview` exists to draw raw token values
 * on a screen.
 *
 * Three and four digit hex, which is #618's decision and is unchanged. See
 * `HEX_COLOR`.
 *
 * ## The marker, and the one directory that takes none
 *
 * A hex that is right carries a comment on the line above:
 *
 *     // hex-color-ignore: a Tag colour the organization picked, not a token.
 *
 * The word is this gate's own. `prose-ignore` is an HTML comment that cannot be
 * typed here, `copy-dash-ignore` and `vocabulary-ignore` belong to rules about
 * words, and sharing a word would make one gate's stale-marker failure fire on
 * another's exemption. The two rules on a marker are `style-gate.mjs`'s and are
 * the ones all four gates carry: the reason ends in a full stop, because #291's
 * wrapped `biome-ignore` is the trap, and a marker that exempts nothing fails,
 * because an unused allowance is headroom the next violation lands inside.
 *
 * Three markers stand, all of them Tag colours in suites. A Tag's colour is a
 * column an organization writes, not a role anything paints, and a suite
 * asserting that the value survives a write has to write the value.
 *
 * **A marker under `apps/web/src/components/map` is refused.** That directory
 * keeps #618's rule exactly: no exemption, because a file that wants one is a
 * file that wants a private colour, which is the thing that drifted.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskedSource } from './lib/masked-source.mjs';
import { pathFrom } from './lib/relative-path.mjs';
import { typeScriptFilesUnder } from './lib/source-files.mjs';
import {
	count,
	failure,
	markersAcross,
	markersIn,
	readMarker,
	report,
	trim,
} from './lib/style-gate.mjs';

const GATE = 'check-map-palette';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/** The corpus, and the directory inside it that takes no exemption. */
const WEB_SOURCE = join(workspaceRoot, 'apps/web/src');
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

/** The word that opens a marker, and the token the sweep for a stale one looks for. */
const MARKER_WORD = 'hex-color-ignore';

/**
 * The floors under the scan, all three of them #591's rule: a walk that has
 * stopped finding the workspace's files must fail rather than report a clean
 * zero.
 *
 * A renamed directory, a moved module, or a walk that quietly stops descending
 * all produce the same summary line as a green run, because "no hex literals
 * found" is exactly what finding no files looks like. These numbers are what
 * tell the cases apart, and moving any of them is a deliberate edit.
 *
 * They are three because each fails on a different silent pass, and the middle
 * one is what #711 owed. Widening the corpus to the app made the outer count
 * large enough to stay green with the map directory renamed away underneath it:
 * 800 modules found and the 63 that hold every colour ever gated missing reads
 * as a pass. So the subtree the rule was written for is counted inside the
 * corpus rather than trusted to be in it.
 *
 * - `MINIMUM_WEB_MODULES`, that the walk still reaches `apps/web/src` at all.
 *   869 modules today, suites included.
 * - `MINIMUM_MAP_MODULES`, that it still descends into the map directory. 63
 *   modules there today, against a floor of 61, which is where #640 put it when
 *   `draw-vertex-edit.ts` moved to `packages/mapping` and took the count from
 *   62 to 61. The two modules added since have not been used to raise it, so
 *   the floor now sits two under the count. That headroom is deliberate: this
 *   is a tripwire against a directory that has gone missing, not a ratchet on
 *   how many modules it holds.
 * - `MINIMUM_PALETTE_IMPORTERS`, that the files are being read and not merely
 *   listed, measured inside the map directory where every module is a consumer
 *   of the register. Twenty-two and not twenty-six: four of the six modules
 *   holding a private block were already reading the register for part of what
 *   they paint, which is how a colour drifts in a file that looks consolidated.
 */
const MINIMUM_WEB_MODULES = 800;
const MINIMUM_MAP_MODULES = 61;
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
 * Widening the corpus to the app makes that worse rather than better: every
 * suite and every docblock under `apps/web/src` cites issues the same way.
 * Shorthand is the one evasion left open, and it is open on purpose: a gate
 * that cries on every issue reference is a gate somebody switches off.
 */
const HEX_COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b/g;

function main() {
	const files = [...typeScriptFilesUnder(WEB_SOURCE, [], { tests: true })].map(readFile);
	assertItReadTheApp(files);

	report(files, { unmarked: unmarkedMessage, stale: staleMessage }, () => announce(files));
}

/** That the walk reached the app and then reached the map directory inside it. */
function assertItReadTheApp(files) {
	if (files.length < MINIMUM_WEB_MODULES) {
		fail(
			`read ${count(files.length, 'module')} under ${relative(WEB_SOURCE)}, fewer than the ${MINIMUM_WEB_MODULES} this expects. The walk has stopped finding the app, so a hex literal in it now passes this. Fix WEB_SOURCE in scripts/check-map-palette.mjs, or lower MINIMUM_WEB_MODULES if that many modules were genuinely deleted.`,
		);
	}

	const inMap = files.filter((file) => file.isMap).length;
	if (inMap < MINIMUM_MAP_MODULES) {
		fail(
			`read ${count(inMap, 'module')} under ${relative(MAP_DIRECTORY)}, fewer than the ${MINIMUM_MAP_MODULES} this expects. The app is being walked and the map directory is not inside what it found, which is the one subtree this rule was written for. Fix MAP_DIRECTORY in scripts/check-map-palette.mjs, or lower MINIMUM_MAP_MODULES if that many modules were genuinely deleted.`,
		);
	}
}

// ---------------------------------------------------------------------------
// The colours
// ---------------------------------------------------------------------------

/** One file as its findings, its markers, and the two facts the floors count. */
function readFile(file) {
	const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
	const where = pathFrom(workspaceRoot, file);
	const lines = source.split('\n');
	const masked = maskedSource(source).split('\n');
	const isMap = file.startsWith(MAP_DIRECTORY);

	return {
		where,
		lines,
		isMap,
		readsRegister: PALETTE_IMPORT.test(source),
		findings: findingsIn(lines, where),
		markers: markersOf(lines, masked, where, isMap),
	};
}

/** Every hex literal in one file, as the line a reader can jump to. */
const findingsIn = (lines, where) =>
	lines.flatMap((line, at) =>
		[...line.matchAll(HEX_COLOR)].map((hit) => ({ where, line: at + 1, value: hit[0] })),
	);

// ---------------------------------------------------------------------------
// The markers
// ---------------------------------------------------------------------------

/** Every marker in one file, well formed or not, and the line each one is above. */
const markersOf = (lines, masked, where, isMap) =>
	markersIn(lines, MARKER_WORD, readerFor(isMap, lines, masked)).map((marker) => ({
		where,
		...marker,
	}));

/**
 * How one file's markers are read.
 *
 * The map directory takes none, so nothing written there is parsed as one: the
 * word itself is the problem, and reporting it as malformed would send somebody
 * to fix a reason that was never going to be read.
 */
const readerFor = (isMap, lines, masked) =>
	isMap
		? () => ({ problem: 'it is under the map directory, which takes no exemption' })
		: (at) => readMarker(MARKER_WORD, lines[at], masked[at]);

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const unmarkedMessage = (finding, lines) =>
	`${GATE}: ${finding.where}:${finding.line} writes ${finding.value}.\n\n` +
	`    ${trim(lines[finding.line - 1].trim())}\n\n` +
	'A colour a map layer paints with is named in packages/design-tokens/src/map-palette.ts.\n' +
	'Read the role off the register rather than writing the value out here, and add a role\n' +
	'with a docblock when there is none that fits. A colour anywhere else in apps/web comes\n' +
	'from a Tailwind semantic token or from packages/design-tokens, which is where CLAUDE.md\n' +
	'puts durable raw values. A hex that is data rather than design, a Tag colour an\n' +
	`organization picked, takes a marker on the line above: // ${MARKER_WORD}: one sentence ending in a full stop.`;

const staleMessage = (marker) =>
	marker.problem === undefined
		? `${GATE}: ${marker.where}:${marker.line} marks line ${marker.target} and exempts nothing.\n\nNothing on that line writes a hex colour this gate reads. Either the colour was moved to the register and the marker outlived it, or the marker is not the line above the one it means. A reason wrapped onto a second line does the second of those.`
		: `${GATE}: ${marker.where}:${marker.line} is not a marker, because ${marker.problem}.`;

/**
 * The summary line, and the last floor.
 *
 * This one runs only on a clean pass, which is the condition it was written
 * under: a report full of hex literals has already proved the walk is reading
 * the tree, and the floor would bury it under a refusal.
 */
function announce(files) {
	const importers = files.filter((file) => file.isMap && file.readsRegister).length;
	const inMap = files.filter((file) => file.isMap).length;

	if (importers < MINIMUM_PALETTE_IMPORTERS) {
		fail(
			`${count(importers, 'module')} of ${inMap} under ${relative(MAP_DIRECTORY)} import ${PALETTE_PACKAGE}, fewer than the ${MINIMUM_PALETTE_IMPORTERS} this expects. The modules are being found and their imports are not, so this run's clean zero is the scan failing rather than the app being clean.`,
		);
	}

	console.log(
		`${GATE}: ${count(files.length, 'module')} under ${relative(WEB_SOURCE)}, ${inMap} of them map modules with ${importers} reading the register, no hex colours, ${count(markersAcross(files), 'line')} exempted by a marker.`,
	);
}

function relative(path) {
	return pathFrom(workspaceRoot, path);
}

main();
