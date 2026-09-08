import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	adminLogoutUrl,
	getOrganizationFoundations,
	isAdminRefusal,
	isOperatorNotConfiguredError,
	isOperatorRequiredError,
	listAdminOrganizations,
	postOrganizationCommand,
} from '../../api';

/**
 * `api.ts` is organizations, invitations and identity now.
 *
 * The global-catalog writes it used to carry — nine functions across genera,
 * species and units — went to `lib/collections/writes.ts`, which mutates the
 * collections and lets `packages/sync` derive the command request. The test that
 * lived here for "a create sends its own id" moved with them, to
 * `lib/collections/writes.test.ts`, where the id is minted.
 */
describe('operator sign-out', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	// Without a `returnTo` the server sends the browser to `APP_ORIGIN` — the
	// organization workspace — so signing out of the console landed the operator
	// on another app's sign-in page.
	it('returns the operator to the console sign-in page, not the organization app', () => {
		vi.stubGlobal('window', { location: { origin: 'https://admin.simmer-data.com' } });

		expect(adminLogoutUrl('https://api.simmer-data.com')).toBe(
			'https://api.simmer-data.com/auth/logout?returnTo=https%3A%2F%2Fadmin.simmer-data.com%2Fsign-in',
		);
	});
});

/**
 * Both refusals are 403s from the same middleware, and the console renders them
 * as different screens, so the only thing separating them is the `error` code
 * surviving the fetch. It used to be one code, and the console told an operator
 * on a server with no `SIMMER_OPERATOR_ORG_ID` to sign back in as SIMMER, which
 * cannot work: the server could not tell an operator from anyone else.
 */
describe('operator refusals', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function refuse(code: string) {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ error: code }), { status: 403 })),
		);
		return listAdminOrganizations('https://api.simmer-data.com').catch((error: unknown) => error);
	}

	it('reads a wrong-organization refusal apart from an unconfigured server', async () => {
		const wrongOrganization = await refuse('operator_required');

		expect({
			required: isOperatorRequiredError(wrongOrganization),
			notConfigured: isOperatorNotConfiguredError(wrongOrganization),
		}).toEqual({ required: true, notConfigured: false });
	});

	it('reads an unconfigured server apart from a wrong-organization refusal', async () => {
		const unconfigured = await refuse('operator_not_configured');

		expect({
			required: isOperatorRequiredError(unconfigured),
			notConfigured: isOperatorNotConfiguredError(unconfigured),
		}).toEqual({ required: false, notConfigured: true });
	});
});

/**
 * What the query client retries. A 403 is an answer and asking again cannot
 * change it, so retrying one only delays the screen that explains it; a 500 or
 * a dropped connection can succeed on a second try, so those still retry.
 */
describe('retrying a failed admin read', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	async function failWith(status: number) {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ error: 'nope' }), { status })),
		);
		return listAdminOrganizations('https://api.simmer-data.com').catch((error: unknown) => error);
	}

	it('treats a refusal as final and a fault as worth retrying', async () => {
		expect({
			refused: isAdminRefusal(await failWith(403)),
			notFound: isAdminRefusal(await failWith(404)),
			faulted: isAdminRefusal(await failWith(500)),
			offline: isAdminRefusal(new Error('Failed to fetch')),
		}).toEqual({ refused: true, notFound: true, faulted: false, offline: false });
	});
});

/**
 * The Foundations read reached `/admin/*` on its own until #612, and threw a
 * plain `Error` carrying neither the code nor the status. Every decision below
 * is one the console already made correctly on every other page.
 */
describe('the Foundations read', () => {
	const ORGANIZATION_ID = '2f4a1f1c-4a3a-4d21-9d1a-0d9d2f5d4b11';

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function refuse(code: string, status: number) {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ error: code }), { status })),
		);
		return getOrganizationFoundations(ORGANIZATION_ID, 'https://api.simmer-data.com').catch(
			(error: unknown) => error,
		);
	}

	it('reads an unconfigured server off the refusal, as the organizations list does', async () => {
		expect(isOperatorNotConfiguredError(await refuse('operator_not_configured', 403))).toBe(true);
	});

	// Both refusals this read can hit. The 403 is the middleware's; the 404 is
	// the route's own, for an id that names no organization. Asking again cannot
	// change either, so the query client must not spend three tries on them.
	it('treats both of its refusals as final rather than retrying them', async () => {
		expect({
			refused: isAdminRefusal(await refuse('operator_not_configured', 403)),
			notFound: isAdminRefusal(await refuse('organization_not_found', 404)),
		}).toEqual({ refused: true, notFound: true });
	});

	// The page wrote its own message and swapped the underscores out, so one 403
	// read as "operator required" there and "operator_required" everywhere else.
	// Both now read the register's sentence, and the read and the write reach it
	// through the same `responseErrorMessage`.
	it('renders operator_required as the organizations list renders it', async () => {
		const fromFoundations = await refuse('operator_required', 403);
		const fromOrganizations = await listAdminOrganizations('https://api.simmer-data.com').catch(
			(error: unknown) => error,
		);

		expect([messageOf(fromFoundations), messageOf(fromOrganizations)]).toEqual([
			'This account is not a SIMMER operator. Sign out and sign in as one.',
			'This account is not a SIMMER operator. Sign out and sign in as one.',
		]);
	});

	function messageOf(error: unknown): string | null {
		return error instanceof Error ? error.message : null;
	}
});

/**
 * The three branches of `responseErrorMessage`, over both doors: a read through
 * `getJson` and a Foundations write through `postOrganizationCommand`.
 *
 * A code on screen is the failure this covers, so every case asserts the whole
 * message rather than that it merely differs from the code. The unmapped case
 * is the one that decides whether the register is a map or a fallthrough: a
 * lookup that answered the code for anything it did not know would pass every
 * other case here.
 */
describe('what a refusal reads as', () => {
	const SERVER = 'https://api.simmer-data.com';

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function answer(body: unknown, status: number) {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(body), { status })),
		);
	}

	async function readMessage(body: unknown, status: number): Promise<string | null> {
		answer(body, status);
		const caught: unknown = await listAdminOrganizations(SERVER).catch((error: unknown) => error);
		return caught instanceof Error ? caught.message : null;
	}

	async function writeMessage(body: unknown, status: number): Promise<string | null> {
		answer(body, status);
		const caught: unknown = await postOrganizationCommand('/foundation/regions', {}).catch(
			(error: unknown) => error,
		);
		return caught instanceof Error ? caught.message : null;
	}

	it('prefers a mapped code over the code and over a reason that repeats it', async () => {
		expect(
			await readMessage({ error: 'organization_required', reason: 'organization_required' }, 403),
		).toBe('This session has no organization selected. Enter the organization again.');
	});

	it("keeps the server's own sentence for a code the register does not carry", async () => {
		expect(
			await writeMessage({ error: 'invalid_payload', reason: 'Region name is required.' }, 400),
		).toBe('Region name is required.');
	});

	// The register is a map. A code it has never heard of takes the caller's
	// fallback sentence, and specifically not `snake_case_code_on_screen`.
	it('falls back to the caller sentence for an unmapped code, never to the code', async () => {
		expect({
			read: await readMessage({ error: 'weather_station_inactive' }, 409),
			write: await writeMessage({ error: 'weather_station_inactive' }, 409),
		}).toEqual({ read: 'Unable to load organizations.', write: 'Request failed.' });
	});

	// A refused Foundations write is the case #689 was filed on: it reached the
	// form alert as `operator_required` through the form kit's `SaveFailure`,
	// which renders whatever `AdminApiError.message` holds.
	it('reads a refused Foundations write as English', async () => {
		expect(await writeMessage({ error: 'operator_required' }, 403)).toBe(
			'This account is not a SIMMER operator. Sign out and sign in as one.',
		);
	});

	/*
	 * Every code the console can receive that sends no sentence of its own,
	 * walked back from the six calls `api.ts` makes. Listed here rather than
	 * read out of the register, because a test that imports the map asserts only
	 * that a map is a map: this is the second copy on purpose, and a code
	 * dropped from the register fails on the line that names it.
	 */
	const COVERED = [
		'already_a_member',
		'invalid_command',
		'invited_email_already_used',
		'membership_required',
		'operator_not_configured',
		'operator_required',
		'organization_not_found',
		'organization_required',
		'profile_already_linked',
		'profile_deleted',
		'profile_not_found',
		'unauthenticated',
		'workos_organization_required',
	];

	it('has a sentence for every code it claims to cover', async () => {
		// Three ways a code can fail to be covered, and the third is the one a
		// removed entry looks like: the caller's fallback is a sentence too, so a
		// check for "reads as English" passes over an entry that is gone.
		const uncovered: string[] = [];
		for (const code of COVERED) {
			const message = await readMessage({ error: code }, 403);
			if (message === null || message === code || message === 'Unable to load organizations.') {
				uncovered.push(code);
			}
		}

		expect(uncovered).toEqual([]);
	});
});
