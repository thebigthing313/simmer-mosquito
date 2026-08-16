import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminLogoutUrl } from '../../api';

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
