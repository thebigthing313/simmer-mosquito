#!/usr/bin/env node
/**
 * Counts what the React Compiler cannot compile, and holds the number to a
 * register.
 *
 * The migration charted in #649 accepts on one sentence: every React component
 * either compiles or carries a deliberate `"use no memo"` with a stated reason.
 * Nothing in the toolchain said that. The compiler reports through a `logger`
 * and nowhere else, the build is configured to swallow bail-outs rather than
 * fail on them, and Biome does not read React rules here at all, so a component
 * that stops compiling stops compiling silently and the migration has no way to
 * tell a phase that landed clean from one that landed broken.
 *
 * Run it with `pnpm check:compiler-bailouts`. About 35 seconds over 1,100
 * modules, in line with the other `verify` steps.
 *
 * ## The mechanism, and the tool this deliberately does not use
 *
 * The gate drives `babel-plugin-react-compiler` itself, once per module, with
 * `{ noEmit: true, compilationMode: 'infer', panicThreshold: 'none', logger }`.
 * Each setting is load-bearing and #652 measured all three.
 *
 * `infer` and not `annotation`, because in `annotation` mode a module with no
 * directive emits no event at all: the same 940 modules that produce 1,292
 * `CompileSuccess` events under `infer` produce zero under `annotation`. A gate
 * there would report a clean tree for the whole rollout. `panicThreshold` is
 * `none`, because every other value throws out of the transform at the first
 * error and hides every later function in that file; measured on a
 * four-violation probe, `critical_errors` reports one bail-out and loses three.
 * `noEmit`, because the gate reads events and throws the output away.
 *
 * `react-compiler-healthcheck` is the obvious tool and it is unusable. Over
 * this repo it prints `Successfully compiled 1220 out of 1220 components` where
 * the truth is 93 bail-outs in 55 files, because it switches exhaustively on an
 * `ErrorSeverity` enum whose members were all renamed, throws from inside its
 * own `logEvent`, and swallows that throw in a bare `catch {}`. A file with any
 * bail-out contributes to neither the numerator nor the denominator, so four
 * broken components report as `0 out of 0`, which reads exactly like a clean
 * run. Its output is one green line with no file list, no JSON and no varying
 * exit code, so it could not satisfy the acceptance criterion even fixed.
 *
 * That defect is also the rule this file follows: **switch on the event kinds
 * you care about and ignore the rest.** The `LoggerEvent` union lost two
 * members and gained one between the published `1.0.0` and `main`, so a gate
 * that threw on an unknown kind would break on the next bump.
 *
 * ## Its neighbour, which runs the same compiler and asks something else
 *
 * `scripts/check-react-rules.mjs` runs ESLint with
 * `eslint-plugin-react-hooks`, whose compiler rules are the compiler itself,
 * over almost this corpus. It asks whether the source breaks a Rule of React;
 * this asks whether a function compiles. **The two run different builds of the
 * compiler**, so their counts for one rule name are not expected to match and a
 * gap is not a defect: it reports 56 `refs` findings where this reports 50
 * `Refs`, and #779 eliminated every other candidate cause by measurement.
 *
 * ## Two halves, because the rollout is phased
 *
 * #656 makes a phase an entry in a path allowlist at `compilationMode: 'infer'`.
 * That gives this gate two questions rather than one, and `COMPILER_PHASES` in
 * `lib/compiler-phases.mjs` is the register both this and the app builds read,
 * so the paths that are compiled and the paths that are gated cannot drift
 * apart.
 *
 * **Inside the allowlist: zero unexcused bail-outs.** A hard zero with no
 * ratchet, because those paths are compiled for real. What excuses one is a
 * `"use no memo"` directive over the function, with a reason above it.
 *
 * **Outside the allowlist: the checked-in file register, unmoved in either
 * direction.** That is what proves a phase changed only what it claimed to. It
 * ratchets rather than gating at zero for the reason `UNCOVERED_MODULES` does:
 * an absolute gate would fail every branch on history.
 *
 * The register is not read out of the app configs by parsing them, which #777
 * asked for first. A shared module is the same one-register answer and a
 * cheaper one: the configs will import it, so there is no second spelling for a
 * parse to fall behind. What that costs is that the register has one reader
 * until #657 wires the builds to it.
 *
 * ## Todo is counted apart and carries no reason
 *
 * `ErrorCategory: 'Todo'` is the compiler saying it has not implemented a case,
 * not a rule anybody broke, and it is 42 of the 102 findings here, 40 of them a
 * try/catch shape it cannot lower, mostly the house submit handler. #653 is
 * explicit that no edit to those components is correct.
 *
 * So `Todo` is excluded from the file register, exempt from the marker rule,
 * and carried as its own count. Demanding a directive would pin 29 reasons into
 * components that all say the same thing and are all lies: a directive says "do
 * not memoize this, deliberately", where the truth is "the compiler cannot yet,
 * and will". #656 decided this rather than this file.
 *
 * The count may fall and may not rise, which is the one ratchet here that reads
 * in a single direction. It is the exception because a compiler bump lowers it
 * with no component edited, and failing on that would make every bump a red
 * branch for work nobody did. What keeps the slack honest is the exact version
 * pin below: `Todo` cannot move without a commit to point at, so a fall is
 * always attributable, and the summary line names the slack rather than
 * swallowing it.
 *
 * ## The reason a directive owes, and the word it is written with
 *
 * The compiler carries no reason of its own. `CompileSkip.reason` renders as
 * `Skipped due to '[object Object]' directive.` on `1.0.0`, so it does not even
 * name which spelling was used. The reason is therefore a comment on the line
 * above the directive:
 *
 *     // no-memo-reason: Mapbox holds the GL instance in a ref by design.
 *     'use no memo';
 *
 * `readMarker` in `lib/style-gate.mjs` is the parse, so the two rules every
 * marker in this workspace carries apply unchanged: the reason ends in a full
 * stop, because #291's wrapped `biome-ignore` is the trap, and a marker that
 * excuses nothing fails, because an unused allowance is headroom the next
 * violation lands inside.
 *
 * The word is `no-memo-reason` and not `no-memo-ignore`, which breaks the shape
 * of the five markers already here. They each ignore a finding, and a reader
 * meeting one is being told to look past something. This one is not: the line
 * below it is a directive somebody wrote on purpose, and what the comment adds
 * is why. A word saying `ignore` would name the wrong act, and would also read
 * as though deleting the comment were the fix. It is a sixth vocabulary rather
 * than a reuse for the reason `copy-dash-ignore` is a third: sharing a word
 * makes one gate's stale-marker failure fire on another gate's exemption.
 *
 * ## An opt-out does not make the bail-out go away
 *
 * This is the one place the plan behind the gate was wrong about the tool, and
 * it is worth stating because the wrong version is the intuitive one. #656 and
 * #777 both read as though a directive turns a `CompileError` into a
 * `CompileSkip`, so that a marked opt-out stops being a bail-out. It does not.
 * Measured on `1.0.0`:
 *
 * - A function that would otherwise compile, carrying `"use no memo"`, logs
 *   `CompileSkip` and nothing else.
 * - A function that bails out, carrying `"use no memo"`, logs the same
 *   `CompileError` it logged without the directive, and no `CompileSkip` at
 *   all. Module scope behaves the same way.
 *
 * That is consistent rather than broken. Validation runs before the compiler
 * decides whether to emit, so the diagnostic is about the source and the
 * directive is about the output. But it means an opt-out is invisible to any
 * gate that only counts events, and the acceptance criterion this file exists
 * for is precisely "compiles, or opted out on purpose".
 *
 * So the pairing is positional. A `CompileError` carries an `fnLoc`, a
 * directive carries a line, and a directive excuses a finding when it is a
 * module-scope one in the same file or a function-scope one inside that
 * `fnLoc`. `isModuleScope` reads the directive prologue off the source rather
 * than off the events, so it is answerable for a file that produced no findings
 * at all. A directive whose marker is malformed excuses nothing, so a bad
 * reason reads as no reason.
 *
 * What falls through is a directive that is right about a function the compiler
 * says nothing about. Both directions are asserted against the findings, not
 * against each other, so a directive over a function with no finding is
 * reported as excusing nothing, which is the correct answer and is also what a
 * newly-clean component looks like after somebody fixes it.
 *
 * ## What this cannot see at all
 *
 * It counts functions the compiler *tried* to compile in `infer` mode, which is
 * not the set of functions the app renders. A component the heuristic does not
 * recognise as a component is silently outside the corpus, and nothing in the
 * source states which those are. A clean run is therefore "nothing the compiler
 * looked at bailed", not "every component compiles".
 *
 * Generated route trees are outside the corpus, because `source-files.mjs`
 * skips `*.gen.ts`. They declare no components and the build does compile them,
 * so that is a small and deliberate difference between what is gated and what
 * is built.
 *
 * ## Two versions are pinned exactly, and the second one is the surprise
 *
 * `babel-plugin-react-compiler` is pinned to an exact version in
 * `scripts/package.json`, which is where the importer lives, the way `apps/web`
 * pins `@tanstack/router-plugin`. A caret
 * range would move every number in this file under a `pnpm install` with no
 * commit to point at, and #652 measured the churn as real rather than
 * hypothetical: `ErrorSeverity` was rewritten wholesale between two published
 * versions, which is what broke the healthcheck.
 *
 * **`@babel/core` is pinned exactly too, at 7, and that is not tidiness.**
 * `@rolldown/plugin-babel` accepts `^7.29.0 || ^8.0.0-rc.1`, so a workspace can
 * end up on either, and `babel-plugin-react-compiler@1.0.0` depends on
 * `@babel/types@^7` and is out of its own range on Babel 8. It does not fail
 * there. It reads the AST Babel 8 hands it and reports `Todo` findings that are
 * not true of the source: measured, the same 1,107 modules give 42 `Todo`
 * findings in 29 files on `@babel/core@7.29.0` and 273 in 135 files on
 * `@babel/core@8.0.1`, 231 of them one bogus reason, `Expected object property
 * value to be an LVal, got: AssignmentPattern`, which is an ordinary
 * destructured parameter default. Nothing warns. The category that reads as
 * "the compiler has not got to this yet" is exactly where a wrong AST lands, so
 * the tell is a number that jumped rather than an error.
 *
 * The consequence for the rollout is larger than this gate: whatever Babel the
 * app builds resolve is the Babel the compiler runs under there too, and this
 * is the workspace that installs both. So a phase's build and this gate have to
 * be on the same major, and 7 is the one the plugin supports.
 *
 * When a bump does move the numbers, read the diff rather than re-saving blind.
 * That is `pnpm fallow:baseline`'s risk exactly: a re-saved register can bury a
 * regression under an improvement, and `Todo` falling while a real bail-out
 * arrives is the shape to look for.
 *
 * ## Three floors, #591's rule
 *
 * A gate that reports zero because it read nothing looks the same as a clean
 * run, and this one has three separate ways to read nothing.
 *
 * `MINIMUM_MODULES` is against a walk that has stopped finding the app roots. A
 * renamed directory or a changed `src` layout leaves the walk yielding a
 * handful of files, every rule true of them, and the summary line unchanged.
 *
 * `MINIMUM_COMPILED_FUNCTIONS` is against a run that found the files and logged
 * no successes: a plugin that loaded but was handed the wrong option shape, or
 * a `logger` that stopped being wired through. Both leave the file count right
 * and the finding count zero.
 *
 * The third is not a count but an assertion, and it is the one the healthcheck
 * failed: zero `CompileUnexpectedThrow`, zero `PipelineError`, and zero modules
 * that threw out of the transform. Any of the three means a module was never
 * analysed, so its bail-outs are missing rather than absent, and a gate that
 * ignored them would report the tree getting cleaner as it got less readable.
 *
 * `PROBES` is a fourth guard and is not a floor, for `check-map-palette`'s
 * reason and one of its own: there is no directive anywhere in the workspace
 * yet, so no count over the tree can say whether the reader still reads one.
 * See it below.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from '@babel/core';
import reactCompiler from 'babel-plugin-react-compiler';
import { isOptedIn } from './lib/compiler-phases.mjs';
import { maskedSource } from './lib/masked-source.mjs';
import { pathFrom } from './lib/relative-path.mjs';
import { typeScriptFilesUnder } from './lib/source-files.mjs';
import { count, failure, readMarker } from './lib/style-gate.mjs';

const GATE = 'check-compiler-bailouts';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/**
 * The corpus: every React project's source tree, suites included.
 *
 * The suites are in because the compiler runs over them for real. #776 measured
 * 383 modules rewritten in one `apps/web` vitest run, through the `client` Vite
 * environment, so a bail-out in a suite is a bail-out in something that
 * executes. `apps/mobile` is out because it is Metro and a different toolchain,
 * and every other package holds no React.
 */
const SOURCE_ROOTS = ['apps/web/src', 'apps/admin/src', 'apps/preview/src', 'packages/ui-web/src'];

/** The word a directive's reason is written with. */
const MARKER = 'no-memo-reason';

/** An opt-out directive on a line of its own, in all four spellings. */
const OPT_OUT_DIRECTIVE = /^\s*(['"])use no (?:memo|forget)\1\s*;?\s*$/;

/** A line that may stand above a module-scope directive: blank, or a comment. */
const ABOVE_A_MODULE_DIRECTIVE = /^\s*$|^\s*(?:\/\/|\/\*|\*)/;

/**
 * The compiler settings. Each one is measured; see the header.
 *
 * `noEmit` because the gate reads events, `infer` because `annotation` emits
 * none, `panicThreshold: 'none'` because anything else aborts the file at the
 * first error.
 */
const COMPILER_OPTIONS = { noEmit: true, compilationMode: 'infer', panicThreshold: 'none' };

/** The category that is counted apart and owes no reason. See the header. */
const TODO = 'Todo';

/**
 * Files outside the allowlist that hold a bail-out, ratcheted in both
 * directions.
 *
 * Not gated at zero, because an absolute gate would fail every branch on
 * history. A file leaves this list by being fixed, or by a phase opting its
 * path in, and either way that is an edit in the phase's own PR.
 */
const BAILING_FILES = [
	'apps/web/src/components/map/map-canvas.tsx',
	'apps/web/src/components/map/use-address-point.ts',
	'apps/web/src/components/map/use-geojson-layer.ts',
	'apps/web/src/components/map/use-geojson-source.ts',
	'apps/web/src/components/map/use-geolocation.ts',
	'apps/web/src/components/map/use-map-draw.ts',
	'apps/web/src/components/map/use-map-measure.ts',
	'apps/web/src/components/map/use-mapbox-map.ts',
	'apps/web/src/components/map/use-route-layer.ts',
	'apps/web/src/components/map/use-tile-layer.ts',
	'apps/web/src/components/route-planning/route-map.tsx',
	'apps/web/src/components/route-planning/routes-index-page.tsx',
	'apps/web/src/routes/adult-surveillance/-collection-key-entry.tsx',
	'apps/web/src/routes/adult-surveillance/traps/routes/index.tsx',
	'apps/web/src/routes/gis/regions/index.tsx',
	'apps/web/src/routes/larval-surveillance/-sample-key-entry.tsx',
	'apps/web/src/routes/larval-surveillance/habitats/routes/index.tsx',
	'apps/web/src/routes/larval-surveillance/inspections/table.tsx',
	'apps/web/src/routes/operations/-worklist-map.tsx',
	'apps/web/src/routes/public-engagement/service-requests/index.tsx',
	'apps/web/src/tests/unit/components/explorer/explorer-map-page.test.tsx',
	'apps/web/src/tests/unit/components/map/fake-map.tsx',
];

/**
 * How many `Todo` findings the corpus holds, allowed to fall and not to rise.
 *
 * The one single-direction ratchet here, and the header says why.
 */
const TODO_FINDINGS = 42;

/** The floor under the walk. See the header. */
const MINIMUM_MODULES = 950;

/** The floor under the run. See the header. */
const MINIMUM_COMPILED_FUNCTIONS = 1400;

// ---------------------------------------------------------------------------
// Running the compiler
// ---------------------------------------------------------------------------

/** Every module in the corpus, as an absolute path. */
const corpus = () =>
	SOURCE_ROOTS.flatMap((root) => [
		...typeScriptFilesUnder(join(workspaceRoot, root), [], { tests: true }),
	]);

/**
 * The parser plugins one module is read with.
 *
 * `jsx` is added for `.tsx` and refused for `.ts`, because the two conflict:
 * TypeScript spells a generic call `f<T>(x)` and a generic arrow `<T,>() => x`,
 * and with `jsx` on, the parser reads the first `<` as a tag. Handing every
 * module both plugins reported `commit-queue.ts` as a module that threw out of
 * the transform, which is this gate's own "never analysed" failure raised
 * against a file that parses perfectly well.
 */
const parserPluginsFor = (path) => (path.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript']);

/**
 * The first line of a source range, and zero when there is none.
 *
 * A `CompileError` carries a `primaryLocation()` naming the offending
 * expression, which is more useful than the start of the function that holds
 * it, and `fnLoc` is the fallback when it has neither.
 */
const startLine = (loc) => loc?.start?.line ?? 0;

/** The last line of a source range, and zero when there is none. */
const endLine = (loc) => loc?.end?.line ?? 0;

/** The line an event points at, which is the offending expression where it has one. */
const lineOf = (event) => startLine(event.detail?.primaryLocation?.()) || startLine(event.fnLoc);

/**
 * One module's events, or the throw that stopped it being analysed.
 *
 * The `filename` Babel hands `logEvent` is resolved to an absolute path
 * whatever was passed in, so the path is tracked here instead and that argument
 * ignored.
 */
function compile(path) {
	const events = [];
	const logger = { logEvent: (_filename, event) => events.push(event) };

	try {
		transformSync(readFileSync(path, 'utf8'), {
			filename: path,
			configFile: false,
			babelrc: false,
			browserslistConfigFile: false,
			parserOpts: { sourceType: 'module', plugins: parserPluginsFor(path) },
			plugins: [[reactCompiler, { ...COMPILER_OPTIONS, logger }]],
		});
	} catch (error) {
		return { events, threw: error.message.split('\n')[0] };
	}

	return { events, threw: null };
}

// ---------------------------------------------------------------------------
// Reading one module
// ---------------------------------------------------------------------------

/**
 * What one module contributes, with its events sorted into the kinds this gate
 * reads and everything else dropped.
 */
function readModule(path) {
	const { events, threw } = compile(path);
	const file = pathFrom(workspaceRoot, path);
	const errors = events.filter((event) => event.kind === 'CompileError');

	return {
		file,
		threw,
		optedIn: isOptedIn(file),
		compiled: events.filter((event) => event.kind === 'CompileSuccess').length,
		lost: events.filter(
			(event) => event.kind === 'CompileUnexpectedThrow' || event.kind === 'PipelineError',
		).length,
		todos: errors.filter((event) => event.detail?.category === TODO).length,
		skips: events.filter((event) => event.kind === 'CompileSkip').map(spanOf),
		bailouts: errors
			.filter((event) => event.detail?.category !== TODO)
			.map((event) => ({ category: event.detail?.category ?? 'unknown', ...spanOf(event) })),
		directives: directivesIn(path),
	};
}

/** Where a finding is, and the lines of the function it belongs to. */
const spanOf = (event) => ({
	line: lineOf(event),
	start: startLine(event.fnLoc),
	end: endLine(event.fnLoc),
});

/**
 * Whether a directive opts this finding's function out.
 *
 * A module-scope directive covers everything in its file; a function-scope one
 * covers the function whose `fnLoc` its line falls inside. A directive whose
 * marker is malformed covers nothing, so a bad reason reads as no reason rather
 * than as an exemption, and it is reported on its own line as well.
 */
const covers = (directive, finding) =>
	directive.problem === undefined &&
	(directive.moduleScope || (directive.line >= finding.start && directive.line <= finding.end));

/** Every finding in a module, of both kinds, which is what a directive is measured against. */
const findingsOf = (module) => [...module.bailouts, ...module.skips];

/** The bail-outs in a module that no directive opts out of. */
const unexcused = (module) =>
	module.bailouts.filter((bailout) => !module.directives.some((each) => covers(each, bailout)));

/**
 * The opt-out directives in one file, and what each one's marker says.
 *
 * The directive is read off the raw source because it *is* a string literal,
 * which masking blanks. The marker above it is read off the masked copy, which
 * is `readMarker`'s own rule: a line still carrying letters there is code, so
 * the word was typed inside a string and exempts nothing.
 */
const directivesIn = (path) => directivesOf(readFileSync(path, 'utf8'));

/** The same, over source text, so `PROBES` can hand it a case. */
function directivesOf(source) {
	const lines = source.split('\n');
	const masked = maskedSource(source).split('\n');

	return lines.flatMap((line, at) =>
		OPT_OUT_DIRECTIVE.test(line)
			? [{ line: at + 1, moduleScope: isModuleScope(lines, at), ...markerAbove(lines, masked, at) }]
			: [],
	);
}

/**
 * Whether a directive is the module's rather than one function's.
 *
 * A directive prologue is what stands before the first statement, so this is
 * true when everything above the line is blank, a comment, or another
 * directive. Read off the source rather than off the events, because it has to
 * be answerable for a file that produced no findings at all.
 */
const isModuleScope = (lines, at) =>
	lines
		.slice(0, at)
		.every((line) => ABOVE_A_MODULE_DIRECTIVE.test(line) || OPT_OUT_DIRECTIVE.test(line));

/** The marker on the line above a directive, or what is wrong with it. */
function markerAbove(lines, masked, at) {
	if (at === 0 || !lines[at - 1].includes(MARKER)) {
		return { problem: `it carries no \`${MARKER}\` comment on the line above` };
	}
	return readMarker(MARKER, lines[at - 1], masked[at - 1]);
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/** Modules never analysed, which is a missing answer rather than a clean one. */
const lostModules = (modules) =>
	modules
		.filter((module) => module.threw !== null || module.lost > 0)
		.map((module) =>
			module.threw === null
				? `${module.file} logged ${count(module.lost, 'unexpected throw')} out of the compiler, so at least one function in it was never analysed.`
				: `${module.file} threw out of the transform, so none of it was analysed: ${module.threw}`,
		);

/** A bail-out inside the allowlist, which is compiled for real and has no allowance. */
const insideProblems = (modules) =>
	modules
		.filter((module) => module.optedIn)
		.flatMap((module) =>
			unexcused(module).map(
				(bailout) =>
					`${module.file}:${bailout.line} bails out with \`${bailout.category}\` inside the allowlist. Fix it, or opt the function out with a "use no memo" directive and a \`${MARKER}\` comment above it.`,
			),
		);

/** The ratchet outside the allowlist, in both directions. */
function outsideProblems(modules) {
	const bailing = modules
		.filter((module) => !module.optedIn && unexcused(module).length > 0)
		.map((module) => module.file);
	const register = new Set(BAILING_FILES);
	const found = new Set(bailing);

	return [
		...bailing
			.filter((file) => !register.has(file))
			.map(
				(file) =>
					`${file} bails out and is not on \`BAILING_FILES\`. Fix it, or add it and say in the PR why the backlog grew.`,
			),
		...BAILING_FILES.filter((file) => !found.has(file)).map(
			(file) =>
				`${file} is on \`BAILING_FILES\` and no longer bails out. Take it off: an entry that excuses nothing is headroom the next bail-out lands inside.`,
		),
	];
}

/** The directive and marker rule, in both directions. See the header. */
const markerProblems = (modules) => [
	...modules.flatMap((module) =>
		module.directives
			.filter((directive) => directive.problem !== undefined)
			.map(
				(directive) =>
					`${module.file}:${directive.line} opts out of the compiler and ${directive.problem}.`,
			),
	),
	...modules.flatMap((module) =>
		module.skips
			.filter((skip) => !module.directives.some((each) => covers(each, skip)))
			.map(
				(skip) =>
					`${module.file}:${skip.line} was skipped by the compiler and this gate can read no opt-out directive covering it, so nothing states the reason.`,
			),
	),
	...modules.flatMap((module) =>
		module.directives
			.filter(
				(directive) =>
					directive.problem === undefined &&
					!findingsOf(module).some((finding) => covers(directive, finding)),
			)
			.map(
				(directive) =>
					`${module.file}:${directive.line} opts out of the compiler and nothing there was going to be memoized. Delete it: an exemption nothing uses is headroom.`,
			),
	),
];

/** The `Todo` ratchet, which reads in one direction. See the header. */
const todoProblems = (todos) =>
	todos <= TODO_FINDINGS
		? []
		: [
				`${count(todos, 'Todo finding')} against \`TODO_FINDINGS\` of ${TODO_FINDINGS}. \`Todo\` is the compiler saying it has not implemented a case, so a rise means new source in a shape it cannot read yet. Read what arrived before raising the number.`,
			];

/**
 * Six lines the directive reader is handed, and what it must say about each.
 *
 * This is `check-map-palette`'s `PROBES` for the same reason it has them, and
 * the reason is sharper here: **the whole directive half of this gate exercises
 * nothing today.** There is not one `"use no memo"` in the workspace, and there
 * will not be until a phase needs one, so a regression in `OPT_OUT_DIRECTIVE`
 * or in `markerAbove` would sit under the same clean summary line for as long
 * as the count of directives is zero. A floor cannot catch that, because the
 * true count is zero and a floor over it would fail every run until it is not.
 * So the reader is asked to read six lines it is given rather than asked how
 * many it found in the tree.
 *
 * @type {ReadonlyArray<{ source: string, directives: number, wellFormed: number, what: string }>}
 */
const PROBES = [
	{
		source: `// ${MARKER}: Mapbox holds the GL instance in a ref by design.\n'use no memo';\n`,
		directives: 1,
		wellFormed: 1,
		what: 'a directive under a well-formed marker',
	},
	{
		source: `// ${MARKER}: Mapbox holds the GL instance in a ref\n"use no forget";\n`,
		directives: 1,
		wellFormed: 0,
		what: 'a reason with no full stop, which is what a wrapped one looks like',
	},
	{
		source: `// ${MARKER}: because.\n'use no memo';\n`,
		directives: 1,
		wellFormed: 0,
		what: 'a marker carrying no reason',
	},
	{
		source: "'use no memo';\n",
		directives: 1,
		wellFormed: 0,
		what: 'a directive with nothing above it',
	},
	{
		source: `const help = '// ${MARKER}: this is a string, not a comment.';\n'use no memo';\n`,
		directives: 1,
		wellFormed: 0,
		what: 'a marker typed inside a string literal, where it exempts nothing',
	},
	{
		source: "const mode = 'use no memo';\n",
		directives: 0,
		wellFormed: 0,
		what: 'the words in an expression, which is not a directive',
	},
];

/** A probe the reader answered wrong, which fails the run before any rule is applied. */
const probeProblems = () =>
	PROBES.flatMap((probe) => {
		const found = directivesOf(probe.source);
		const wellFormed = found.filter((directive) => directive.problem === undefined).length;
		return found.length === probe.directives && wellFormed === probe.wellFormed
			? []
			: [
					`the directive reader read ${probe.what} as ${count(found.length, 'directive')} of which ${wellFormed} well formed, where it should read ${probe.directives} of which ${probe.wellFormed}. Every opt-out in the tree is judged by this, so nothing else here is trustworthy.`,
				];
	});

/** The floors, reported together because a broken run trips more than one. */
const floorProblems = (modules, compiled) =>
	[
		modules.length < MINIMUM_MODULES
			? `only ${count(modules.length, 'module')} in the corpus, under the floor of ${MINIMUM_MODULES}. The walk has stopped finding the app roots.`
			: null,
		compiled < MINIMUM_COMPILED_FUNCTIONS
			? `only ${count(compiled, 'compiled function')}, under the floor of ${MINIMUM_COMPILED_FUNCTIONS}. The files were found and the compiler logged almost nothing, so the plugin or the logger is not wired.`
			: null,
	].filter((problem) => problem !== null);

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** What the summary says when `Todo` has fallen and the register is holding slack. */
const todoSlack = (todos) =>
	todos < TODO_FINDINGS
		? `, and \`TODO_FINDINGS\` is ${TODO_FINDINGS}, holding ${TODO_FINDINGS - todos} of slack: lower it, reading the diff`
		: '';

/** The one line a clean run prints. */
function announce(modules, compiled, todos) {
	const skips = modules.reduce((total, module) => total + module.skips.length, 0);
	console.log(
		`${GATE}: ${count(modules.length, 'module')}, ${count(compiled, 'compiled function')}, ${count(BAILING_FILES.length, 'file')} on the ratchet, ${count(skips, 'opted-out function')}, ${count(todos, 'Todo finding')}${todoSlack(todos)}.`,
	);
}

function main() {
	const paths = corpus();
	if (paths.length === 0) {
		fail(`no modules under ${SOURCE_ROOTS.join(', ')}, so there is nothing to compile.`);
	}

	const modules = paths.map(readModule);
	const compiled = modules.reduce((total, module) => total + module.compiled, 0);
	const todos = modules.reduce((total, module) => total + module.todos, 0);

	const problems = [
		...probeProblems(),
		...floorProblems(modules, compiled),
		...lostModules(modules),
		...insideProblems(modules),
		...outsideProblems(modules),
		...markerProblems(modules),
		...todoProblems(todos),
	];

	if (problems.length === 0) {
		announce(modules, compiled, todos);
		return;
	}

	console.error(`${GATE}: the React Compiler's answer has moved.\n`);
	for (const problem of problems) console.error(`  - ${problem}`);
	console.error(
		`\nRead the header of scripts/${GATE}.mjs before changing a register. Inside the allowlist the gate is at zero; outside it, \`BAILING_FILES\` is a ratchet that fails in both directions.`,
	);
	process.exitCode = 1;
}

main();
