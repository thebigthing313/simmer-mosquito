#!/usr/bin/env node

/**
 * Holds the Rules of React backlog to the number it was measured at, per file.
 *
 * Nothing in this workspace read a React rule before this. Biome is the linter
 * and its `react` domain is off, so `useExhaustiveDependencies`,
 * `useHookAtTopLevel`, `noChildrenProp` and `noArrayIndexKey` are absent from
 * the 208 rules it has enabled, and 104 violations had collected under a green
 * `pnpm check` (#651). That matters to the compiler rollout charted in #649 for
 * a specific reason: the compiler bails out on the code these rules name, so
 * the backlog is the work list for every phase, and a phase that quietly added
 * to it would look exactly like one that did not.
 *
 * Run it with `pnpm lint:react`. About 20 seconds locally over 1,061 modules,
 * and budget 40 to 60 on the runner, which makes it the most expensive static
 * gate here by an order of magnitude and still small beside `typecheck`.
 *
 * **This prints counts. A developer reading what is actually wrong runs
 * `npx eslint` at the workspace root**, which uses the same config and prints
 * the messages with their source lines. Point at one file to see one file.
 *
 * `pnpm check` is still Biome and nothing else. The two linters are separate
 * commands on purpose: `CLAUDE.md`'s zero-warning argument is written about
 * Biome specifically and would read as covering this if they shared a script.
 * The config, the Biome boundary and the corpus are in
 * `tools/eslint-config/eslint.config.js`.
 *
 * ## Its neighbour, which runs the same compiler and asks something else
 *
 * `scripts/check-compiler-bailouts.mjs` drives `babel-plugin-react-compiler`
 * over almost the same corpus. It asks whether a function compiles. This asks
 * whether the source breaks a rule. The overlap is real and the answers are
 * not interchangeable, which is worth stating because a reader meeting both
 * will assume one of them is redundant.
 *
 * **The two run different builds of the compiler**, so their counts for the
 * same rule name are not expected to match and a gap is not a defect. The
 * compiler bundled inside `eslint-plugin-react-hooks@7.1.1` is not
 * `babel-plugin-react-compiler@1.0.0`: the bail-out gate reports 50 `Refs`
 * findings where this reports 56, and #779 eliminated every other candidate
 * cause by measurement, leaving version churn. #653 records the same shape for
 * `EffectSetState`, 33 against 28.
 *
 * ## What the plugin cannot see, which is more than it looks
 *
 * The compiler rules here **are** the compiler: the rule body calls
 * `babel.transformFromAstSync` with the compiler plugin and reports what it
 * collects. But the reported set is narrower than what the compiler bails on,
 * through four gates and three of them silent (#651):
 *
 * - A diagnostic whose category has no enabled rule is dropped. Eleven
 *   categories ship `Off` inside the plugin.
 * - A diagnostic with no primary location is dropped.
 * - Both the Babel parse and the transform sit in bare `try {} catch {}` with
 *   empty bodies, so **a file the parser cannot read lints clean**.
 * - The rule reads only `CompileError` of the six event kinds.
 *
 * So a clean run here means "nothing the plugin reported", not "no component
 * breaks a rule". react.dev states the sound direction only, that a report
 * means the compiler will skip that component; the converse is claimed
 * nowhere.
 *
 * ## The register is per file, and what that leaves open
 *
 * `REACT_RULE_BACKLOG` is the measured backlog keyed by file, and it fails in
 * both directions the way `UNCOVERED_MODULES` does: a file that grows a finding
 * fails, and a file that loses one fails until the register comes down with it.
 * The second half is the point. An entry holding a count nothing produces any
 * more is headroom the next violation lands inside, which is the `fallow`
 * baseline failure `CLAUDE.md` describes.
 *
 * Not `--max-warnings`, and not one total. One number is what a swap holds:
 * a violation fixed in one file and another written in a second reads as no
 * change at all. Keying by file is `MINIMUM_WITHHELD`'s argument for being
 * keyed by table.
 *
 * What a per-file key leaves open is a swap **inside** one file, between two
 * rules or between two lines. That is deliberate rather than an oversight:
 * keying by rule as well would fail a branch that fixed a `refs` finding and
 * introduced an `exhaustive-deps` one in the same module, which is worth
 * catching, and it would also fail every rename inside the plugin, which is
 * not. The count is what `npx eslint` reads back in a second.
 *
 * A rule is never switched off to bring a count down, and the config takes
 * `flat.recommended` whole for that reason. Switching one off hides a finding
 * where the register counts it.
 *
 * ## Two floors, #591's rule
 *
 * A gate that reports zero because it read nothing looks the same as a clean
 * run, and this one has two ways to read nothing.
 *
 * `MINIMUM_MODULES` is against a run that linted no corpus at all: a config
 * that failed to load a plugin, a `cwd` that is not the workspace, an ignore
 * pattern that swallowed the tree.
 *
 * `PROJECT_FLOORS` is the one that matters more, and it is per project. The
 * corpus is five `files` globs, and a glob that stops matching takes a whole
 * project out of the count silently: a renamed directory, a project moved
 * under another parent, an `apps/mobile` that grows a second source root. What
 * arrives then is the backlog appearing to fall, with a register full of
 * entries reported as fixed, which reads like somebody's cleanup rather than
 * like a corpus that vanished. Every project therefore carries its own floor.
 *
 * Both are read against the corpus rather than against the results, because
 * ESLint walks the working directory and lints every `.js` it meets, config or
 * no config. A `.mjs` in `scripts/` matches no config object here and is
 * counted by neither.
 *
 * ## The versions are pinned exactly
 *
 * `eslint` and `eslint-plugin-react-hooks` are pinned to exact versions in
 * `tools/eslint-config/package.json`, the way `apps/web` pins
 * `@tanstack/router-plugin`. A caret range moves every number in this file
 * under a `pnpm install` with no commit to point at, and the churn is measured
 * rather than hypothetical: the plugin's v6 and v7 report different counts for
 * the same rule names, 50 `refs` against 56 and 28 `set-state-in-effect`
 * against 33, and v6 reports three `preserve-manual-memoization` findings that
 * v7 does not report at all. A branch on one is not comparable with a branch on
 * the other.
 *
 * `typescript` is pinned there too, at 6.0.3, and that is not tidiness either.
 * `typescript-eslint` throws at config load on the TypeScript 7 this workspace
 * compiles with, and the package exists to give it a 6 without touching what
 * `tsc` resolves. Its header carries the rest.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { REACT_SOURCE } from '../tools/eslint-config/eslint.config.js';
import { pathFrom } from './lib/relative-path.mjs';
import { count, failure } from './lib/style-gate.mjs';

const GATE = 'check-react-rules';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/**
 * The measured backlog, keyed by file. See the header for what moves it and
 * what it cannot hold.
 *
 * 104 findings across 50 files: `refs` 56, `set-state-in-effect` 31,
 * `exhaustive-deps` 12, `immutability` 2, `static-components` 2 and
 * `incompatible-library` 1. #779 reads the `refs` half by code shape, and the
 * phase tickets under #649 are what take these down.
 */
const REACT_RULE_BACKLOG = new Map([
	['apps/preview/src/useCssTokens.ts', 1],
	['apps/web/src/components/cleanup/habitat-merge.tsx', 1],
	['apps/web/src/components/cleanup/merge-confirm-dialog.tsx', 1],
	['apps/web/src/components/explorer/result-list.tsx', 1],
	['apps/web/src/components/explorer/use-map-bounds.ts', 1],
	['apps/web/src/components/explorer/use-paged-map-resource.ts', 2],
	['apps/web/src/components/key-entry/key-entry-dialog.tsx', 1],
	['apps/web/src/components/map/map-canvas.tsx', 1],
	['apps/web/src/components/map/map-readout.tsx', 1],
	['apps/web/src/components/map/map-search.tsx', 3],
	['apps/web/src/components/map/use-address-point.ts', 2],
	['apps/web/src/components/map/use-geojson-layer.ts', 1],
	['apps/web/src/components/map/use-geojson-source.ts', 6],
	['apps/web/src/components/map/use-geolocation.ts', 1],
	['apps/web/src/components/map/use-map-draw.ts', 9],
	['apps/web/src/components/map/use-map-extent-fit.ts', 1],
	['apps/web/src/components/map/use-map-measure.ts', 5],
	['apps/web/src/components/map/use-map-padding.ts', 1],
	['apps/web/src/components/map/use-mapbox-map.ts', 3],
	['apps/web/src/components/map/use-route-layer.ts', 5],
	['apps/web/src/components/map/use-tile-layer.ts', 2],
	['apps/web/src/components/route-planning/route-map.tsx', 1],
	['apps/web/src/components/search/search-result-row.tsx', 1],
	['apps/web/src/components/search/use-palette-content.ts', 1],
	['apps/web/src/components/search/use-search-navigation.ts', 2],
	['apps/web/src/components/stop-order/inline-edit-field.tsx', 1],
	['apps/web/src/components/stop-order/use-stop-order.ts', 1],
	['apps/web/src/routes/-auth.tsx', 1],
	['apps/web/src/routes/-habitat-detail.tsx', 1],
	['apps/web/src/routes/gis/addresses/index.tsx', 2],
	['apps/web/src/routes/gis/regions/import.tsx', 2],
	['apps/web/src/routes/larval-surveillance/-sample-key-entry.tsx', 1],
	['apps/web/src/routes/larval-surveillance/habitats/-route-address-dialog.tsx', 1],
	['apps/web/src/routes/larval-surveillance/inspections/table.tsx', 3],
	['apps/web/src/routes/larval-surveillance/samples/$id.tsx', 4],
	['apps/web/src/routes/my-organization/-components/general.tsx', 1],
	['apps/web/src/routes/operations/-worklist-map.tsx', 1],
	['apps/web/src/routes/public-engagement/contacts/index.tsx', 2],
	['apps/web/src/routes/public-engagement/service-requests/index.tsx', 2],
	['apps/web/src/routes/search.tsx', 7],
	['apps/web/src/tests/unit/components/explorer/explorer-map-page.test.tsx', 4],
	['packages/ui-web/src/components/color-picker.tsx', 1],
	['packages/ui-web/src/hooks/use-mobile.ts', 1],
]);

/**
 * How many modules each project must contribute, well under what it holds.
 *
 * Measured: 880, 104, 54, 12 and 11. A floor per project rather than one over
 * the corpus, because one glob going dead is what the header describes and a
 * total large enough to survive it would say nothing.
 */
const PROJECT_FLOORS = new Map([
	['apps/web/src', 800],
	['packages/ui-web/src', 90],
	['apps/admin/src', 45],
	['apps/mobile/src', 10],
	['apps/preview/src', 10],
]);

/** The floor under the whole run. See the header. */
const MINIMUM_MODULES = 950;

// ---------------------------------------------------------------------------
// Running the linter
// ---------------------------------------------------------------------------

/**
 * The whole workspace, linted through the root config.
 *
 * `.` rather than the corpus globs, so this and a developer's bare `npx eslint`
 * read exactly the same set. What the config does not match, it does not lint.
 * `concurrency: 'auto'` is the ESLint 10 option that takes the run from 30
 * seconds to 18.
 */
const lint = () => new ESLint({ cwd: workspaceRoot, concurrency: 'auto' }).lintFiles(['.']);

/** The directory each `files` glob names, which is what a project is counted under. */
const projectRoots = () => REACT_SOURCE.map((glob) => glob.slice(0, glob.indexOf('/**')));

/** The project root a file sits under, or `null` when it is outside the corpus. */
const projectOf = (file) => projectRoots().find((root) => file.startsWith(`${root}/`)) ?? null;

/** One result as this gate reads it: a workspace-relative path and what was reported. */
const readResult = (result) => {
	const file = pathFrom(workspaceRoot, result.filePath);
	return {
		file,
		project: projectOf(file),
		findings: result.messages.length,
		fatal: result.messages.filter((message) => message.fatal === true).length,
		rules: result.messages.map((message) => message.ruleId ?? 'no rule'),
	};
};

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/**
 * A file whose count has moved, in either direction, and an entry nothing
 * produces.
 */
function registerProblems(corpus) {
	const found = new Map(
		corpus.filter((module) => module.findings > 0).map((module) => [module.file, module.findings]),
	);

	return [
		...[...found].flatMap(([file, findings]) => {
			const expected = REACT_RULE_BACKLOG.get(file);
			if (expected === findings) return [];
			return expected === undefined
				? [
						`${file} breaks a React rule ${count(findings, 'time')} and is not on \`REACT_RULE_BACKLOG\`. Fix it, or add it and say in the PR why the backlog grew.`,
					]
				: [
						`${file} breaks a React rule ${count(findings, 'time')}, where the register says ${expected}. Read them with \`npx eslint ${file}\`, then move the entry.`,
					];
		}),
		...[...REACT_RULE_BACKLOG.keys()]
			.filter((file) => !found.has(file))
			.map(
				(file) =>
					`${file} is on \`REACT_RULE_BACKLOG\` and breaks no React rule. Take the entry off: a count nothing produces is headroom the next violation lands inside.`,
			),
	];
}

/**
 * A file ESLint could not read, which is a missing answer rather than a clean
 * one.
 *
 * The plugin swallows its own parse failures in an empty `catch`, so a file the
 * Babel parse chokes on reports nothing at all. This catches the other half,
 * the parse ESLint itself does, and reports it apart from the register rather
 * than letting it read as a file that grew a finding.
 */
const fatalProblems = (corpus) =>
	corpus
		.filter((module) => module.fatal > 0)
		.map(
			(module) =>
				`${module.file} could not be parsed, so no rule was applied to it and its findings are missing rather than absent. Run \`npx eslint ${module.file}\`.`,
		);

/** The floors, reported together because a broken run trips more than one. */
function floorProblems(corpus) {
	const perProject = new Map(projectRoots().map((root) => [root, 0]));
	for (const module of corpus) {
		perProject.set(module.project, (perProject.get(module.project) ?? 0) + 1);
	}

	return [
		corpus.length < MINIMUM_MODULES
			? `only ${count(corpus.length, 'module')} in the corpus, under the floor of ${MINIMUM_MODULES}. The config matched almost nothing, so nothing here was checked.`
			: null,
		...[...PROJECT_FLOORS].map(([root, floor]) =>
			(perProject.get(root) ?? 0) < floor
				? `only ${count(perProject.get(root) ?? 0, 'module')} under ${root}, below its floor of ${floor}. That project's \`files\` glob has stopped matching it, which reads as the backlog falling rather than as a corpus that went missing.`
				: null,
		),
	].filter((problem) => problem !== null);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** Every rule that fired and how often, worst first, for the summary line. */
const byRule = (corpus) => {
	const totals = new Map();
	for (const module of corpus) {
		for (const rule of module.rules) totals.set(rule, (totals.get(rule) ?? 0) + 1);
	}
	return [...totals]
		.sort(([, left], [, right]) => right - left)
		.map(([rule, total]) => `${rule.replace('react-hooks/', '')} ${total}`);
};

/** The one line a clean run prints. */
function announce(corpus) {
	const findings = corpus.reduce((total, module) => total + module.findings, 0);
	console.log(
		`${GATE}: ${count(corpus.length, 'module')}, ${count(findings, 'finding')} across ${count(REACT_RULE_BACKLOG.size, 'file')} on the register (${byRule(corpus).join(', ')}).`,
	);
}

async function main() {
	const results = await lint();
	const corpus = results.map(readResult).filter((module) => module.project !== null);

	if (corpus.length === 0) {
		fail('the config matched no files at all, so nothing was linted. Read tools/eslint-config.');
	}

	const problems = [
		...floorProblems(corpus),
		...fatalProblems(corpus),
		...registerProblems(corpus),
	];

	if (problems.length === 0) {
		announce(corpus);
		return;
	}

	console.error(`${GATE}: the React rules backlog has moved.\n`);
	for (const problem of problems) console.error(`  - ${problem}`);
	console.error(
		`\nRead the header of scripts/${GATE}.mjs before changing the register, and \`npx eslint <file>\` to see what a count is made of. The register fails in both directions on purpose.`,
	);
	process.exitCode = 1;
}

await main();
