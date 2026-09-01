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
 * Run this on the branch that promotes `develop` into `staging`, which is where
 * the release is cut. See docs/releases.md.
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
 * Where already-numbered version numbers are read from, to tell "this branch has
 * not been versioned yet" from "it has, and this is a re-run".
 *
 * Two branches carry a number, not one. The cut happens on the `develop` to
 * `staging` PR, so `staging` holds a release candidate that has been numbered
 * and has not shipped, while `main` holds what production is actually on. Read
 * only `main` and a second cut into `staging` before the first one promotes
 * would see its own candidate's number as untouched and hand an app with no
 * changeset the version the previous candidate already answers to.
 *
 * Each entry is the same ref twice, remote first: a local `main` or `staging`
 * can sit behind the branch it is about to receive.
 */
const NUMBERED_REFS = [
	['origin/main', 'main'],
	['origin/staging', 'staging'],
];

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

/** A changeset's leading `---` block, which is the only part of it read here. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

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

/** Every `NUMBERED_REFS` branch this clone actually has, resolved to one ref each. */
function numberedRefs() {
	const resolved = [];

	for (const candidates of NUMBERED_REFS) {
		for (const ref of candidates) {
			try {
				git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
				resolved.push(ref);
				break;
			} catch {
				// Not in this clone — try the next spelling of the same branch.
			}
		}
	}

	return resolved;
}

/** `-1`, `0` or `1`, comparing two `x.y.z` strings field by field. */
function compareVersions(left, right) {
	const a = left.split('.').map(Number);
	const b = right.split('.').map(Number);

	for (let index = 0; index < 3; index += 1) {
		if (a[index] !== b[index]) {
			return a[index] < b[index] ? -1 : 1;
		}
	}

	return 0;
}

/** The highest version `refs` carries for one app, or `null` if it carries none. */
function highestVersionAt(directory, refs) {
	let highest = null;

	for (const ref of refs) {
		const version = versionAt(directory, ref);
		if (highest === null || compareVersions(version, highest) > 0) {
			highest = version;
		}
	}

	return highest;
}

/** The packages one changeset names, whatever bump each asks for. */
function packagesNamedBy(path) {
	const frontmatter = FRONTMATTER.exec(readFileSync(path, 'utf8'));
	if (frontmatter === null) {
		return [];
	}

	return frontmatter[1]
		.split('\n')
		.map((line) => RELEASE_DECLARATION.exec(line)?.[1])
		.filter((name) => name !== undefined);
}

/** Every package the pending changesets name, across all of them. */
function packagesWithPendingBumps() {
	const pending = readdirSync(CHANGESET_DIR).filter(
		(entry) => entry.endsWith('.md') && entry !== 'README.md',
	);

	return new Set(pending.flatMap((entry) => packagesNamedBy(join(CHANGESET_DIR, entry))));
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
	const refs = numberedRefs();
	if (refs.length === 0) {
		console.warn('No `main` or `staging` in this clone; bumping every app that has no changeset.');
	}

	for (const ref of refs) {
		// Nothing new against a branch that already carries a number, so there is
		// no new build to name. Checked per ref rather than against the highest
		// one: a hotfix branched from `main` while a candidate soaks on `staging`
		// is behind `staging` by design, and it is `main` that says whether it
		// holds anything yet.
		if (git(['rev-list', '--count', `${ref}..HEAD`]) === '0') {
			console.log(`Nothing new since ${ref}; no versions to bump.`);
			return [];
		}
	}

	const pending = packagesWithPendingBumps();

	return APPS.filter((app) => {
		if (pending.has(app.name)) {
			return false;
		}

		const numbered = highestVersionAt(app.directory, refs);

		if (numbered !== null && compareVersions(versionAt(app.directory, null), numbered) > 0) {
			console.log(`${app.name} is already bumped past ${numbered}; leaving it alone.`);
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
