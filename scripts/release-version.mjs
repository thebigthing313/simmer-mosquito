#!/usr/bin/env node
/**
 * Cuts a release: consumes every pending changeset into the two apps'
 * CHANGELOG.md files, bumps their versions, and stamps the new heading with
 * today's date.
 *
 * The date stamp is the one thing this adds on top of `changeset version`.
 * Changesets writes a bare `## 0.2.0` heading and has no hook for the date,
 * but a product changelog without dates cannot answer "is this the build we
 * got last Tuesday" — which is most of what an agency asks it. Only headings
 * that do not already carry a date are stamped, so re-running this is safe and
 * never rewrites released history.
 *
 * Run this on the promotion branch, when main is about to ship. See
 * docs/releases.md.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const CHANGELOGS = ['apps/web/CHANGELOG.md', 'apps/admin/CHANGELOG.md'];

/**
 * `## 0.2.0` — but not `## 0.2.0 — 2026-08-10`, which is already stamped.
 *
 * The trailing class is `[ \t]` and not `\s`: `\s` matches newlines, so under
 * `/m` it ran past the end of the heading and swallowed the blank line that
 * separates it from the section below.
 */
const UNDATED_HEADING = /^## (\d+\.\d+\.\d+)[ \t]*$/gm;

function today() {
	const now = new Date();
	const pad = (value) => String(value).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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

execFileSync('pnpm', ['exec', 'changeset', 'version'], {
	cwd: workspaceRoot,
	stdio: 'inherit',
	shell: process.platform === 'win32',
});

const date = today();
for (const relativePath of CHANGELOGS) {
	const stamped = stampDates(relativePath, date);
	if (stamped > 0) {
		console.log(`Dated ${stamped} release heading(s) in ${relativePath} as ${date}.`);
	}
}
