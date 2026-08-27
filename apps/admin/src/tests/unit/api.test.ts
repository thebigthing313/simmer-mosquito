import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	adminLogoutUrl,
	isOperatorNotConfiguredError,
	isOperatorRequiredError,
	listAdminAgencies,
} from '../../api';

/**
 * `api.ts` is agencies, invitations and identity now.
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
	// agency workspace — so signing out of the console landed the operator on
	// another app's sign-in page.
	it('returns the operator to the console sign-in page, not the agency app', () => {
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
		return listAdminAgencies('https://api.simmer-data.com').catch((error: unknown) => error);
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
