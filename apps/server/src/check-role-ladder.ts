/**
 * Asserts the role ladder against a running API (#57).
 *
 * The half of the checklist a browser cannot do. If `apps/web` is behaving,
 * every refused control is *hidden* — so clicking proves the UI is right and
 * says nothing about whether the server would have refused. This signs in as
 * each role and asks the endpoints directly.
 *
 * It is a script rather than a vitest suite on purpose: it needs a running
 * server, real WorkOS logins, and the fixtures from
 * `pnpm --filter @simmer-mosquito/db seed:role-ladder`. None of that belongs in
 * a suite that has to pass on a laptop with no network.
 *
 * ## Running it
 *
 * ```sh
 * SIMMER_CHECK_PASSWORD='…' \
 * SIMMER_CHECK_API=http://localhost:3000 \
 *   pnpm --filter @simmer-mosquito/server check:role-ladder
 * ```
 *
 * Re-seed first. A few of the allowed cases write — starting an assignment,
 * editing a comment — and the seed is what puts those back.
 */

import type { SimmerRole } from '@simmer-mosquito/db';

const API = process.env.SIMMER_CHECK_API ?? 'http://localhost:3000';
const PASSWORD = process.env.SIMMER_CHECK_PASSWORD;
const EMAIL_PREFIX = process.env.SIMMER_CHECK_EMAIL_PREFIX ?? 'adriankabigting+simmer-';
const EMAIL_DOMAIN = process.env.SIMMER_CHECK_EMAIL_DOMAIN ?? 'gmail.com';

if (PASSWORD === undefined || PASSWORD.trim() === '') {
	console.error('SIMMER_CHECK_PASSWORD is required.');
	process.exit(1);
}

/** Fixture ids from `packages/db/src/seeds/role-ladder.ts`. */
const FIXTURES = {
	ownAssignment: '00000000-0000-4000-8000-000000002201',
	otherAssignment: '00000000-0000-4000-8000-000000002202',
	unassignedAssignment: '00000000-0000-4000-8000-000000002203',
	mixedAssignment: '00000000-0000-4000-8000-000000002204',
	emptyAssignment: '00000000-0000-4000-8000-000000002205',
	freshComment: '00000000-0000-4000-8000-000000002301',
	expiredComment: '00000000-0000-4000-8000-000000002302',
	otherAuthorComment: '00000000-0000-4000-8000-000000002303',
	ownAction: '00000000-0000-4000-8000-000000002403',
	staleAction: '00000000-0000-4000-8000-000000002404',
	otherAction: '00000000-0000-4000-8000-000000002405',
} as const;

/** One settings route stands in for all seven: they share a floor. */
const SETTINGS_TIMEZONE = '/organization-settings/timezone';

/**
 * The two identity tables on the command surface (ADR 0013, slice 1).
 *
 * The agency's own row is addressed by id, and the script does not know which
 * agency it signed in as. It does not need to: the floor is read before the
 * handler compares the id, so a fresh UUID refuses at the right place for a
 * `deny` and lands on a harmless 400 for an `allow`.
 */
const PROFILES_PATH = '/commands/profiles';
function organizationPath(): string {
	return `/commands/organizations/${uuid()}`;
}

interface Expectation {
	readonly what: string;
	readonly method: 'POST' | 'PATCH' | 'DELETE';
	readonly path: string;
	readonly body?: unknown;
	/** `allow` means "not refused" — a 4xx that is not 403 still passes. */
	readonly expect: 'allow' | 'deny';
	/** A fragment the refusal's `reason` must contain, when it should say why. */
	readonly because?: string;
}

/**
 * Cases are grouped by the property they establish, not by endpoint, because
 * that is what makes a failure legible: "a collector reached planning" is a
 * different problem from "a manager reached the owner/admin catalog".
 */
const CHECKS: Readonly<Record<SimmerRole, readonly Expectation[]>> = {
	viewer: [
		deny('add a comment', 'POST', '/field-work/comments', comment(), 'Viewers have read-only'),
		deny('create a tag', 'POST', '/foundation/tags', tag(), 'Viewers have read-only'),
		deny('create a route', 'POST', '/field-work/routes', route(), 'Viewers have read-only'),
		deny('start their own assignment', 'PATCH', assignment(FIXTURES.ownAssignment), started()),
		deny('change a setting', 'PATCH', SETTINGS_TIMEZONE, timezone(), 'owners and admins'),
	],

	collector: [
		// Field entry: the floor they do have.
		allow('add a comment', 'POST', '/field-work/comments', comment()),
		allow('edit their own recent comment', 'PATCH', commentPath(FIXTURES.freshComment), edited()),
		allow(
			'start the assignment assigned to them',
			'PATCH',
			assignment(FIXTURES.ownAssignment),
			started(),
		),
		allow('correct the action they performed', 'PATCH', action(FIXTURES.ownAction), reach()),

		// Planning and catalogs: manager-and-above.
		deny('create a route', 'POST', '/field-work/routes', route()),
		deny('create an assignment', 'POST', '/field-work/assignments', newAssignment()),
		deny('create a tag', 'POST', '/foundation/tags', tag()),
		// Deletes rather than creates for these two: the role check runs *after*
		// the command is built, so a create needs a body complete enough to pass
		// validation — real method and unit ids this script has no way to know. A
		// delete carries no body, so the refusal is the first thing that can
		// happen, which also proves it precedes any database read.
		deny('delete a trap', 'DELETE', `/adult-surveillance/traps/${uuid()}`),
		deny('delete a contact', 'DELETE', `/public-engagement/contacts/${uuid()}`),
		deny('create a collection method', 'POST', '/foundation/collection-methods', lookup()),

		// Ownership: the half a role alone cannot settle.
		deny(
			'start someone else’s assignment',
			'PATCH',
			assignment(FIXTURES.otherAssignment),
			started(),
			'assigned to them',
		),
		deny(
			'start an unassigned assignment',
			'PATCH',
			assignment(FIXTURES.unassignedAssignment),
			started(),
			'assigned to them',
		),
		deny(
			'edit their own expired comment',
			'PATCH',
			commentPath(FIXTURES.expiredComment),
			edited(),
			'30 days',
		),
		deny(
			'edit another author’s comment',
			'PATCH',
			commentPath(FIXTURES.otherAuthorComment),
			edited(),
		),
		deny(
			'correct an action outside the window',
			'PATCH',
			action(FIXTURES.staleAction),
			reach(),
			'30 days',
		),
		deny(
			'correct another performer’s action',
			'PATCH',
			action(FIXTURES.otherAction),
			reach(),
			'performed',
		),

		// Settings have no commands and are checked in middleware before the body
		// is read. People are commands since ADR 0013's first slice, so the refusal
		// comes from `COMMAND_PERMISSIONS` and names the command rather than the
		// surface. Both floors are admin, so a collector is refused by either (#130).
		deny('change a setting', 'PATCH', SETTINGS_TIMEZONE, timezone(), 'owners and admins'),
		deny('add a profile', 'POST', PROFILES_PATH, profile(), 'identity.createProfile'),
	],

	manager: [
		// Everything the collector needed ownership for is theirs outright — the
		// property worth checking is that the ownership read is genuinely skipped
		// rather than passing by luck.
		allow(
			'start someone else’s assignment',
			'PATCH',
			assignment(FIXTURES.otherAssignment),
			started(),
		),
		allow('edit an expired comment', 'PATCH', commentPath(FIXTURES.expiredComment), edited()),
		allow('correct an old action', 'PATCH', action(FIXTURES.staleAction), reach()),
		allow('create a route', 'POST', '/field-work/routes', route()),
		allow('create a tag', 'POST', '/foundation/tags', tag()),

		// The rung that did not exist before #50.
		deny('create a collection method', 'POST', '/foundation/collection-methods', lookup()),
		deny('create a habitat type', 'POST', '/foundation/habitat-types', lookup()),
		deny('delete an insecticide', 'DELETE', `/control-products/insecticides/${uuid()}`),
		deny('change a setting', 'PATCH', SETTINGS_TIMEZONE, timezone(), 'owners and admins'),
		deny(
			'edit the agency’s details',
			'PATCH',
			organizationPath(),
			details(),
			'identity.updateOrganizationDetails',
		),
		deny('add a profile', 'POST', PROFILES_PATH, profile(), 'identity.createProfile'),
	],

	admin: [
		allow('create a collection method', 'POST', '/foundation/collection-methods', lookup()),
		allow('create a habitat type', 'POST', '/foundation/habitat-types', lookup()),

		// Deliberately unwritable: `allow` means "not refused", so a 400 for a body
		// the builder rejects proves the floor let it through. That keeps the check
		// from writing anything, because a real timezone or profile would be a live
		// edit to whichever agency the fixtures point at.
		//
		// The two command routes still carry `intents`, because dispatch reads the
		// intent list before it consults the floor and a body without one answers
		// 400 without ever reaching the check this script is making. The
		// organization id in the path is a fresh UUID rather than the agency's, so
		// the handler refuses it as not the signed-in agency, which is the same
		// harmless 400.
		allow('reach settings', 'PATCH', SETTINGS_TIMEZONE, {}),
		allow('reach the agency’s details', 'PATCH', organizationPath(), {
			intents: ['identity.updateOrganizationDetails'],
		}),
		allow('reach the people surface', 'POST', PROFILES_PATH, {
			intents: ['identity.createProfile'],
		}),

		// The one rung above them, and the reason it exists: a settable role is a
		// self-promotable one.
		deny(
			'change somebody’s role',
			'PATCH',
			`/organization/memberships/${uuid()}/role`,
			{ role: 'owner' },
			'owners can change a role',
		),
	],

	owner: [
		allow('create a collection method', 'POST', '/foundation/collection-methods', lookup()),
		// A membership id that does not exist: a 404 proves the floor passed
		// without promoting anybody.
		allow('change somebody’s role', 'PATCH', `/organization/memberships/${uuid()}/role`, {
			role: 'manager',
		}),
	],
};

// ---------------------------------------------------------------------------

let passed = 0;
const failures: string[] = [];

for (const role of ['viewer', 'collector', 'manager', 'admin', 'owner'] as const) {
	const email = `${EMAIL_PREFIX}${role}@${EMAIL_DOMAIN}`;
	const cookie = await signIn(email);
	if (cookie === null) {
		failures.push(`${role}: could not sign in as ${email}`);
		console.log(`\n${role.toUpperCase()} — sign-in FAILED (${email})`);
		continue;
	}

	console.log(`\n${role.toUpperCase()} (${email})`);
	for (const check of CHECKS[role]) {
		const outcome = await run(cookie, check);
		if (outcome.ok) {
			passed += 1;
			console.log(`  ok    ${check.expect === 'deny' ? 'refused' : 'allowed'}: ${check.what}`);
		} else {
			failures.push(`${role}: ${check.what} — ${outcome.detail}`);
			console.log(`  FAIL  ${check.what} — ${outcome.detail}`);
		}
	}
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
	console.log('\nFailures:');
	for (const failure of failures) {
		console.log(`  ${failure}`);
	}
	process.exitCode = 1;
}

// ---------------------------------------------------------------------------

async function signIn(email: string): Promise<string | null> {
	const response = await fetch(`${API}/auth/sign-in`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password: PASSWORD }),
	});
	const setCookie = response.headers.getSetCookie?.() ?? [];
	const session = setCookie.find((value) => value.startsWith('wos-session='));
	if (!response.ok || session === undefined) {
		return null;
	}
	return session.split(';')[0] ?? null;
}

async function run(
	cookie: string,
	check: Expectation,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly detail: string }> {
	const response = await fetch(`${API}${check.path}`, {
		method: check.method,
		headers: { 'content-type': 'application/json', cookie },
		...(check.body === undefined ? {} : { body: JSON.stringify(check.body) }),
	});
	const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
	const reason = typeof body.reason === 'string' ? body.reason : '';

	if (check.expect === 'deny') {
		if (response.status !== 403) {
			return { ok: false, detail: `expected 403, got ${response.status} ${short(body)}` };
		}
		if (
			check.because !== undefined &&
			!reason.toLowerCase().includes(check.because.toLowerCase())
		) {
			return { ok: false, detail: `403 but reason was "${reason}", wanted "${check.because}"` };
		}
		return { ok: true };
	}

	// `allow` deliberately means "not refused". A validation error is a different
	// failure and not what this script is about; a 403 is exactly what it is.
	if (response.status === 403) {
		return { ok: false, detail: `refused with "${reason}" but should have been allowed` };
	}
	return { ok: true };
}

function short(body: Record<string, unknown>): string {
	const text = JSON.stringify(body);
	return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

// --- Case builders ---------------------------------------------------------

function allow(
	what: string,
	method: Expectation['method'],
	path: string,
	body?: unknown,
): Expectation {
	return { what, method, path, expect: 'allow', ...(body === undefined ? {} : { body }) };
}

function deny(
	what: string,
	method: Expectation['method'],
	path: string,
	body?: unknown,
	because?: string,
): Expectation {
	return {
		what,
		method,
		path,
		expect: 'deny',
		...(body === undefined ? {} : { body }),
		...(because === undefined ? {} : { because }),
	};
}

function assignment(id: string): string {
	return `/field-work/assignments/${id}`;
}
function commentPath(id: string): string {
	return `/field-work/comments/${id}`;
}
function action(id: string): string {
	return `/control-operations/source-reductions/${id}`;
}

// Payloads are only ever built far enough to get past parsing: the role check
// runs after the command is built, so a malformed body would answer 400 and
// prove nothing about the role.
function uuid(): string {
	return crypto.randomUUID();
}
function started(): unknown {
	return { startedAt: new Date().toISOString() };
}
function edited(): unknown {
	return { commentText: `Role ladder check ${Date.now()}` };
}
function reach(): unknown {
	return { sourcesEliminatedAmount: 4 };
}
function comment(): unknown {
	return {
		id: uuid(),
		entityType: 'assignment',
		entityId: FIXTURES.ownAssignment,
		commentText: 'Role ladder check.',
	};
}
function tag(): unknown {
	return { id: uuid(), tagName: `Role ladder ${Date.now()}` };
}
function route(): unknown {
	return { id: uuid(), routeName: `Role ladder ${Date.now()}`, routeType: 'habitat' };
}
function newAssignment(): unknown {
	return { id: uuid(), assignmentDate: new Date().toISOString().slice(0, 10) };
}
function timezone(): unknown {
	return { timezone: 'America/New_York' };
}
function details(): unknown {
	return { intents: ['identity.updateOrganizationDetails'], name: 'Role Ladder Check' };
}
function profile(): unknown {
	return {
		intents: ['identity.createProfile'],
		id: uuid(),
		display_name: 'Role Ladder Check',
		is_active: true,
	};
}
function lookup(): unknown {
	return { id: uuid(), name: `Role ladder ${Date.now()}` };
}
