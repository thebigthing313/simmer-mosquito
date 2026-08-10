import type { HabitatRow } from '@simmer-mosquito/sync';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHabitatMutationHandlers } from '../../../sync/habitatMutations';

describe('habitat mutation handlers', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('commits through the server without requiring an Electric txid match', async () => {
		const fetch = vi.fn(async () => new Response(JSON.stringify({ txid: 42 })));
		vi.stubGlobal('fetch', fetch);

		const handlers = createHabitatMutationHandlers({ serverUrl: 'https://example.test' });
		const result = await handlers.onInsert({
			transaction: {
				mutations: [
					{
						modified: habitatRow(),
						metadata: {
							locationSource: {
								kind: 'geometry',
								geometry: { type: 'Point', coordinates: [-122.33, 47.61] },
							},
						},
					},
				],
			},
		});

		expect(result).toBeUndefined();
		expect(fetch).toHaveBeenCalledWith(
			'https://example.test/larval-surveillance/habitats',
			expect.objectContaining({ method: 'POST' }),
		);
	});
});

function habitatRow(): HabitatRow {
	return {
		id: 'habitat-1',
		organizationId: 'organization-1',
		lat: 47.6062,
		lng: -122.3321,
		geomType: 'st_point',
		addressId: null,
		habitatTypeId: 'habitat-type-1',
		habitatName: 'Catch basin',
		description: 'Standing water near the curb',
		isActive: true,
		isInaccessible: false,
		metadata: null,
		createdByProfileId: null,
		updatedByProfileId: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
	};
}
