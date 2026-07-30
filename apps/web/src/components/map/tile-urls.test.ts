import { describe, expect, it } from 'vitest';
import { buildAddressExtentUrl, buildAddressTileUrl } from './address-tiles';
import { buildChemicalExtentUrl, buildChemicalTileUrl } from './chemical-tiles';
import { buildHabitatExtentUrl, buildHabitatTileUrl } from './habitat-tiles';
import { buildRegionExtentUrl, buildRegionTileUrl } from './region-tiles';
import { buildSampleExtentUrl, buildSampleTileUrl } from './sample-tiles';
import { buildTrapExtentUrl, buildTrapTileUrl } from './trap-tiles';

const serverUrl = 'https://api.example.test/';
const typeId = '4fe25a2d-925c-4d37-9d4e-07185ad19858';
const regionId = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';

describe('tile and extent URLs', () => {
	it('points the extent request at the tileset the tiles come from', () => {
		expect(buildHabitatTileUrl(serverUrl)).toBe(
			'https://api.example.test/map/tiles/habitats/{z}/{x}/{y}.mvt',
		);
		expect(buildHabitatExtentUrl(serverUrl)).toBe(
			'https://api.example.test/map/tiles/habitats/extent',
		);
	});

	// The camera must frame exactly what the tiles draw, so both URLs are built
	// from one filter → param mapping per domain. Any drift shows up here.
	it.each([
		[
			'habitats',
			buildHabitatTileUrl(serverUrl, { isActive: true, habitatTypeIds: [typeId], search: 'pond' }),
			buildHabitatExtentUrl(serverUrl, {
				isActive: true,
				habitatTypeIds: [typeId],
				search: 'pond',
			}),
		],
		[
			'addresses',
			buildAddressTileUrl(serverUrl, { search: 'Main St' }),
			buildAddressExtentUrl(serverUrl, { search: 'Main St' }),
		],
		[
			'samples',
			buildSampleTileUrl(serverUrl, { status: 'awaiting', dateFrom: '2026-01-01' }),
			buildSampleExtentUrl(serverUrl, { status: 'awaiting', dateFrom: '2026-01-01' }),
		],
		[
			'chemical',
			buildChemicalTileUrl(serverUrl, { insecticideIds: [typeId], dateTo: '2026-06-30' }),
			buildChemicalExtentUrl(serverUrl, { insecticideIds: [typeId], dateTo: '2026-06-30' }),
		],
		[
			'traps',
			buildTrapTileUrl(serverUrl, { isActive: false, search: 'CDC' }),
			buildTrapExtentUrl(serverUrl, { isActive: false, search: 'CDC' }),
		],
	])('carries the same %s filters on both URLs', (_tileset, tileUrl, extentUrl) => {
		expect(queryOf(extentUrl)).toBe(queryOf(tileUrl));
		expect(queryOf(extentUrl).length).toBeGreaterThan(0);
	});

	it('names the ticked regions on the extent request only', () => {
		// Region tiles stream whole and hide client-side, so the id set narrows the
		// frame without refetching a single tile.
		expect(buildRegionExtentUrl(serverUrl, { ids: [regionId] })).toBe(
			`https://api.example.test/map/tiles/regions/extent?id=${regionId}`,
		);
		expect(buildRegionTileUrl(serverUrl, { regionFolderId: 'unfiled' })).toBe(
			'https://api.example.test/map/tiles/regions/{z}/{x}/{y}.mvt?regionFolderId=unfiled',
		);
	});
});

function queryOf(url: string): string {
	return url.split('?')[1] ?? '';
}
