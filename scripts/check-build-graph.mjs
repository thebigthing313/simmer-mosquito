#!/usr/bin/env node
/**
 * Asserts that the workspace's build graphs agree.
 *
 * Which project depends on which one is declared twice, and the two
 * declarations are read by different commands:
 *
 * | Command                     | Ordering source                      | Who runs it    |
 * | --------------------------- | ------------------------------------ | -------------- |
 * | `pnpm build`, `pnpm typecheck` | Nx, from package.json dependencies | CI, developers |
 * | `pnpm --filter <app> build` | `tsc -b`, from tsconfig `references` | every deploy   |
 *
 * A third declaration, the root solution file, names which projects a root
 * `tsc -b` builds at all. It is checked separately, against the workspace
 * rather than against a dependency list; see `rootSolutionFailures`.
 *
 * Nothing keeps them in step. When they disagree, Nx orders the build correctly
 * from the package.json dependency, every gate is green, and then the deploy —
 * which runs the filtered build, and so has only the tsconfig to go on — fails
 * to resolve an import. That is #175: `packages/sync` gained a source file
 * importing `@simmer-mosquito/db` while its tsconfig declared no references, and
 * all three services broke on a merge whose CI was green.
 *
 * `fallow dead-code` cannot see this. The import *resolves* — it names a real
 * workspace package that is a declared dependency — so nothing is unresolved.
 * What is missing is a build-order declaration, which is not an import problem.
 * `pnpm build` and `pnpm typecheck` cannot see it either. Both go through Nx, so
 * they are correctly ordered by construction and can never disagree with
 * themselves.
 *
 * So this reads both declarations and requires them to name the same edges, in
 * both directions:
 *
 * - a workspace dependency with no `references` entry is the #175 fault — the
 *   deploy has nothing to order the build from;
 * - a `references` entry with no workspace dependency is its mirror — the
 *   package manager does not know about an edge the compiler does, so the
 *   import resolves through hoisting and stops the day the layout changes.
 *
 * This gates the *cause*. CI's `Shipped build` job proves the effect by running
 * the filtered command every Dockerfile runs, against a clean tree.
 *
 * Run it with `pnpm check:build-graph`.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every field a workspace edge can be declared in. */
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

/**
 * Strips the two things a tsconfig may contain and `JSON.parse` will not take:
 * comments, and a trailing comma before a closing brace or bracket.
 *
 * Half the tsconfigs here carry comments — `packages/mapping` explains its `DOM`
 * lib in a block comment, `packages/sync` explains the very reference this check
 * exists to guard — and TypeScript 7's package no longer exposes
 * `readConfigFile`, so there is no parser to borrow (see CLAUDE.md).
 *
 * String-aware on purpose: a `//` inside a path value is not a comment, and a
 * quote inside a comment does not open a string.
 */
function stripJsonComments(text) {
	let out = '';
	let index = 0;
	/** Where in `out` each comma outside a string landed, so a `,]` in a path is left alone. */
	const commas = [];

	while (index < text.length) {
		const char = text[index];

		if (char === '"') {
			const end = endOfString(text, index);
			out += text.slice(index, end);
			index = end;
			continue;
		}

		const comment = commentLength(text, index);
		if (comment > 0) {
			index += comment;
			continue;
		}

		if (char === ',') commas.push(out.length);
		out += char;
		index++;
	}

	return dropTrailingCommas(out, commas);
}

/** The index just past the string literal that starts at `start`. */
function endOfString(text, start) {
	for (let index = start + 1; index < text.length; index++) {
		if (text[index] === '\\') index++;
		else if (text[index] === '"') return index + 1;
	}

	return text.length;
}

/** How many characters the comment at `start` occupies, or 0 where none begins. */
function commentLength(text, start) {
	if (text[start] !== '/') return 0;

	// The newline itself is left in, so a `//` comment does not join two lines.
	if (text[start + 1] === '/') {
		const end = text.indexOf('\n', start);
		return end === -1 ? text.length - start : end - start;
	}

	if (text[start + 1] === '*') {
		const end = text.indexOf('*/', start + 2);
		return end === -1 ? text.length - start : end + 2 - start;
	}

	return 0;
}

/** Removes each comma at the given indices that is followed by a `}` or `]`. */
function dropTrailingCommas(text, indices) {
	let out = text;

	// Right to left, so removing one does not move the next one's index.
	for (const index of [...indices].reverse()) {
		if (/^,\s*[}\]]/.test(out.slice(index))) out = out.slice(0, index) + out.slice(index + 1);
	}

	return out;
}

function readJsonc(path) {
	try {
		return JSON.parse(stripJsonComments(readFileSync(path, 'utf8')));
	} catch (error) {
		throw new Error(`${path} is not readable as JSON: ${error.message}`);
	}
}

/**
 * The workspace's project directories, read from `pnpm-workspace.yaml` rather
 * than hard-coded, so a third directory alongside `apps` and `packages` cannot
 * leave half the workspace unchecked.
 *
 * Only `<dir>/*` patterns are understood — the only shape this workspace uses.
 * Anything else is an error rather than a skip, for the same reason.
 */
function workspaceDirectories() {
	const yaml = readFileSync(join(workspaceRoot, 'pnpm-workspace.yaml'), 'utf8');
	const patterns = [];

	for (const line of yaml.split('\n')) {
		const match = /^\s*-\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
		if (match?.[1]) patterns.push(match[1]);
	}

	return patterns.map((pattern) => {
		const match = /^([^*]+)\/\*$/.exec(pattern);
		if (!match?.[1]) {
			throw new Error(
				`pnpm-workspace.yaml declares "${pattern}", which this check does not understand. ` +
					'It reads `<dir>/*` patterns only — teach it the new shape rather than dropping the pattern.',
			);
		}
		return match[1];
	});
}

/** Every workspace project that compiles: one with both a package.json and a tsconfig.json. */
function readProjects() {
	const projects = [];

	for (const directory of workspaceDirectories()) {
		const parent = join(workspaceRoot, directory);
		if (!existsSync(parent)) continue;

		for (const entry of readdirSync(parent, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;

			const path = `${directory}/${entry.name}`;
			const manifestPath = join(workspaceRoot, path, 'package.json');
			const tsconfigPath = join(workspaceRoot, path, 'tsconfig.json');
			if (!existsSync(manifestPath) || !existsSync(tsconfigPath)) continue;

			const manifest = readJsonc(manifestPath);
			projects.push({
				path,
				name: manifest.name,
				manifest,
				tsconfig: readJsonc(tsconfigPath),
			});
		}
	}

	return projects;
}

/** The workspace packages a project's package.json declares, in any dependency field. */
function declaredDependencies(project, projectsByName) {
	const names = new Set();

	for (const field of DEPENDENCY_FIELDS) {
		for (const name of Object.keys(project.manifest[field] ?? {})) {
			if (projectsByName.has(name)) names.add(name);
		}
	}

	return names;
}

/**
 * The workspace packages a project's tsconfig references.
 *
 * A reference path may name either the project directory or its tsconfig file;
 * both normalise to the directory, which is what identifies the project.
 */
function referencedProjects(project, projectsByPath) {
	const referenced = new Set();
	const unknown = [];

	for (const reference of project.tsconfig.references ?? []) {
		const resolved = join(workspaceRoot, project.path, reference.path);
		const directory = resolved.endsWith('.json') ? dirname(resolved) : resolved;
		const relativePath = directory
			.slice(workspaceRoot.length + 1)
			.split(/[\\/]/)
			.join('/');

		const target = projectsByPath.get(relativePath);
		if (target) referenced.add(target.name);
		else unknown.push(reference.path);
	}

	return { referenced, unknown };
}

/**
 * The root `tsconfig.json` is a third copy of the graph, and the only one no
 * command reads: a solution file whose `references` are the whole of what
 * `tsc -b` at the workspace root builds. Nothing extends it, no script runs it,
 * so an incomplete one is invisible — a root build exits 0 having compiled a
 * smaller workspace than the person running it believes. It named 8 of 12
 * projects for months and reached 10, because `apps/web` pulls `sync` and
 * `ui-web` in transitively. `apps/admin` and `apps/preview` are leaves, so
 * nothing ever pulled them in and nothing ever compiled them. That is #178.
 *
 * The project list comes from `readProjects`, the same source the per-project
 * half uses. A second hand-maintained copy of the project set would recreate
 * the fault.
 */
function rootSolutionFailures(projects, projectsByPath) {
	const root = { path: '.', tsconfig: readJsonc(join(workspaceRoot, 'tsconfig.json')) };
	const { referenced, unknown } = referencedProjects(root, projectsByPath);

	return [
		...unknown.map((reference) => ({
			name: 'tsconfig.json',
			detail: `references "${reference}", which is not a workspace project.`,
			fix: 'Point it at a project directory, or drop the entry from tsconfig.json.',
		})),
		...projects
			.filter((project) => !referenced.has(project.name))
			.map((project) => ({
				name: 'tsconfig.json',
				detail: `does not reference ${project.name}, so a root build never compiles it.`,
				fix: `Add { "path": "./${project.path}" } to "references" in tsconfig.json.`,
			})),
	];
}

/** `../db`, `../../packages/design-tokens` — the path as a tsconfig would write it. */
function referencePathBetween(from, to) {
	const fromParts = from.path.split('/');
	const toParts = to.path.split('/');

	let shared = 0;
	while (shared < fromParts.length - 1 && fromParts[shared] === toParts[shared]) shared++;

	return `${'../'.repeat(fromParts.length - shared)}${toParts.slice(shared).join('/')}`;
}

const projects = readProjects();
const projectsByName = new Map(projects.map((project) => [project.name, project]));
const projectsByPath = new Map(projects.map((project) => [project.path, project]));

const failures = [];

for (const project of projects) {
	const dependencies = declaredDependencies(project, projectsByName);
	const { referenced, unknown } = referencedProjects(project, projectsByPath);

	for (const path of unknown) {
		failures.push({
			name: project.name,
			detail: `references "${path}", which is not a workspace project.`,
			fix: `Point it at a project directory, or drop the entry from ${project.path}/tsconfig.json.`,
		});
	}

	for (const name of dependencies) {
		if (referenced.has(name)) continue;
		const target = projectsByName.get(name);
		failures.push({
			name: project.name,
			detail: `depends on ${name} but does not reference it.`,
			fix: `Add { "path": "${referencePathBetween(project, target)}" } to "references" in ${project.path}/tsconfig.json.`,
		});
	}

	for (const name of referenced) {
		if (dependencies.has(name)) continue;
		failures.push({
			name: project.name,
			detail: `references ${name} but does not depend on it.`,
			fix: `Add "${name}": "workspace:*" to ${project.path}/package.json, or drop the reference.`,
		});
	}
}

const sections = [
	{
		failures,
		heading: 'The package.json and tsconfig build graphs disagree',
		because: 'Nx orders from the first; every deploy orders from the second.',
	},
	{
		failures: rootSolutionFailures(projects, projectsByPath),
		heading: 'The root solution and the workspace disagree',
		because: '`tsc -b` at the root builds what the solution names and nothing else.',
	},
];

let failed = false;

for (const section of sections) {
	if (section.failures.length === 0) continue;
	failed = true;

	const count = section.failures.length;
	console.error(`${section.heading} in ${count} place${count === 1 ? '' : 's'}.`);
	console.error(`${section.because}\n`);

	for (const failure of section.failures) {
		console.error(`  ${failure.name} ${failure.detail}`);
		console.error(`    ${failure.fix}\n`);
	}
}

if (failed) process.exit(1);

console.log(`Build graphs agree across ${projects.length} projects.`);
console.log(`The root solution names all ${projects.length}.`);
