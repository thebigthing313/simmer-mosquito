#!/usr/bin/env node
/**
 * Requires every app that reads or writes through `packages/sync` to install
 * the transport those requests go out on.
 *
 * Since #614 the credential is the host's rather than the package's: an app
 * calls `setSessionFetcher` once at module scope, and every shape stream and
 * every command write is sent through what it installed. Nothing said so. Both
 * shipping apps install `cookieFetch` beside their recovery, and an app that
 * did not would have been answered by the fallback to bare `fetch`, which omits
 * the cookie cross-origin: every read and every write refused, and a workspace
 * that draws as empty rather than as broken (#694).
 *
 * Two halves close that, and they catch different things.
 *
 * `sessionFetch` now throws rather than falling back, so an installer that
 * exists and has not run before the first request fails at that request with
 * the missing call named. No static gate can see that, because whether a module
 * has loaded is a fact about the entry graph at runtime.
 *
 * This is the other half: an app with no installer anywhere. That one is
 * readable off the source, and reading it here means it fails on the branch
 * that writes it rather than on the first screen somebody opens.
 *
 * ## What counts as an app that needs one
 *
 * An app importing the collection barrel, `@simmer-mosquito/sync`. That is what
 * carries `sessionFetch`, the 54 collection factories and the write path, so an
 * app naming it makes requests. `@simmer-mosquito/sync/contract` is deliberately
 * not a trigger: it is shape paths, command paths and row schemas, all of it
 * data, and `apps/server` reads it from Node where there is no session cookie
 * to carry.
 *
 * The import specifier is read off the raw source rather than the masked copy,
 * because masking blanks a string body and the specifier is a string. The call
 * is read off the masked copy, so a docblock naming `setSessionFetcher` is
 * prose rather than an install.
 *
 * ## Exactly one, and not `null`
 *
 * One, because the module holds one fetcher and a second call is the last one
 * winning with nothing at either site saying which. `setSessionFetcher(null)` is
 * the uninstall a suite ends on, so it is not counted as an install; an app
 * whose only call is that one has none.
 *
 * Test trees are out of the scan on both sides. A suite installs its own mock,
 * often several, and counting those would answer yes for an app whose shipping
 * source installs nothing.
 *
 * Run it with `pnpm check:session-fetcher`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskedSource } from './lib/masked-source.mjs';
import { pathFrom } from './lib/relative-path.mjs';
import { isDirectory, typeScriptFilesUnder } from './lib/source-files.mjs';
import { lineOf } from './lib/source-position.mjs';
import { count, failure } from './lib/style-gate.mjs';

const GATE = 'check-session-fetcher';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/** The barrel an app that makes requests imports. */
const SYNC_BARREL = '@simmer-mosquito/sync';

/**
 * An import of it, static or dynamic.
 *
 * Both forms, because a route module reaching the collections through
 * `import('@simmer-mosquito/sync')` makes the same requests as one naming it in
 * a `from` clause. Not the bare specifier, which `apps/server` writes in a
 * watch list its dev server reads, and which would make a Node process with no
 * cookie to carry look like an app owing a transport.
 */
const SYNC_IMPORT = /(?:from\s+|import\s*\(\s*)'@simmer-mosquito\/sync'/;

/** The call that installs one, with whatever it was passed. */
const INSTALL_CALL = /\bsetSessionFetcher\s*\(\s*([A-Za-z0-9_$.]*)/g;

/**
 * The floors under the scan, both of them #591's rule: a walk that has stopped
 * finding what it reads must fail rather than report a clean zero.
 *
 * Five apps, because `apps/` holds `web`, `admin`, `server`, `mobile` and
 * `preview` and each has a `src`. Two consumers, because `web` and `admin`
 * import the barrel and the other three do not. Without the second number a
 * broken import scan reads as five apps that need no transport, which is what
 * a green run looks like.
 */
const MINIMUM_APPS = 5;
const MINIMUM_CONSUMERS = 2;

function main() {
	const apps = appsWithSource();
	if (apps.length < MINIMUM_APPS) {
		fail(
			`found ${count(apps.length, 'app')} under apps/, fewer than the ${MINIMUM_APPS} this expects. The walk has stopped finding the app roots, so an app installing no session fetcher now passes this. Fix the walk in scripts/check-session-fetcher.mjs, or lower MINIMUM_APPS if that many apps were genuinely deleted.`,
		);
	}

	const scanned = apps.map(scanApp);
	const consumers = scanned.filter((app) => app.consumer);
	const findings = consumers.flatMap(problemsWith);

	if (findings.length > 0) {
		report(findings);
		return;
	}

	// Only on a clean run. A report has already proved the scan reads the tree,
	// and this floor would bury it under a refusal.
	if (consumers.length < MINIMUM_CONSUMERS) {
		fail(
			`${count(consumers.length, 'app')} of ${apps.length} import the ${SYNC_BARREL} barrel, fewer than the ${MINIMUM_CONSUMERS} this expects. The apps are being found and their imports are not, so this run's clean zero is the scan failing rather than every app installing a transport.`,
		);
	}

	console.log(
		`Session fetcher: ${apps.length} apps, ${consumers.length} reading the sync barrel, each installing one transport.`,
	);
}

/** Every `apps/<name>/src` on disk. */
function appsWithSource() {
	return readdirSync(join(workspaceRoot, 'apps'))
		.map((name) => ({ name, src: join(workspaceRoot, 'apps', name, 'src') }))
		.filter((app) => isDirectory(app.src));
}

/** Whether one app reaches the barrel, and where it installs a transport. */
function scanApp(app) {
	const modules = [...typeScriptFilesUnder(app.src)].map((file) => ({
		file,
		source: readFileSync(file, 'utf8'),
	}));

	return {
		...app,
		consumer: modules.some(({ source }) => SYNC_IMPORT.test(source)),
		installs: modules.flatMap(installsIn),
	};
}

/** Where one module installs a transport, as `path:line`, uninstalls aside. */
function installsIn({ file, source }) {
	return [...maskedSource(source).matchAll(INSTALL_CALL)]
		.filter((match) => match[1] !== 'null')
		.map((match) => `${pathFrom(workspaceRoot, file)}:${lineOf(source, match.index)}`);
}

/** What is wrong with one consuming app's installs, if anything. */
function problemsWith(app) {
	if (app.installs.length === 0) {
		return [
			`apps/${app.name} imports the sync barrel and calls setSessionFetcher nowhere. Every request it makes would be refused at the send, because there is no credential this package can carry without one. Install a transport at module scope beside the session recovery: cookieFetch from @simmer-mosquito/auth/browser for a browser app, or the fetch member of the token client for a device holding the session in a keystore.`,
		];
	}

	if (app.installs.length > 1) {
		return [
			`apps/${app.name} installs ${count(app.installs.length, 'session fetcher')}, and the module holds one: ${app.installs.join(', ')}. Whichever runs last is what every request goes out on, with nothing at either site saying which. Keep the one the app means.`,
		];
	}

	return [];
}

function report(findings) {
	console.error(`${GATE}: ${count(findings.length, 'app')} with no one answer to how it sends.\n`);
	for (const finding of findings) {
		console.error(`  - ${finding}\n`);
	}
	process.exitCode = 1;
}

main();
