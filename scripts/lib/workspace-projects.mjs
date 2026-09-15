/**
 * Which directories are workspace projects, and how to read a tsconfig.
 *
 * Both answers came out of `check-build-graph.mjs`, which has read
 * `pnpm-workspace.yaml` since #665 and parsed tsconfigs since #175. The second
 * reader is `clean-build-info.mjs`, which deletes the build info each project
 * declares, and it has to find the same projects and read the same files. A
 * copy of either would be a second answer to "what is a project here", which is
 * the register this family of scripts keeps collapsing.
 *
 * There is no floor in this module. The two readers ask different questions of
 * the list, so each carries its own: the gate fails on a graph disagreement and
 * counts projects in its summary, and the cleaner refuses a run that found
 * fewer projects than the workspace has.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Strips the two things a tsconfig may contain and `JSON.parse` will not take:
 * comments, and a trailing comma before a closing brace or bracket.
 *
 * Half the tsconfigs here carry comments — `packages/mapping` explains its `DOM`
 * lib in a block comment, `packages/sync` explains the reference that keeps the
 * deploy building in order — and TypeScript 7's package no longer exposes
 * `readConfigFile`, so there is no parser to borrow (see CLAUDE.md).
 *
 * String-aware on purpose: a `//` inside a path value is not a comment, and a
 * quote inside a comment does not open a string.
 *
 * @param {string} text
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

/**
 * One tsconfig or package.json, parsed.
 *
 * @param {string} path
 */
export function readJsonc(path) {
	try {
		return JSON.parse(stripJsonComments(readFileSync(path, 'utf8')));
	} catch (error) {
		throw new Error(`${path} is not readable as JSON: ${error.message}`);
	}
}

/**
 * Every directory a workspace pattern names, read from `pnpm-workspace.yaml`
 * rather than hard-coded, so a third directory alongside `apps` and `packages`
 * cannot leave half the workspace unchecked.
 *
 * @param {string} workspaceRoot
 */
function workspaceProjectPaths(workspaceRoot) {
	const yaml = readFileSync(join(workspaceRoot, 'pnpm-workspace.yaml'), 'utf8');
	const patterns = [];

	for (const line of yaml.split('\n')) {
		const match = /^\s*-\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
		if (match?.[1]) patterns.push(match[1]);
	}

	return patterns.flatMap((pattern) => expandPattern(workspaceRoot, pattern));
}

/**
 * The project paths one pattern names.
 *
 * Two shapes are understood, and they are the two this workspace writes. A
 * `<dir>/*` pattern names a parent, so each of its subdirectories is a
 * candidate. A plain `<dir>` names one project, which is what `scripts` is: one
 * project rather than a parent of many. Anything else is an error rather than a
 * skip, because a pattern this cannot read is a slice of the workspace going
 * unchecked with nothing saying so.
 */
function expandPattern(workspaceRoot, pattern) {
	if (!pattern.includes('*')) return [pattern];

	const match = /^([^*]+)\/\*$/.exec(pattern);
	if (!match?.[1]) {
		throw new Error(
			`pnpm-workspace.yaml declares "${pattern}", which these scripts do not understand. ` +
				'They read `<dir>/*` and plain `<dir>` patterns only — teach them the new shape rather than dropping the pattern.',
		);
	}

	const directory = match[1];
	const parent = join(workspaceRoot, directory);
	if (!existsSync(parent)) return [];

	return readdirSync(parent, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => `${directory}/${entry.name}`);
}

/**
 * Every workspace project that compiles: one with both a package.json and a
 * tsconfig.json, with both files parsed.
 *
 * @param {string} workspaceRoot
 */
export function readProjects(workspaceRoot) {
	const projects = [];

	for (const path of workspaceProjectPaths(workspaceRoot)) {
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

	return projects;
}
