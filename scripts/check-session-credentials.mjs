#!/usr/bin/env node
/**
 * Refuses a hand-written credential on a request, so that how a request
 * authenticates is the installed transport's answer and nothing else's.
 *
 * Since #614 the credential belongs to the host rather than to
 * `packages/sync`: a browser holds the sealed session in a cookie, `apps/mobile`
 * holds it in the device keystore (ADR 0016), and an app installs one transport
 * at module scope with `setSessionFetcher`. Every shape stream and every command
 * write goes out through what it installed.
 *
 * A call site that writes `credentials: 'include'` into its own `init` is
 * therefore saying nothing true. Under `cookieFetch` it is inert, because that
 * transport spreads the literal over whatever `init` carried. Under a token
 * transport it is wrong, because a device holding a bearer has no cookie to
 * include. #695 swept thirty of them out of `apps/web` and `apps/admin` and put
 * the rule in `sessionFetch`'s docblock, where it was convention only: the next
 * call site could write the literal back with every gate green, which is how the
 * thirty accumulated.
 *
 * Run it with `pnpm check:session-credentials`.
 *
 * ## Where this sits among its neighbours
 *
 * Three layers, and each catches what the others cannot.
 *
 * `sessionFetch` throws rather than falling back, so an app whose installer has
 * not run is refused at the send. That is a fact about the entry graph at
 * runtime and no static gate can see it.
 *
 * `pnpm check:session-fetcher` refuses an app that imports the collection barrel
 * and calls the installer nowhere (#694). That is a whole app with no answer.
 *
 * This is the third: an app that installs a transport correctly, and one call
 * site inside it answering the question a second time. Nothing refused that
 * (#759).
 *
 * ## What counts as a hand-written credential
 *
 * A `credentials` property in code whose value is a `RequestCredentials` member
 * written as a string literal: `include`, `omit` or `same-origin`.
 *
 * The property name is read off the masked copy, so a `credentials:` inside a
 * docblock or a string is prose rather than code. The value is read off the raw
 * source, because masking blanks a string body and the value is a string. That
 * is the same split `check:session-fetcher` makes for the opposite reason, and
 * the same one `check:image-names` makes to read an attribute's literal.
 *
 * A literal is the whole of what this reads, and two things follow from that.
 *
 * `credentials: true` in `apps/server/src/cors-options.ts` is out, and stays out
 * on purpose. That is a server telling a browser which responses may be read
 * with a credential attached, a boolean on a response policy rather than a
 * `RequestCredentials` on a request. Refusing it would refuse CORS.
 *
 * A value that is not a literal is out too, which covers both the shape worth
 * keeping and the one evasion left open. `credentials: init?.credentials` passes
 * a caller's own choice through and is what a wrapper does. `credentials:
 * INCLUDE` behind a constant would pass this gate, and so would one behind a
 * spread, both being unreadable off the source in the way `check:image-names`
 * describes for a computed `role`. The rule this enforces is against a literal
 * restated at a call site, which is the shape all thirty took.
 *
 * ## The corpus, and why the suites are out
 *
 * Every `.ts` and `.tsx` under `apps/<app>/src` and `packages/<package>/src`,
 * tests aside.
 *
 * Tests are out for `check:image-names`' reason rather than
 * `check:map-palette`'s. The suite covering the transports,
 * `packages/auth/src/tests/unit/client-fetch.test.ts`, asserts twice that a
 * request went out with `credentials: 'include'`. That is the test proving the
 * transport carries the credential, so a gate reading the suites would refuse
 * the test that proves the rule holds. A suite makes no request either: it stubs
 * `fetch` and reads what it was handed.
 *
 * Nothing hides behind that. A suite asserting a call site's own credential is
 * #475's shape, a test locking in the drift, and the call site it asserts over
 * is in this corpus: fix the call site and the suite fails with it.
 *
 * ## The marker, and the modules that take none
 *
 * A credential that is right carries a comment on the line above:
 *
 *     // session-credential-ignore: one sentence ending in a full stop.
 *
 * The word is this gate's own, a fifth marker vocabulary rather than a reuse of
 * `hex-color-ignore`, `copy-dash-ignore`, `vocabulary-ignore` or `prose-ignore`.
 * Sharing one would make this gate's stale-marker failure fire on another gate's
 * exemption. The two rules on a marker are `style-gate.mjs`'s: the reason ends
 * in a full stop, because #291's wrapped `biome-ignore` is the trap, and a
 * marker that exempts nothing fails, because an unused allowance is headroom the
 * next violation lands inside.
 *
 * Three markers stand, and they are the two places the rule was always written
 * around.
 *
 * `packages/auth/src/browser.ts` holds `cookieFetch` and `authFetch`. Those are
 * the transports an app installs, not callers of one, and the literal is the
 * whole of what `cookieFetch` does.
 *
 * `apps/web/src/components/map/use-mapbox-map.ts` hands Mapbox GL a
 * `transformRequest`. Mapbox's tile worker fetches the authenticated MVT tiles
 * itself and never reaches `sessionFetch`, and it defaults a cross-origin
 * request to `same-origin` credentials, so without the literal every tile 401s.
 *
 * **A marker in a module that calls `sessionFetch` is refused.** Those are the
 * call sites #695 swept, and a request through `sessionFetch` already carries
 * whatever the host installed, so a credential beside one is inert or wrong with
 * no third case. Calling it is what makes a module one: the name is read off the
 * masked copy, so the docblock in `browser.ts` that mentions `sessionFetch` in
 * prose leaves that file markable, and `use-mapbox-map.ts` names it nowhere.
 *
 * ## The floors
 *
 * #591's rule three times, because this gate has three ways to pass over
 * nothing and each prints the summary line a clean run does.
 *
 * `MINIMUM_FILES` is the walk. `MINIMUM_CREDENTIALS` is the scan inside it: a
 * regression in the property match or the value match leaves the files found and
 * reads no credentials out of them. `MINIMUM_SEND_SITES` is the scan that
 * decides which modules take no marker, which would otherwise fail open and let
 * a marker stand on a swept call site.
 *
 * `MINIMUM_CREDENTIALS` is checked before the report rather than after it, which
 * is the opposite of where `check:map-palette` puts its third floor. The reason
 * is that a broken scan here does not report zero: it reports three markers
 * exempting nothing, and sends a reader to fix the markers when the scan is what
 * broke. So the floor goes first and names the scan.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskedSource } from './lib/masked-source.mjs';
import { pathFrom } from './lib/relative-path.mjs';
import { sourceFiles } from './lib/source-files.mjs';
import { lineOf } from './lib/source-position.mjs';
import {
	count,
	failure,
	markersAcross,
	markersIn,
	readMarker,
	report,
	trim,
} from './lib/style-gate.mjs';

const GATE = 'check-session-credentials';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/**
 * A `credentials` property, found in code so that the word in a docblock or a
 * string is not one.
 */
const CREDENTIALS_PROPERTY = /\bcredentials\s*:/g;

/**
 * The value it was given, when that value is a `RequestCredentials` member
 * written out.
 *
 * Anchored at the property's colon and read off the raw source. All three
 * members, not `include` alone: `omit` and `same-origin` are the same claim
 * about how a request authenticates, made in the other direction, and a call
 * site is no better placed to make either.
 */
const CREDENTIAL_LITERAL = /^\s*(['"])(include|omit|same-origin)\1/;

/** The function whose callers may never write one, whatever a marker says. */
const SEND = 'sessionFetch';

/** That name in code, which is what makes a module a call site rather than prose. */
const SEND_CALL = new RegExp(`\\b${SEND}\\b`);

/** The word that opens a marker, and the token the sweep for a stale one looks for. */
const MARKER_WORD = 'session-credential-ignore';

/**
 * The floors, all three #591's.
 *
 * 1200 modules against a walk that has stopped finding the workspace, under the
 * 1325 `.ts` and `.tsx` modules outside the tests trees today.
 *
 * 3 credentials against a scan that has stopped reading them, which is exactly
 * what stands: the two transports in `packages/auth/src/browser.ts` and the
 * Mapbox `transformRequest`. Exact rather than slack, because this gate is at
 * zero findings and every credential in the corpus is one a marker names, so a
 * fourth is a failing branch and a third going away is a deliberate edit.
 *
 * 25 call sites against the scan behind the no-marker rule, under the 30
 * shipping modules that call `sessionFetch`. A tripwire rather than a
 * ratchet: it is here so that a broken name scan cannot quietly let a marker
 * stand on a swept call site, and the four modules of headroom are what keep an
 * ordinary refactor off it.
 */
const MINIMUM_FILES = 1200;
const MINIMUM_CREDENTIALS = 3;
const MINIMUM_SEND_SITES = 25;

function main() {
	const files = [...sourceFiles(workspaceRoot)].map(readFile);
	assertItReadTheWorkspace(files);

	report(files, { unmarked: unmarkedMessage, stale: staleMessage }, () => announce(files));
}

/** That the walk reached the workspace and the scan read the credentials in it. */
function assertItReadTheWorkspace(files) {
	if (files.length < MINIMUM_FILES) {
		fail(
			`read ${count(files.length, 'module')} under apps/ and packages/, fewer than the ${MINIMUM_FILES} this expects. The walk has stopped finding the workspace, so a hand-written credential in it now passes this. Fix the walk in scripts/check-session-credentials.mjs, or lower MINIMUM_FILES if that many modules were genuinely deleted.`,
		);
	}

	const credentials = files.reduce((total, file) => total + file.findings.length, 0);
	if (credentials < MINIMUM_CREDENTIALS) {
		fail(
			`read ${count(credentials, 'credential')} across ${files.length} modules, fewer than the ${MINIMUM_CREDENTIALS} this expects. The modules are being found and the credentials in them are not, so this run would report every standing marker as exempting nothing and send a reader to the markers rather than to the scan. Fix CREDENTIALS_PROPERTY or CREDENTIAL_LITERAL in scripts/check-session-credentials.mjs, or lower MINIMUM_CREDENTIALS if a credential was genuinely deleted.`,
		);
	}
}

// ---------------------------------------------------------------------------
// The credentials
// ---------------------------------------------------------------------------

/** One file as its findings, its markers, and the fact the last floor counts. */
function readFile(file) {
	const source = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
	const where = pathFrom(workspaceRoot, file);
	const lines = source.split('\n');
	const masked = maskedSource(source);
	const sends = SEND_CALL.test(masked);

	return {
		where,
		lines,
		sends,
		findings: findingsIn(source, masked, where),
		markers: markersOf(lines, masked.split('\n'), where, sends),
	};
}

/**
 * Every hand-written credential in one file.
 *
 * The property comes off the masked copy and the value off the source at the
 * same offset, which is what lets one scan read a comment as prose and a string
 * as a value.
 */
const findingsIn = (source, masked, where) =>
	[...masked.matchAll(CREDENTIALS_PROPERTY)].flatMap((match) => {
		const value = valueAt(source, match.index + match[0].length);
		return value === null ? [] : [{ where, line: lineOf(source, match.index), value }];
	});

/** The member a property was given, or `null` when it was given anything else. */
function valueAt(source, from) {
	const literal = source.slice(from, from + 40).match(CREDENTIAL_LITERAL);
	return literal === null ? null : literal[2];
}

// ---------------------------------------------------------------------------
// The markers
// ---------------------------------------------------------------------------

/** Every marker in one file, well formed or not, and the line each one is above. */
const markersOf = (lines, masked, where, sends) =>
	markersIn(lines, MARKER_WORD, readerFor(sends, lines, masked)).map((marker) => ({
		where,
		...marker,
	}));

/**
 * How one file's markers are read.
 *
 * A module that calls `sessionFetch` takes none, so nothing written there is
 * parsed as one: the word itself is the problem, and reporting it as malformed
 * would send somebody to fix a reason that was never going to be read.
 */
const readerFor = (sends, lines, masked) =>
	sends
		? () => ({ problem: `it is in a module that calls ${SEND}, which takes no exemption` })
		: (at) => readMarker(MARKER_WORD, lines[at], masked[at]);

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const unmarkedMessage = (finding, lines) =>
	`${GATE}: ${finding.where}:${finding.line} writes credentials: '${finding.value}'.\n\n` +
	`    ${trim(lines[finding.line - 1].trim())}\n\n` +
	'How a request authenticates is the transport an app installed with setSessionFetcher,\n' +
	'and a call site restating it is inert under cookieFetch and wrong under a token host:\n' +
	'a device holding a bearer has no cookie to include. Drop the property and let the\n' +
	'installed transport carry the session. A request that genuinely does not go through\n' +
	`${SEND}, a fetch Mapbox GL makes for itself, takes a marker on the line above:\n` +
	`// ${MARKER_WORD}: one sentence ending in a full stop.`;

const staleMessage = (marker) =>
	marker.problem === undefined
		? `${GATE}: ${marker.where}:${marker.line} marks line ${marker.target} and exempts nothing.\n\nNothing on that line writes a credential this gate reads. Either the credential was dropped and the marker outlived it, or the marker is not the line above the one it means. A reason wrapped onto a second line does the second of those.`
		: `${GATE}: ${marker.where}:${marker.line} is not a marker, because ${marker.problem}.`;

/**
 * The summary line, and the last floor.
 *
 * This one runs only on a clean pass. It guards the scan behind the no-marker
 * rule rather than the rule itself, so a report has nothing to say about it, and
 * a refusal here over a run that already found something would bury the finding.
 */
function announce(files) {
	const sites = files.filter((file) => file.sends).length;

	if (sites < MINIMUM_SEND_SITES) {
		fail(
			`${count(sites, 'module')} of ${files.length} call ${SEND}, fewer than the ${MINIMUM_SEND_SITES} this expects. The modules are being found and the calls in them are not, so a marker on one of the call sites #695 swept would now be honoured rather than refused.`,
		);
	}

	console.log(
		`${GATE}: ${count(files.length, 'module')} under apps/ and packages/, ${sites} of them calling ${SEND}, no hand-written credentials, ${count(markersAcross(files), 'line')} exempted by a marker.`,
	);
}

main();
