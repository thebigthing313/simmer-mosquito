import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminLogoutUrl, createAdminUnit } from '../../api';

describe('admin API writes', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('sends the optimistic unit id when creating a unit', async () => {
		let requestBody: BodyInit | null | undefined;
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			requestBody = init?.body;
			return new Response(JSON.stringify({ unit: {}, txid: 42 }));
		});
		vi.stubGlobal('fetch', fetchMock);

		await createAdminUnit(
			{
				id: 'be08a10c-7d27-4130-a359-9e8874d4d2b8',
				code: 'count',
				unitName: 'Count',
				abbreviation: 'ct',
				unitType: 'count',
				unitSystem: 'si',
			},
			'https://api.simmer-data.com',
		);

		expect(JSON.parse(String(requestBody))).toMatchObject({
			id: 'be08a10c-7d27-4130-a359-9e8874d4d2b8',
		});
	});
});

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
