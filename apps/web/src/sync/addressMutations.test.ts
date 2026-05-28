import type { AddressRow } from '@simmer-mosquito/sync';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAddressMutationHandlers } from './addressMutations';

describe('address mutation handlers', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('commits through the server without requiring an Electric txid match', async () => {
		const fetch = vi.fn(async () => new Response(JSON.stringify({ txid: 42 })));
		vi.stubGlobal('fetch', fetch);

		const handlers = createAddressMutationHandlers({ serverUrl: 'https://example.test' });
		const result = await handlers.onInsert({
			transaction: {
				mutations: [{ modified: addressRow() }],
			},
		});

		expect(result).toBeUndefined();
		expect(fetch).toHaveBeenCalledWith(
			'https://example.test/foundation/addresses',
			expect.objectContaining({ method: 'POST' }),
		);
	});
});

function addressRow(): AddressRow {
	return {
		id: 'address-1',
		organizationId: 'organization-1',
		displayName: '123 Main St',
		country: 'US',
		addressLine1: '123 Main St',
		addressLine2: null,
		locality: 'Somewhere',
		region: 'WA',
		postalCode: '98101',
		geocoderResponse: null,
		geojson: { type: 'Point', coordinates: [-122.33, 47.61] },
		createdByProfileId: null,
		updatedByProfileId: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
	};
}
