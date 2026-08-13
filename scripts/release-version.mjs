#!/usr/bin/env node
/**
 * Cuts a release: bumps both apps' versions, consumes every pending changeset
 * into their CHANGELOG.md files, and stamps the new heading with today's date.
 *
 * Two things this adds on top of `changeset version`:
 *
 * **The floor bump.** A version number answers "which build are you on", so it
 * has to move for every build an agency can be on — a refactor that ships is a
 * new build even though it belongs in no changelog. Changesets can only bump
 * what a changeset names, and changesets are user-visible copy, so an app with
 * nothing pending gets a synthetic `patch` with an empty summary written for it
 * here. The version moves, the changelog page draws the release as a
 * maintenance one, and nobody has to remember anything at the time of the PR.
 *
 * **The date stamp.** Changesets writes a bare `## 0.2.0` heading and has no
 * hook for the date, but a product changelog without dates cannot answer "is
 * this the build we got last Tuesday" — which is most of what an agency asks
 * it. Only headings that do not already carry a date are stamped.
 *
 * Both halves are safe to re-run. The floor bump is skipped once an app's
 * version has already moved past the released one, so a second run on the same
 * promotion branch consumes newly-merged changesets without inventing another
 * patch; the stamp never rewrites released history.
 *
 * Run this on the promotion branch, when main is about to ship. See
 * docs/releases.md.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The only versioned packages; every other one is in `.changeset/config.json`'s `ignore`. */
const APPS = [
	{ name: '@simmer-mosquito/web', directory: 'apps/web' },
	{ name: '@simmer-mosquito/admin', directory: 'apps/admin' },
];

/**
 * Where the last release's version numbers are read from, to tell "this branch
 * has not been versioned yet" from "it has, and this is a re-run". `main` is
 * production; the remote copy is preferred because a local `main` can sit
 * behind the branch it is about to receive.
 */
const RELEASED_REFS = ['origin/main', 'main'];

const CHANGESET_DIR = join(workspaceRoot, '.changeset');
const FLOOR_CHANGESET = join(CHANGESET_DIR, 'maintenance-release.md');

/**
 * `## 0.2.0` — but not `## 0.2.0 — 2026-08-10`, which is already stamped.
 *
 * The trailing class is `[ \t]` and not `\s`: `\s` matches newlines, so under
 * `/m` it ran past the end of the heading and swallowed the blank line that
 * separates it from the section below.
 */
const UNDATED_HEADING = /^## (\d+\.\d+\.\d+)[ \t]*$/gm;

/** A frontmatter line: `'@simmer-mosquito/web': minor`, quoted or not. */
const RELEASE_DECLARATION = /^\s*['"]?(@[^'":\s]+)['"]?\s*:\s*(major|minor|patch)\s*$/;

function git(args) {
	return execFileSync('git', args, { cwd: workspaceRoot, encoding: 'utf8' }).trim();
}

function today() {
	const now = new Date();
	const pad = (value) => String(value).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function versionAt(directory, ref) {
	const path = `${directory}/package.json`;
	const contents =
		ref === null
			? readFileSync(join(workspaceRoot, path), 'utf8')
			: git(['show', `${ref}:${path}`]);
	return JSON.parse(contents).version;
}

/** The first of `RELEASED_REFS` this clone actually has, or `null` if it has neither. */
function releasedRef() {
	for (const ref of RELEASED_REFS) {
		try {
			git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
			return ref;
		} catch {
			// Not in this clone — try the next one.
		}
	}

	return null;
}

/** Every package named by a pending changeset, whatever bump it asks for. */
function packagesWithPendingBumps() {
	const named = new Set();

	for (const entry of readdirSync(CHANGESET_DIR)) {
		if (!entry.endsWith('.md') || entry === 'README.md') {
			continue;
		}

		const contents = readFileSync(join(CHANGESET_DIR, entry), 'utf8');
		const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contents);
		if (frontmatter === null) {
			continue;
		}

		for (const line of frontmatter[1].split('\n')) {
			const declaration = RELEASE_DECLARATION.exec(line);
			if (declaration !== null) {
				named.add(declaration[1]);
			}
		}
	}

	return named;
}

/**
 * Writes the synthetic changeset that bumps whatever the pending ones do not.
 *
 * The summary is empty on purpose: this release has nothing to tell a user, and
 * a placeholder line ("maintenance", "internal changes") would be a changelog
 * entry nobody wrote. `.changeset/changelog-simmer.mjs` emits no bullet for it,
 * so the release lands in CHANGELOG.md with a heading and no entries, which is
 * what the page draws as a maintenance release.
 */
function writeFloorChangeset(apps) {
	const declarations = apps.map((app) => `'${app.name}': patch`);
	writeFileSync(FLOOR_CHANGESET, `---\n${declarations.join('\n')}\n---\n`);
}

function stampDates(relativePath, date) {
	const path = join(workspaceRoot, relativePath);

	let contents;
	try {
		contents = readFileSync(path, 'utf8');
	} catch (error) {
		// An app with no released changes yet has no changelog. Nothing to stamp.
		if (error.code === 'ENOENT') {
			return 0;
		}
		throw error;
	}

	let stamped = 0;
	const next = contents.replace(UNDATED_HEADING, (_match, version) => {
		stamped += 1;
		return `## ${version} — ${date}`;
	});

	if (stamped > 0) {
		writeFileSync(path, next);
	}

	return stamped;
}

/**
 * The apps that need a synthetic bump: no changeset names them, and their
 * version still matches what production is on.
 */
function appsNeedingFloor() {
	const ref = releasedRef();
	if (ref === null) {
		console.warn('No `main` in this clone; bumping every app that has no changeset.');
	} else if (git(['rev-list', '--count', `${ref}..HEAD`]) === '0') {
		// Nothing has shipped since the last release, so there is no new build to
		// name. Guards against a stray run on an already-released branch.
		console.log(`Nothing new since ${ref}; no versions to bump.`);
		return [];
	}

	const pending = packagesWithPendingBumps();

	return APPS.filter((app) => {
		if (pending.has(app.name)) {
			return false;
		}

		if (ref !== null && versionAt(app.directory, null) !== versionAt(app.directory, ref)) {
			console.log(`${app.name} is already bumped past ${ref}; leaving it alone.`);
			return false;
		}

		return true;
	});
}

const floored = appsNeedingFloor();
if (floored.length > 0) {
	writeFloorChangeset(floored);
	console.log(`Maintenance bump for ${floored.map((app) => app.name).join(', ')}.`);
}

execFileSync('pnpm', ['exec', 'changeset', 'version'], {
	cwd: workspaceRoot,
	stdio: 'inherit',
	shell: process.platform === 'win32',
});

const date = today();
for (const app of APPS) {
	const relativePath = `${app.directory}/CHANGELOG.md`;
	const stamped = stampDates(relativePath, date);
	if (stamped > 0) {
		console.log(`Dated ${stamped} release heading(s) in ${relativePath} as ${date}.`);
	}
}
