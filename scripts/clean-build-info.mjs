#!/usr/bin/env node
/**
 * Deletes every incremental build info file the workspace's own projects write.
 *
 * `tsc -b` writes one per project and reads it back on the next run to decide
 * what it can skip. When one goes stale it replays what it recorded: errors in
 * files the branch never touched, or a directive reported as unused while the
 * code under it still errors. They outlive deleting every `dist` and building
 * again, and they do not reproduce in CI, which starts from nothing. That is
 * #969, which had cost four branches in two days by the time it was written up.
 *
 * Ten of the fourteen projects write it into `dist/`, so `pnpm build` clears
 * those on the way past. The other four are `apps/web`, `apps/admin`,
 * `apps/preview` and `apps/mobile`, which are `noEmit` and put it under
 * `node_modules/.cache/` so Nx does not treat a file that changes on every
 * build as a cache input. That placement is load-bearing and is not what to
 * change; what it costs is that every clean script, every `find` and every
 * sweep in this workspace skips `node_modules`, so the files most likely to be
 * stale are the ones nothing reaches.
 *
 * Run it with `pnpm clean:build-info`, then build or typecheck again.
 *
 * ## Derived, not globbed
 *
 * Each path comes from the project's own `tsBuildInfoFile`, resolved against
 * the project directory, with TypeScript's default where none is declared. A
 * glob for `*.tsbuildinfo` would be shorter and would also find the sixteen
 * that ship inside installed packages, `hono` and seven Expo plugins among
 * them, which are built output a dependency published and nothing here should
 * delete.
 *
 * The root `tsconfig.json` is in the list too. It is a solution file that no
 * script runs, so it rarely has one, but `tsc -b` at the root writes it beside
 * the config and a hand-run root build is exactly the sort of thing somebody
 * chasing this does.
 *
 * ## It is a fixer, and it is not a gate
 *
 * It changes the tree rather than reporting on it, so it is not named
 * `check:*` and `pnpm check:all` neither runs it nor has to excuse it.
 * `NOT_A_GATE` in `check-all.mjs` is the register for a fixer that is stuck
 * with the prefix, which is `check:write`, and an entry there for a script the
 * parity assertion never looks at would be an exemption excusing nothing.
 *
 * One floor, #591's rule: a run that found fewer projects than the workspace
 * has would delete nothing and print the same "nothing stale" line a clean tree
 * prints, and the person reading it would go back to blaming their branch.
 */

import { rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonc, readProjects } from './lib/workspace-projects.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** What `tsc` names the file when a project declares no path for it. */
const DEFAULT_NAME = 'tsconfig.tsbuildinfo';

/**
 * How few projects means the walk has stopped finding the workspace. Fourteen
 * today, and a number far enough below that an ordinary removal does not trip
 * it.
 */
const MINIMUM_PROJECTS = 10;

/**
 * Where one project's build info goes.
 *
 * `tsBuildInfoFile` wins. Failing that `tsc` writes it beside the emitted
 * output, and failing that beside the config, which is the root solution file's
 * case.
 */
function buildInfoPath(projectPath, tsconfig) {
	const options = tsconfig.compilerOptions ?? {};
	const declared = options.tsBuildInfoFile ?? join(options.outDir ?? '.', DEFAULT_NAME);

	return join(workspaceRoot, projectPath, declared);
}

/** Every project that writes build info, the root solution file included. */
function buildInfoFiles() {
	const projects = readProjects(workspaceRoot);
	const root = { path: '.', tsconfig: readJsonc(join(workspaceRoot, 'tsconfig.json')) };

	return {
		count: projects.length,
		paths: [...projects, root].map((project) => buildInfoPath(project.path, project.tsconfig)),
	};
}

/** Whether a path names a file that is there now. */
function exists(path) {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

/** The path as a person reads it, with forward slashes on every platform. */
const forReading = (path) => relative(workspaceRoot, path).split(/[\\/]/).join('/');

/** Deletes the files that exist and reports which. */
function clean(paths) {
	const deleted = [];

	for (const path of paths) {
		if (!exists(path)) continue;
		rmSync(path);
		deleted.push(forReading(path));
	}

	return deleted;
}

/** Refuses a run whose project walk came up short, before anything is deleted. */
function refuseShortWalk(count) {
	console.error(
		`Found ${count} projects with a tsconfig, under the floor of ${MINIMUM_PROJECTS}.\n` +
			'Something has stopped this reading the workspace, so the build info it did not find is ' +
			'still on disk and still stale. Check pnpm-workspace.yaml and run pnpm install, rather ' +
			'than lowering MINIMUM_PROJECTS in scripts/clean-build-info.mjs.',
	);
	process.exit(1);
}

function main() {
	const { count, paths } = buildInfoFiles();
	if (count < MINIMUM_PROJECTS) refuseShortWalk(count);

	const deleted = clean(paths);
	const hidden = deleted.filter((path) => path.includes('node_modules')).length;

	if (deleted.length === 0) {
		console.log(`No build info on disk. Checked ${paths.length} projects.`);
		return;
	}

	console.log(
		`Deleted ${deleted.length} of ${paths.length} build info files, ${hidden} under node_modules.`,
	);
	for (const path of deleted) console.log(`  ${path}`);
	console.log('\nBuild or typecheck again: the next run reads nothing and recompiles everything.');
}

main();
