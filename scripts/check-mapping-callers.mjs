#!/usr/bin/env node
/**
 * Asserts that every module in `packages/mapping/src`, and every value name its
 * barrel publishes, is reached by a caller outside the package.
 *
 * Run it with `pnpm check:mapping-callers`.
 *
 * ## Why a gate, when `fallow dead-code` already runs
 *
 * `fallow` is right and this is not a second opinion on it. `.fallowrc.jsonc`
 * names `packages/*\/src/index.ts` as an entry point, so a package barrel is a
 * graph root. The barrel re-exports every module beside it, which makes every
 * one of those modules reachable from a root, which makes every name in them
 * live. A module can therefore have no caller anywhere in the workspace and
 * still be reported as used, and four of them were: `features.ts`,
 * `overlays.ts`, `tiles.ts` and `viewport.ts` contributed 33 of the barrel's
 * 115 names and not one of the 33 was imported by anything (#621). Two of the
 * four even had suites, which is how a module with no caller collects
 * maintenance.
 *
 * Widening or narrowing `entry` in `.fallowrc.jsonc` is not the fix. The barrel
 * is a real root for every other package, and moving the entry list changes
 * what all of them report. So the question a barrel cannot answer is asked
 * here instead: not "is this reachable", but "does anything outside the package
 * ask for it".
 *
 * ## Which package
 *
 * This one, because #621 is about this one. The mechanism generalises and the
 * backlog does not: `packages/ui-web` exports its components through a wildcard
 * subpath rather than a barrel, and `packages/db` ships seed modules a script
 * runs rather than a caller imports. Both need a rule of their own before a
 * count over them means anything, and a gate carrying three rules for three
 * packages is three gates in a trench coat. `packages/mapping` is at zero, with
 * no allowance list, which is the shape worth copying when somebody writes the
 * next one.
 *
 * ## What live means
 *
 * A module is live when a caller outside `packages/mapping/src` asks for
 * something it holds, or when a live module imports it.
 *
 * The entries come from the `exports` map in `packages/mapping/package.json`,
 * read through the `fallow` condition, which is the source path behind each
 * subpath. Two shapes reach one:
 *
 * - A barrel, which re-exports names from other modules. `src/index.ts` is one.
 *   It is live because it is the package's public entry, and each module it
 *   re-exports from is live only when one of the names it contributes is named
 *   in an import outside the package. **The barrel's own imports do not
 *   propagate.** That is the whole departure from `fallow`, and skipping it
 *   would make this gate agree with `fallow` and find nothing.
 * - A leaf, which re-exports nothing. `src/test-corpus.ts` is one, behind the
 *   `./test-corpus` subpath. It is live when anything outside imports that
 *   subpath, because there are no names to trace: importing the subpath at all
 *   is the whole of the question.
 *
 * From those seeds the walk follows relative imports. `kmz.ts` is live that
 * way: nothing outside the package names it, and `geometry-import.ts` reads it.
 *
 * A suite is not a caller and the walk never enters `src/tests`. That is the
 * point rather than an omission: `tiles.test.ts` and `overlays.test.ts` covered
 * code nothing called, and a rule that let a suite keep a module alive would
 * have passed over both.
 *
 * ## Value names
 *
 * The module rule keeps a module alive when one of its names is asked for, so
 * every other name it contributes to the barrel rides along. That is how
 * `extendBounds`, `isLngLat`, `ringPerimeterMeters`, `containsLngLat` and
 * `parseBoundingBox` stayed published with no caller outside, and running this
 * rule the first time found three more the issue's search had missed (#1553).
 * So a second rule reads the barrel name by name: every name in a value
 * re-export clause, `export { a } from`, must be named by an import outside
 * `packages/mapping/src`, read off the same scan that feeds the module rule.
 * A name published as `a as b` is looked for as `b`, since that is what a
 * caller imports.
 *
 * Types are left out, both `export type { A } from` and a `type A` entry
 * inside a value clause. A type describes a value a caller receives, the
 * per-kind `ImportGeometry` members and the reshape and split outcomes among
 * them, so a caller can use one through inference without ever naming it, and
 * an import is the wrong question to ask of it.
 *
 * A name with no caller comes out of the barrel. A helper its own module still
 * calls stays there, and whether it keeps its `export` keyword is
 * `fallow dead-code`'s answer: a unit suite importing the module directly is
 * an importer. A name nothing calls is deleted with its unit cases, #621's
 * rule.
 *
 * ## The floors
 *
 * #591's shape, twice, because each guards a silent pass rather than a wrong
 * answer.
 *
 * `MINIMUM_MODULES` fails when the walk stops finding the package. A renamed
 * directory would otherwise leave this reporting zero dead modules out of zero
 * modules, under a summary line that reads like a pass.
 *
 * `MINIMUM_IMPORTED_NAMES` fails when the modules are found and the outside
 * scan stops resolving imports, which is what a renamed package or a changed
 * `exports` map looks like from here. Without it that failure arrives as every
 * module in the package having gone dead at once, and a reader would go looking
 * for a deletion nobody made.
 *
 * `PROBES` is a third guard and cannot be a floor. The name rule is at zero, so
 * a pattern that stopped reading value clauses would print the same clean line
 * a working one prints. Four barrel and caller pairs with known answers run
 * ahead of the walk, through the same reading the barrel and the callers get:
 * a name asked for, a name not asked for, a type-only name not asked for, and
 * a renamed name beside an inline `type` entry. A probe read wrong fails the
 * run before the walk starts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathFrom } from './lib/relative-path.mjs';
import { sourceFiles, typeScriptFilesUnder } from './lib/source-files.mjs';
import { count, failure } from './lib/style-gate.mjs';

const GATE = 'check-mapping-callers';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/** The package under the rule. */
const PACKAGE_DIR = join(workspaceRoot, 'packages/mapping');
const PACKAGE_NAME = '@simmer-mosquito/mapping';
const SOURCE_ROOT = join(PACKAGE_DIR, 'src');

/**
 * A named import or a named re-export, in the two forms that carry names.
 *
 * `import { a } from`, `import type { a } from`, `export { a } from` and
 * `export type { a } from` all reach one. `apps/web` writes the third of those
 * over this package, in `components/gis/regions/import-parse.ts`, so reading only
 * imports would report `parseKmlCoordinates` as having no caller.
 */
const NAMED = /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;

/**
 * A value re-export, `export { a } from`, which is the only clause the name rule
 * reads.
 *
 * `export type { A } from` does not match, because the brace has to follow
 * `export` directly. That is the type exclusion the header explains.
 */
const VALUE_REEXPORT = /export\s+\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;

/** Any module specifier, for the subpath question and for the relative walk. */
const SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g;

/** Below this the walk has stopped finding the package. 7 modules on 2026-09-07. */
const MINIMUM_MODULES = 4;

/**
 * Below this the package is found and the outside scan is resolving nothing.
 * Callers named 52 of its exports on 2026-09-07.
 */
const MINIMUM_IMPORTED_NAMES = 10;

/**
 * Sources with known answers for the name rule, run ahead of the walk.
 *
 * Each pairs a barrel with one caller, and the caller goes through the same
 * `namesAskedIn` the workspace scan uses, so a broken caller scan fails here as
 * well as a broken barrel read. `finds` is the names the rule must report.
 */
const PROBES = [
	{
		barrel: "export { asked } from './a.js';",
		caller: "import { asked } from '@simmer-mosquito/mapping';",
		finds: [],
	},
	{
		barrel: "export { asked, unasked } from './a.js';",
		caller: "import { asked } from '@simmer-mosquito/mapping';",
		finds: ['unasked'],
	},
	{
		barrel: "export type { Unasked } from './a.js';",
		caller: "import { asked } from '@simmer-mosquito/mapping';",
		finds: [],
	},
	{
		barrel: "export { inner as asked, type Unasked } from './a.js';",
		caller: "import { asked } from '@simmer-mosquito/mapping';",
		finds: [],
	},
];

function main() {
	assertItReadsNames();

	const modules = readModules();
	if (modules.length < MINIMUM_MODULES) {
		fail(
			`read ${count(modules.length, 'module')} under packages/mapping/src, fewer than the ${MINIMUM_MODULES} this expects. The walk has stopped finding the package, so this gate is passing over modules nobody calls. Fix PACKAGE_DIR in scripts/check-mapping-callers.mjs, or lower MINIMUM_MODULES if that many modules were genuinely deleted.`,
		);
	}

	const asked = readWhatCallersAsk();
	if (asked.names.size < MINIMUM_IMPORTED_NAMES) {
		fail(
			`callers outside the package name ${count(asked.names.size, 'export')} of it, fewer than the ${MINIMUM_IMPORTED_NAMES} this expects. The modules are being found and the specifiers are not resolving, which is a renamed package or a changed exports map rather than anything about dead modules.`,
		);
	}

	const live = liveModules(asked);
	report(
		modules.filter((module) => !live.has(module)),
		readEntries().flatMap((entry) => uncalledNamesIn(entry, asked)),
	);
}

/**
 * That the name rule still reads a barrel and a caller the way `PROBES` says.
 *
 * No count can stand in for this. The package is at zero uncalled names, so a
 * rule that stopped matching value clauses would print the same clean line a
 * working one prints.
 */
function assertItReadsNames() {
	const wrong = PROBES.filter(
		(probe) =>
			uncalledNames(probe.barrel, new Set(namesAskedIn(probe.caller)))
				.map(({ name }) => name)
				.join(',') !== probe.finds.join(','),
	);
	if (wrong.length > 0) {
		fail(
			`the name rule no longer reads ${count(wrong.length, 'source')} of the ${PROBES.length} in PROBES as expected, the first being: ${wrong[0].barrel} A run in this state reads every barrel name the same wrong way, so it refuses rather than passing. Fix VALUE_REEXPORT, publishedValues or namesAskedIn in scripts/check-mapping-callers.mjs, and change a probe only alongside the rule it states.`,
		);
	}
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Every module in the package, tests excluded. A suite is not a caller. */
const readModules = () => [...typeScriptFilesUnder(SOURCE_ROOT)];

/**
 * What the rest of the workspace asks this package for: the names it imports,
 * and the subpaths it names at all.
 *
 * The walk takes the whole workspace and drops this package's own files, so a
 * suite in another package counts. Only `packages/mapping`'s suites are
 * excluded, and only because a suite here cannot keep its own package alive.
 */
function readWhatCallersAsk() {
	const texts = callerTexts();
	return {
		names: new Set(texts.flatMap(namesAskedIn)),
		subpaths: new Set(texts.flatMap(subpathsNamedIn)),
	};
}

/** Every first-party source file outside the package that mentions it at all. */
const callerTexts = () =>
	[...sourceFiles(workspaceRoot, [], { tests: true })]
		.filter((file) => !file.startsWith(SOURCE_ROOT))
		.map((file) => readFileSync(file, 'utf8'))
		.filter((text) => text.includes(PACKAGE_NAME));

/** The names one file imports or re-exports from the package. */
const namesAskedIn = (text) =>
	[...text.matchAll(NAMED)]
		.filter(([, , specifier]) => isThisPackage(specifier))
		.flatMap(([, clause]) => bindings(clause));

/** The subpaths of the package one file names, in any import form. */
const subpathsNamedIn = (text) =>
	[...text.matchAll(SPECIFIER)].map(([, specifier]) => specifier).filter(isThisPackage);

const isThisPackage = (specifier) =>
	specifier === PACKAGE_NAME || specifier.startsWith(`${PACKAGE_NAME}/`);

/**
 * The names a `{ ... }` clause carries.
 *
 * `a as b` in an import binds `a` from the package and calls it `b` here, so
 * the first half is the name asked for. A re-export renames the other way,
 * `a as b` publishing `b`, but the name asked of this package is still `a`, so
 * one rule covers both.
 */
const bindings = (clause) =>
	clause
		.split(',')
		.map((each) =>
			each
				.trim()
				.replace(/^type\s+/, '')
				.split(/\s+as\s+/)[0]
				?.trim(),
		)
		.filter((name) => name !== undefined && name.length > 0);

/**
 * The published name in each entry of a value clause, type-only entries
 * dropped.
 *
 * A re-export publishes the second half of `a as b`, and `b` is what a caller
 * imports, so that is the name to look for. `bindings` takes the first half
 * because it reads what is asked of the package, and the two answer different
 * questions.
 */
const publishedValues = (clause) =>
	clause
		.split(',')
		.map((each) => each.trim())
		.filter((each) => each.length > 0 && !/^type\s/.test(each))
		.map(
			(each) =>
				each
					.split(/\s+as\s+/)
					.at(-1)
					?.trim() ?? each,
		);

/**
 * The value names one barrel's text publishes and no caller asks for, as
 * `{ name, specifier }`.
 */
const uncalledNames = (text, askedNames) =>
	[...text.matchAll(VALUE_REEXPORT)].flatMap(([, clause, specifier]) =>
		publishedValues(clause)
			.filter((name) => !askedNames.has(name))
			.map((name) => ({ name, specifier })),
	);

/**
 * The uncalled value names one entry module publishes, each with the module it
 * comes from. A leaf publishes no clause and contributes nothing.
 *
 * @returns {Array<{ name: string, module: string }>}
 */
const uncalledNamesIn = (entry, asked) =>
	uncalledNames(readFileSync(entry.file, 'utf8'), asked.names).map(({ name, specifier }) => ({
		name,
		module: resolveRelative(entry.file, specifier)[0] ?? specifier,
	}));

// ---------------------------------------------------------------------------
// The live set
// ---------------------------------------------------------------------------

/**
 * Every module a caller reaches, seeded from the entry modules and grown along
 * relative imports.
 */
function liveModules(asked) {
	const seeds = readEntries().flatMap((entry) => seedsFrom(entry, asked));
	const live = new Set(seeds.map((seed) => seed.file));
	follow(
		live,
		seeds.filter((seed) => seed.follow).map((seed) => seed.file),
	);
	return live;
}

/** The entry modules, as `{ specifier, file }`, from the package's exports map. */
function readEntries() {
	const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'));
	const entries = Object.entries(manifest.exports ?? {}).flatMap(entryFrom);

	if (entries.length === 0) {
		fail(
			`packages/mapping/package.json declares no export subpath with a fallow condition, so this gate has no entry module to start from. CLAUDE.md requires that condition on every subpath resolving to dist/, and pnpm check:build-graph is what enforces it.`,
		);
	}
	return entries;
}

/**
 * One `exports` entry as `{ specifier, file }`, or nothing.
 *
 * Nothing for a subpath with no `fallow` condition, which is `./package.json`
 * here: it resolves to no source and no caller imports a name out of it.
 */
function entryFrom([subpath, target]) {
	const source = sourceCondition(target);
	return source === null
		? []
		: [{ specifier: specifierFor(subpath), file: resolve(PACKAGE_DIR, source) }];
}

/** The source path behind an `exports` target, or null when it names none. */
const sourceCondition = (target) => (typeof target?.fallow === 'string' ? target.fallow : null);

/** The specifier a caller writes for one `exports` subpath. */
const specifierFor = (subpath) =>
	subpath === '.' ? PACKAGE_NAME : `${PACKAGE_NAME}/${subpath.slice(2)}`;

/**
 * What one entry module makes live: itself, plus each module it re-exports a
 * name a caller asked for.
 *
 * A barrel that re-exports nothing is a leaf, and the subpath is the whole
 * question there. An entry that is neither, a barrel nobody imports, still
 * seeds itself: it is the package's published surface, and a gate that called
 * it dead would be arguing with `exports` rather than with a caller.
 *
 * `follow` is false on a barrel and true everywhere else. A barrel imports
 * every module beside it, so following one would make all of them live, which
 * is `fallow`'s answer and the reason this gate found nothing on its first run.
 * A leaf is followed like any other module.
 *
 * @returns {Array<{ file: string, follow: boolean }>}
 */
function seedsFrom(entry, asked) {
	const text = readFileSync(entry.file, 'utf8');
	refuseStarExports(entry, text);

	const reexports = [...text.matchAll(NAMED)];
	if (reexports.length === 0) {
		return asked.subpaths.has(entry.specifier) ? [{ file: entry.file, follow: true }] : [];
	}

	const wanted = reexports.filter(([, clause]) =>
		bindings(clause).some((name) => asked.names.has(name)),
	);
	return [
		{ file: entry.file, follow: false },
		...wanted
			.flatMap(([, , specifier]) => resolveRelative(entry.file, specifier))
			.map((file) => ({ file, follow: true })),
	];
}

/**
 * An `export *` in an entry module, which this cannot read.
 *
 * A star names no names, so there is nothing to match against what a caller
 * asked for, and treating the target as live would make every module behind it
 * live for the reason the barrel already makes everything live. Refusing says
 * so, rather than going quietly green over a package that stopped being
 * measured.
 */
function refuseStarExports(entry, text) {
	if (!/export\s+\*/.test(text)) return;
	fail(
		`${pathFrom(workspaceRoot, entry.file)} carries an export *, and this gate reads a barrel name by name. A star hides which module a caller reached, so every module behind it would count as live and this would report nothing. Write the names out, or teach scripts/check-mapping-callers.mjs to resolve a star.`,
	);
}

/** Grow the live set along relative imports until it stops growing. */
function follow(live, pending) {
	while (pending.length > 0) {
		for (const target of relativeImportsOf(pending.pop())) {
			if (live.has(target)) continue;
			live.add(target);
			pending.push(target);
		}
	}
}

/** The modules one file imports by a relative specifier. */
const relativeImportsOf = (file) =>
	[...readFileSync(file, 'utf8').matchAll(SPECIFIER)].flatMap(([, specifier]) =>
		resolveRelative(file, specifier),
	);

/**
 * The file a relative specifier names, or nothing.
 *
 * The package is ESM and writes `./geometry.js` for `geometry.ts`, which is
 * what the extension swap is for. A specifier that resolves to no file is
 * dropped: a bare package name is one, and so is a path this walk has no
 * business following.
 */
function resolveRelative(from, specifier) {
	if (!specifier.startsWith('.')) return [];
	const base = resolve(dirname(from), specifier).replace(/\.js$/, '');
	const found = ['.ts', '.tsx', '/index.ts'].map((suffix) => base + suffix).find(existsSync);
	return found === undefined ? [] : [found];
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(dead, uncalled) {
	if (dead.length === 0 && uncalled.length === 0) {
		console.log(
			`${GATE}: every module in packages/mapping/src, and every value name its barrel publishes, is reached by a caller.`,
		);
		return;
	}
	reportDeadModules(dead);
	reportUncalledNames(uncalled);
	process.exit(1);
}

function reportDeadModules(dead) {
	if (dead.length === 0) return;
	console.error(
		`${GATE}: ${count(dead.length, 'module')} in packages/mapping/src ${isOrAre(dead)} reached by nothing outside the package. fallow reports them as live because the barrel re-exports them, which is why this gate exists.
`,
	);
	for (const file of dead) {
		console.error(`  ${pathFrom(workspaceRoot, file)}`);
	}
	console.error(
		`
Delete the module and its names from packages/mapping/src/index.ts, along with any suite covering it. If it is meant to have a caller, write the caller in the same branch: a module a barrel publishes and nothing imports is what #621 found four of.
`,
	);
}

function reportUncalledNames(uncalled) {
	if (uncalled.length === 0) return;
	console.error(
		`${GATE}: ${count(uncalled.length, 'value name')} the barrel publishes ${isOrAre(uncalled)} imported by nothing outside the package. The module behind each is live because another of its names is asked for, so the module rule cannot see these.
`,
	);
	for (const { name, module } of uncalled) {
		console.error(`  ${name} from ${pathFrom(workspaceRoot, module)}`);
	}
	console.error(
		`
Take the name out of packages/mapping/src/index.ts. If its own module still calls it, leave it there as a private helper; if nothing calls it, delete it and its unit cases. If it is meant to have a caller, write the caller in the same branch.`,
	);
}

const isOrAre = (list) => (list.length === 1 ? 'is' : 'are');

main();
