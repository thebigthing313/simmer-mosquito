import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminUnit } from './api';

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
