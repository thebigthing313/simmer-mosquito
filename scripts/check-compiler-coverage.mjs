#!/usr/bin/env node

/**
 * Requires every module that holds React to be on the React Compiler's path
 * allowlist, or on a register of paths that are deliberately off it.
 *
 * Run it with `pnpm check:compiler-coverage`. About two seconds over 1,700
 * modules, which is a parse each and no compiler run.
 *
 * ## The hole this closes
 *
 * `apps/web/src/forms` sat uncompiled through phases 3 to 6 of #649 with every
 * gate green, and #838 found it by reading. Nothing could have said so.
 * `check:compiler-bailouts` runs the compiler over its four React roots and
 * reads `COMPILER_PHASES` only to sort each file into one of two halves: inside
 * the allowlist at a hard zero, outside it on a ratcheted file register. A
 * module that compiles clean is invisible in both halves, so an uncompiled
 * clean module and a compiled clean module produce identical output. That is
 * that gate working as designed. The question it does not ask is whether a
 * module holding React is on the allowlist at all, and this asks it.
 *
 * The register cannot close it either. #838 settled that a phase is one entry
 * and an entry is the record of which phase turned a path on, so every pattern
 * names paths that existed when it was written. Collapsing phases 3 to 7 into
 * one `apps/web/src/` pattern would have covered `forms/` the day it landed and
 * would say nothing at all about `apps/admin` or `packages/ui-web`.
 *
 * #840 inherits the hole rather than being spared it: `check:manual-memo`
 * derives its corpus from `COMPILER_PHASES` by #839's decision, so a wrapper in
 * an uncompiled directory needs no marker and is not counted. The blind spot
 * compounds, which is why this lands before the strip.
 *
 * It found two more the day it was written, both in `apps/web/src` and neither
 * in a directory any phase named: `main.tsx` and `sync/suspense-query-boundary.tsx`.
 * Phase 8 in `COMPILER_PHASES` is those two.
 *
 * ## What "holds React" means
 *
 * A module holds React when its AST contains a JSX element or fragment, calls a
 * bare identifier whose name matches `use[A-Z]`, or imports a value binding
 * from `react` or `react-dom`. All three disjuncts are measured over the
 * workspace and each one carries modules the other two do not, 176 on JSX alone,
 * 113 on a hook call alone and 3 on the import alone. Each earns its place:
 *
 * - JSX alone misses `record-extras.ts`, a `.ts` module holding two
 *   `useCallback` calls and no markup.
 * - A hook call alone misses `first-comment-section.tsx`, which holds a
 *   component and no hook.
 * - Both together miss `packages/ui-web/src/icons/registry.ts`, which imports
 *   `createElement` from `react` and builds components with it.
 *
 * The extension is not a disjunct, which is #842's own conclusion measured:
 * 30 `.tsx` modules in the workspace hold no JSX, no hook and no React import,
 * 26 of them already compiled and the other four suites, so adding it would
 * report nothing new and would call a file React-bearing on the strength of its
 * name. A type-only import is not a disjunct either. `import type { ReactNode }`
 * in a props module gives the compiler nothing to rewrite, and a declaration
 * whose every specifier is `type` reads as one however `importKind` is spelled
 * on the declaration itself.
 *
 * The detector is a parse rather than a scan, and that is not fastidiousness.
 * The first attempt at this matched JSX with a regex and read `Map<string, X>`
 * as an element, which reported all 150 React-free modules of `apps/server` as
 * holding React. A gate whose whole value is one predicate cannot afford a
 * predicate that reads a generic as a tag, and `PROBES` below pins that exact
 * case.
 *
 * ## The corpus is the workspace, not the React projects
 *
 * `check:compiler-bailouts` walks four named source roots, because it runs the
 * compiler and compiling the workspace would cost minutes. This walks every
 * `apps/<name>/src` and `packages/<name>/src` there is, because a list of React
 * roots reproduces the hole one level up: a package that grows a React module
 * is exactly as invisible as `forms/` was, and naming the roots is the same act
 * as naming the phases. The wide walk costs nothing today, since a module with
 * no React contributes nothing and the parse is two seconds, and it fails on
 * the day React appears somewhere nobody wired a compiler pass.
 *
 * That is also why this is its own gate rather than a third assertion inside
 * `check:compiler-bailouts`. The two ask different questions over different
 * corpora, and folding a second walk into that script would make one gate hold
 * two of them, which is the shape a reader stops seeing.
 *
 * ## The exemptions
 *
 * At zero with no allowance beyond `EXEMPT_PATHS`, whose entries each carry a
 * written reason, because a directory wanting an exemption is a directory
 * wanting to be uncompiled and saying so is the whole point. An entry matching
 * no uncompiled React module fails, the rule every marker register here
 * follows: an exemption nothing uses is headroom the next uncompiled directory
 * lands inside.
 *
 * ## The floors, and the guard that is not one
 *
 * `MINIMUM_MODULES` is against a walk that has stopped finding the workspace,
 * and `MINIMUM_REACT_MODULES` against a detector that has stopped detecting.
 * Both otherwise print the same clean summary line a passing run does.
 *
 * `PROBES` is the fourth guard and cannot be a floor. The detector has three
 * disjuncts and a count over the workspace holds while two of them are broken,
 * since nearly every React module here answers yes to more than one. So the
 * probes hand the detector six sources whose answers are known and a run that
 * reads any of them wrong fails on the branch that breaks it. One probe per
 * disjunct, each isolating its own: the hook probe imports nothing, so a broken
 * hook rule cannot pass on the import. Three must answer no, a type-only import,
 * a generic call and a `use*` called on an object, which are the three shapes
 * measured to be read wrong by a rule one notch too wide.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from '@babel/core';
import { isOptedIn } from './lib/compiler-phases.mjs';
import { pathFrom } from './lib/relative-path.mjs';
import { sourceFiles } from './lib/source-files.mjs';
import { count, failure } from './lib/style-gate.mjs';

const GATE = 'check-compiler-coverage';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/**
 * Paths that hold React and are deliberately off the allowlist.
 *
 * Each pattern is tested against a repo-relative POSIX path. An entry that
 * matches no uncompiled React module fails; see the header.
 *
 * @type {ReadonlyArray<{ pattern: RegExp, reason: string }>}
 */
const EXEMPT_PATHS = [
	{
		pattern: /^apps\/mobile\/src\//,
		reason:
			'Expo on Metro, an entirely different toolchain with no Vite pass to switch on. #649 rules it out of scope.',
	},
	{
		pattern: /^apps\/preview\/src\//,
		reason:
			"#655 wires the compiler into apps/preview so a shared ui-web component compiles the same in all three consumers, and leaves preview's own routes undirected and out of the phase plan.",
	},
	{
		pattern: /(?:^|\/)src\/tests\//,
		reason:
			'A suite is not a shipped component. #776 measured the pass really running over the jsdom suites of an app whose src is on the allowlist, at about 12% wall clock, which buys nothing an app that ships gets.',
	},
];

/** The floor under the walk. See the header. */
const MINIMUM_MODULES = 1400;

/** The floor under the detector. See the header. */
const MINIMUM_REACT_MODULES = 600;

/**
 * Sources whose answers are known, one per disjunct and two that must answer no.
 *
 * The last is the regex trap: `Map<string, number>` is a generic call and not a
 * JSX element, and reading it as one is how the first draft of this gate
 * reported every module in `apps/server`.
 *
 * @type {ReadonlyArray<{ name: string, source: string, react: boolean }>}
 */
const PROBES = [
	{ name: 'probe-jsx.tsx', source: 'export const A = () => <div />;\n', react: true },
	{
		name: 'probe-hook.ts',
		source: 'export const useN = (f) => useMemo(() => f, [f]);\n',
		react: true,
	},
	{
		name: 'probe-import.ts',
		source:
			"import { createElement } from 'react';\nexport const make = (t) => createElement(t);\n",
		react: true,
	},
	{
		name: 'probe-type-only.ts',
		source: "import type { ReactNode } from 'react';\nexport type P = { children: ReactNode };\n",
		react: false,
	},
	{
		name: 'probe-generic.ts',
		source:
			'export const ids = new Map<string, number>();\nexport const read = (k: string) => ids.get(k);\n',
		react: false,
	},
	{
		name: 'probe-member-call.ts',
		source: 'export const freeze = (clock) => clock.useFakeTimers();\n',
		react: false,
	},
];

// ---------------------------------------------------------------------------
// The detector
// ---------------------------------------------------------------------------

/** A callee name that makes a call a hook call. */
const HOOK_NAME = /^use[A-Z0-9]/;

/** The specifiers whose module is React itself, rather than a library named after it. */
const REACT_MODULE = /^react(-dom)?(\/|$)/;

/**
 * The parser plugins one module is read with.
 *
 * `jsx` is added for `.tsx` and refused for `.ts`, which is
 * `check-compiler-bailouts.mjs`'s rule for the same reason: TypeScript spells a
 * generic call `f<T>(x)`, and with `jsx` on the parser reads the first `<` as a
 * tag.
 */
const parserPluginsFor = (path) => (path.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript']);

/**
 * Whether an import declaration binds a value from React.
 *
 * `import type { ReactNode } from 'react'` is not one, and neither is
 * `import { type ComponentType, type SVGProps } from 'react'`, whose
 * declaration carries `importKind: 'value'` while every specifier on it is a
 * type. The specifiers are what decide it, with a bare `import 'react'` reading
 * as a value import because it has none to ask.
 */
const bindsReactValue = (node) => {
	if (node.importKind === 'type' || !REACT_MODULE.test(node.source.value)) {
		return false;
	}
	return (
		node.specifiers.length === 0 ||
		node.specifiers.some((specifier) => specifier.importKind !== 'type')
	);
};

/**
 * Whether a call expression is a call to a bare `use*` identifier.
 *
 * A plain identifier and not `object.useThing()`, which is measured rather than
 * assumed: taking the member call too reads `vi.useFakeTimers()` as React, which
 * is three modules of `apps/server`'s suites, and it recovers nothing, because a
 * module writing `React.useMemo` has imported `React` and the import disjunct
 * already holds it. The narrow rule moves the workspace count 748 to 745 and
 * leaves the 656 on the allowlist untouched.
 */
const isHookCall = (node) =>
	node.type === 'CallExpression' &&
	node.callee.type === 'Identifier' &&
	HOOK_NAME.test(node.callee.name);

/**
 * Whether one node is itself React, which is the three disjuncts in one place.
 *
 * The walk below asks this of every node it reaches, so the three rules read as
 * the one question they are rather than as three exits from a traversal.
 */
const declaresReact = (node) =>
	node.type === 'JSXElement' ||
	node.type === 'JSXFragment' ||
	isHookCall(node) ||
	(node.type === 'ImportDeclaration' && bindsReactValue(node));

/**
 * Whether one parsed module holds React.
 *
 * The walk stops at the first node that answers yes, so a component file costs
 * a few dozen nodes and only a React-free module is walked whole.
 */
const holdsReact = (node) => {
	if (node === null || typeof node !== 'object') {
		return false;
	}
	if (Array.isArray(node)) {
		return node.some(holdsReact);
	}
	if (declaresReact(node)) {
		return true;
	}
	return Object.keys(node).some((key) => key !== 'loc' && holdsReact(node[key]));
};

/**
 * Whether the source at one path holds React.
 *
 * A module that does not parse is a failure rather than a no, because a no from
 * a parse error is the same silent pass this gate exists to remove.
 */
const readsAsReact = (path, source) => {
	let ast;
	try {
		ast = parseSync(source, {
			babelrc: false,
			configFile: false,
			filename: path,
			sourceType: 'module',
			parserOpts: { plugins: parserPluginsFor(path) },
		});
	} catch (error) {
		fail(`${path} did not parse, so the gate cannot say whether it holds React: ${error.message}`);
	}
	return holdsReact(ast.program);
};

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

const exemptionFor = (path) => EXEMPT_PATHS.find((entry) => entry.pattern.test(path));

/**
 * Run the six probes, and refuse a run that reads any of them wrong.
 *
 * This is ahead of the counts rather than beside them, because the detector has
 * three disjuncts and nearly every React module answers yes to more than one,
 * so a broken disjunct moves no total far enough to notice.
 */
const verifyProbes = () => {
	for (const probe of PROBES) {
		const answer = readsAsReact(probe.name, probe.source);
		if (answer !== probe.react) {
			fail(
				`the React detector reads ${probe.name} as ${answer ? 'holding' : 'not holding'} React, and it ${probe.react ? 'does' : 'does not'}. The detector is broken, so every count below is meaningless.`,
			);
		}
	}
};

/**
 * The workspace's modules and the ones holding React, both held to their floor.
 *
 * The two floors fail on different silent passes: a walk that has stopped
 * finding the workspace, and a detector that has stopped detecting.
 */
const readCorpus = () => {
	const modules = [...sourceFiles(workspaceRoot, [], { tests: true })].map((path) =>
		pathFrom(workspaceRoot, path),
	);

	if (modules.length < MINIMUM_MODULES) {
		fail(
			`only ${count(modules.length, 'module')} in the corpus, under the floor of ${MINIMUM_MODULES}. The walk has stopped finding the workspace.`,
		);
	}

	const react = modules.filter((path) =>
		readsAsReact(path, readFileSync(join(workspaceRoot, path), 'utf8')),
	);

	if (react.length < MINIMUM_REACT_MODULES) {
		fail(
			`only ${count(react.length, 'module')} of ${modules.length} hold React, under the floor of ${MINIMUM_REACT_MODULES}. The detector found the files and read almost nothing out of them.`,
		);
	}

	return { modules, react };
};

/**
 * What the rule refuses: an uncompiled React module nothing excuses, and an
 * `EXEMPT_PATHS` entry excusing nothing.
 *
 * The second half is the rule every marker register here follows. An entry that
 * matches nothing is headroom the next uncompiled directory lands inside, which
 * is how a gate goes quiet without anyone editing it.
 */
const problemsIn = (uncompiled) => {
	const unexcused = uncompiled.filter((path) => exemptionFor(path) === undefined);
	const stale = EXEMPT_PATHS.filter(
		(entry) => !uncompiled.some((path) => entry.pattern.test(path)),
	);

	return [
		...unexcused.map(
			(path) =>
				`${path} holds React and is not on the compiler allowlist.\n  Add its path to COMPILER_PHASES as a phase of its own, or give it an EXEMPT_PATHS entry saying why it stays uncompiled.`,
		),
		...stale.map(
			(entry) =>
				`the EXEMPT_PATHS entry ${entry.pattern} excuses nothing, so it is headroom the next uncompiled directory lands inside.\n  Its reason reads: ${entry.reason}`,
		),
	];
};

const run = () => {
	verifyProbes();

	const { modules, react } = readCorpus();
	const uncompiled = react.filter((path) => !isOptedIn(path));
	const problems = problemsIn(uncompiled);

	if (problems.length > 0) {
		console.error(problems.join('\n\n'));
		process.exit(1);
	}

	console.log(
		`${GATE}: ${count(react.length, 'module')} of ${modules.length} hold React, ${react.length - uncompiled.length} on the compiler allowlist and ${uncompiled.length} excused by ${count(EXEMPT_PATHS.length, 'EXEMPT_PATHS pattern')}.`,
	);
};

run();
