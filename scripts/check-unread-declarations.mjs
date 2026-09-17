#!/usr/bin/env node

/**
 * Refuses a declaration whose name starts with an underscore and that nothing
 * in its module reads.
 *
 * Run it with `pnpm check:unread-declarations`. About four seconds over 1,700
 * modules, which is a parse and a scope walk each.
 *
 * ## The hole this closes
 *
 * An underscore prefix is a claim that a binding is deliberately unused, and
 * nothing asked whether the claim was still true. Biome's `noUnusedVariables`
 * and `noUnusedImports` are both `error` here since #543, and the underscore
 * prefix is exactly the convention that silences them. `fallow dead-code` gates
 * unused *exports*, so it never looks inside a module. A module-private
 * declaration wearing the prefix therefore fell between the two gates, and
 * fifteen of them had collected under a green `pnpm check:all` by the time #860
 * counted: two constants that already existed under another name in
 * `hooks/queries/shared`, an icon binding in three files, and a
 * `useAuthSnapshot` call feeding a value no line read.
 *
 * That is the same shape as the dead imports #543 found, one level in. This is
 * what keeps the sixteenth from arriving.
 *
 * ## The rule is narrow, and the narrowness is the point
 *
 * A parameter is out of scope, because an unused parameter in a callback
 * signature is the case the convention exists for and there is nothing to
 * delete. So is a destructuring omission, which names a property in order to
 * drop it from a rest spread. `unread-declarations.mjs` carries both rules and
 * the ambient-declaration one beside them; what is here is the corpus, the
 * floor, the probes and the message.
 *
 * At zero with no allowance list and no marker vocabulary, because a
 * declaration wanting an exemption is a declaration wanting to be dead, and the
 * fix is to delete it. A declaration that is genuinely written for its side
 * effect and read by nothing has one other way out, and the workspace already
 * holds it: `apps/server/src/search.ts` asserts a corpus invariant with a
 * `const _everyCorpusTableIsOrganizationScoped: never` and then writes
 * `void _everyCorpusTableIsOrganizationScoped;` under it, which is a read and
 * says at the call site that the assertion is the whole value.
 *
 * ## The corpus, the floor, and the guard that cannot be a floor
 *
 * Every `apps/<name>/src` and `packages/<name>/src`, suites in, which is
 * `check-compiler-coverage.mjs`'s walk. Suites are in because a dead constant
 * in a suite is as dead as one in a route, and #860 found two of the eleven
 * surviving destructuring patterns in one.
 *
 * `MINIMUM_MODULES` is the floor #591 established, against a walk that has
 * stopped finding the workspace: this gate reports nothing on a clean tree, so
 * a walk that found no files prints the same summary line a passing run does.
 *
 * `PROBES` is the second guard and cannot be a floor. There are two
 * underscore-prefixed declarations in the whole workspace and both are read, so
 * no count over the tree can say whether the detector still reads one. The
 * probes hand it six sources whose answers are known and refuse a run that
 * reads any of them wrong. Three must answer yes and three no, and the three
 * noes are the shapes a rule one notch too wide gets wrong: a parameter, a
 * destructuring omission, and a name mentioned in a comment, which a scan over
 * the text would count as a use.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathFrom } from './lib/relative-path.mjs';
import { sourceFiles } from './lib/source-files.mjs';
import { count, failure, trim } from './lib/style-gate.mjs';
import { unreadDeclarations } from './lib/unread-declarations.mjs';

const GATE = 'check-unread-declarations';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/** The floor under the walk. See the header. */
const MINIMUM_MODULES = 1400;

/**
 * Sources whose findings are known, three that hold one and three that hold
 * none.
 *
 * The comment probe is the one that pins the parse. A gate that read the text
 * would count the mention below the declaration as a use and report nothing,
 * which is indistinguishable here from a clean tree.
 *
 * @type {ReadonlyArray<{ name: string, source: string, unread: readonly string[] }>}
 */
const PROBES = [
	{ name: 'probe-const.ts', source: 'const _dead = 1;\n', unread: ['_dead'] },
	{
		name: 'probe-comment.ts',
		source: 'const _dead = 1;\n// _dead is named here and nowhere else.\n',
		unread: ['_dead'],
	},
	{
		name: 'probe-string.ts',
		source: "const _dead = 1;\nexport const label = '_dead';\n",
		unread: ['_dead'],
	},
	{ name: 'probe-read.ts', source: 'const _live = 1;\nexport const n = _live + 1;\n', unread: [] },
	{ name: 'probe-param.ts', source: 'export const f = (_a, b) => b;\n', unread: [] },
	{
		name: 'probe-omission.ts',
		source: 'export const f = (o) => {\n\tconst { a: _a, ...rest } = o;\n\treturn rest;\n};\n',
		unread: [],
	},
];

/**
 * One module's findings, with a parse error refused rather than answered as
 * none.
 *
 * A module that does not parse contributes no findings, which reads exactly
 * like a module with none, so it fails naming the file.
 */
const findingsIn = (path, source) => {
	try {
		return unreadDeclarations(path, source);
	} catch (error) {
		fail(`${path} did not parse, so the gate cannot say what it declares: ${error.message}`);
	}
};

/** Run the probes, and refuse a run that reads any of them wrong. */
const verifyProbes = () => {
	for (const probe of PROBES) {
		const found = findingsIn(probe.name, probe.source).map((finding) => finding.name);
		if (found.join(',') !== probe.unread.join(',')) {
			fail(
				`the detector reads ${probe.name} as declaring [${found.join(', ')}] unread, and it declares [${probe.unread.join(', ')}]. The detector is broken, so a clean run below means nothing.`,
			);
		}
	}
};

/** The workspace's modules, held to the floor under the walk. */
const readCorpus = () => {
	const modules = [...sourceFiles(workspaceRoot, [], { tests: true })].map((path) =>
		pathFrom(workspaceRoot, path),
	);

	if (modules.length < MINIMUM_MODULES) {
		fail(
			`only ${count(modules.length, 'module')} in the corpus, under the floor of ${MINIMUM_MODULES}. The walk has stopped finding the workspace.`,
		);
	}

	return modules;
};

const run = () => {
	verifyProbes();

	const modules = readCorpus();

	const problems = modules.flatMap((path) => {
		const source = readFileSync(join(workspaceRoot, path), 'utf8');
		const lines = source.split('\n');

		return findingsIn(path, source).map(
			(finding) =>
				`${path}:${finding.line} declares ${finding.name} and nothing reads it.\n  ${trim(lines[finding.line - 1]?.trim() ?? '')}\n  The underscore says it is deliberately unused, so delete it. If something should be reading it, drop the prefix and read it.`,
		);
	});

	if (problems.length > 0) {
		console.error(problems.join('\n\n'));
		process.exit(1);
	}

	console.log(
		`${GATE}: every underscore-prefixed declaration across ${count(modules.length, 'module')} is read.`,
	);
};

run();
