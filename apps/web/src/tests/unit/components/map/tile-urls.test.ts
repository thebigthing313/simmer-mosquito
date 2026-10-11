import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AddressTileFilters } from '../../../../components/map/address-tiles';
import type { BiocontrolTileFilters } from '../../../../components/map/biocontrol-tiles';
import type { ChemicalTileFilters } from '../../../../components/map/chemical-tiles';
import type { CollectionTileFilters } from '../../../../components/map/collection-tiles';
import type { HabitatTileFilters } from '../../../../components/map/habitat-tiles';
import type { InspectionTileFilters } from '../../../../components/map/inspection-tiles';
import type { OutreachTileFilters } from '../../../../components/map/outreach-tiles';
import type { RegionTileFilters } from '../../../../components/map/region-tiles';
import type { SampleTileFilters } from '../../../../components/map/sample-tiles';
import type { ServiceRequestTileFilters } from '../../../../components/map/service-request-tiles';
import type { SourceReductionTileFilters } from '../../../../components/map/source-reduction-tiles';
import {
	type MapTileLayer,
	tileLayerClusters,
	tileLayerExtentUrl,
	tileLayerTileUrl,
} from '../../../../components/map/tile-layers';
import type { TrapTileFilters } from '../../../../components/map/trap-tiles';

const serverUrl = 'https://api.example.test/';
const typeId = '4fe25a2d-925c-4d37-9d4e-07185ad19858';
const regionId = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';

describe('tile and extent URLs', () => {
	it('points the extent request at the tileset the tiles come from', () => {
		expect(tileUrl({ kind: 'habitats', serverUrl })).toBe(
			'https://api.example.test/map/tiles/habitats/{z}/{x}/{y}.mvt',
		);
		expect(extentUrl({ kind: 'habitats', serverUrl })).toBe(
			'https://api.example.test/map/tiles/habitats/extent',
		);
	});

	// The camera must frame exactly what the tiles draw, so both URLs are built
	// from one filter → param mapping per domain. Any drift shows up here.
	it.each<MapTileLayer>([
		{
			kind: 'habitats',
			serverUrl,
			filters: { isActive: true, habitatTypeIds: [typeId], search: 'pond' },
		},
		{ kind: 'addresses', serverUrl, filters: { search: 'Main St' } },
		{ kind: 'samples', serverUrl, filters: { status: 'awaiting', dateFrom: '2026-01-01' } },
		{ kind: 'chemical', serverUrl, filters: { insecticideIds: [typeId], dateTo: '2026-06-30' } },
		{ kind: 'traps', serverUrl, filters: { isActive: false, search: 'CDC' } },
	])('carries the same $kind filters on both URLs', (layer) => {
		const extent = queryOf(extentUrl(layer));

		expect(extent).toBe(queryOf(tileUrl(layer)));
		expect(extent.length).toBeGreaterThan(0);
	});

	// The two Dashboard filters, spelled as the server's `trueOnly` params and
	// dropped when off, so a link with the flag lands on the rows the count
	// counted and a page without it sends nothing the reader has to ignore.
	it('sends the untreated and awaiting flags only when they are on', () => {
		expect(
			queryOf(tileUrl({ kind: 'habitats', serverUrl, filters: { untreatedOnly: true } })),
		).toBe('untreated=true');
		expect(
			queryOf(tileUrl({ kind: 'habitats', serverUrl, filters: { untreatedOnly: false } })),
		).toBe('');
		expect(
			queryOf(tileUrl({ kind: 'collections', serverUrl, filters: { awaitingOnly: true } })),
		).toBe('awaiting=true');
		expect(
			queryOf(extentUrl({ kind: 'collections', serverUrl, filters: { awaitingOnly: true } })),
		).toBe('awaiting=true');
		expect(
			queryOf(tileUrl({ kind: 'collections', serverUrl, filters: { awaitingOnly: false } })),
		).toBe('');
	});

	// Every record tileset takes the region narrowing under the same param, so a
	// region deep link into one explorer stays readable by the next.
	it('folds the region narrowing into every record tileset the same way', () => {
		const second = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

		expect(tileUrl({ kind: 'habitats', serverUrl, filters: { regionIds: [regionId] } })).toBe(
			`https://api.example.test/map/tiles/habitats/{z}/{x}/{y}.mvt?regionId=${regionId}`,
		);
		expect(extentUrl({ kind: 'addresses', serverUrl, filters: { regionIds: [regionId] } })).toBe(
			`https://api.example.test/map/tiles/addresses/extent?regionId=${regionId}`,
		);
		// Sorted, so re-picking the same regions in another order leaves the tile
		// source untouched rather than refetching every tile on screen.
		expect(
			queryOf(tileUrl({ kind: 'traps', serverUrl, filters: { regionIds: [regionId, second] } })),
		).toBe(
			queryOf(tileUrl({ kind: 'traps', serverUrl, filters: { regionIds: [second, regionId] } })),
		);
	});

	it('names the ticked regions on the extent request only', () => {
		// Region tiles stream whole and hide client-side, so the id set narrows the
		// frame without refetching a single tile.
		expect(extentUrl({ kind: 'regions', serverUrl, visibleIds: [regionId] })).toBe(
			`https://api.example.test/map/tiles/regions/extent?id=${regionId}`,
		);
		expect(tileUrl({ kind: 'regions', serverUrl, filters: { regionFolderId: 'unfiled' } })).toBe(
			'https://api.example.test/map/tiles/regions/{z}/{x}/{y}.mvt?regionFolderId=unfiled',
		);
	});

	it('frames nothing for Regions while no region is ticked', () => {
		expect(extentUrl({ kind: 'regions', serverUrl })).toBeNull();
		expect(extentUrl({ kind: 'regions', serverUrl, visibleIds: [] })).toBeNull();
	});
});

// A clustered tile is a different tile, so it must cache under its own URL,
// while the extent frames the same records either way and keeps one URL.
describe('clustered tile URLs', () => {
	it('asks for clusters on the tile URL and never on the extent', () => {
		const layer: MapTileLayer = {
			kind: 'traps',
			serverUrl,
			filters: { isActive: true, search: 'CDC' },
		};

		expect(queryOf(tileLayerTileUrl(layer, { cluster: true }))).toBe(
			'status=active&search=CDC&cluster=1',
		);
		expect(queryOf(tileLayerTileUrl(layer, {}))).toBe('status=active&search=CDC');
		expect(queryOf(tileLayerTileUrl(layer, { cluster: false }))).toBe('status=active&search=CDC');
		expect(queryOf(extentUrl(layer))).toBe('status=active&search=CDC');
	});

	// Every tileset whose records are points, which is all of them but Regions.
	const pointTilesets = [
		'habitats',
		'addresses',
		'inspections',
		'samples',
		'chemical',
		'source-reduction',
		'biocontrol',
		'outreach',
		'traps',
		'collections',
		'service-requests',
	] as const;

	it.each(pointTilesets)('clusters the %s map when clustering is on', (kind) => {
		const layer = { kind, serverUrl } as const;

		expect(tileLayerTileUrl(layer, { cluster: true })).toBe(
			`https://api.example.test/map/tiles/${kind}/{z}/{x}/{y}.mvt?cluster=1`,
		);
		expect(tileLayerTileUrl(layer, { cluster: false })).toBe(
			`https://api.example.test/map/tiles/${kind}/{z}/{x}/{y}.mvt`,
		);
		expect(tileLayerExtentUrl(layer)).toBe(`https://api.example.test/map/tiles/${kind}/extent`);
		expect(tileLayerClusters(layer)).toBe(true);
	});

	it('keeps the filters beside the cluster param', () => {
		const layer = {
			kind: 'inspections',
			serverUrl,
			filters: { dateFrom: '2026-05-01', dateTo: '2026-05-31' },
		} as const;

		expect(queryOf(tileLayerTileUrl(layer, { cluster: true }))).toBe(
			'dateFrom=2026-05-01&dateTo=2026-05-31&cluster=1',
		);
	});

	it('never clusters Regions, which answers 400 to the param', () => {
		const regions = { kind: 'regions', serverUrl } as const;

		expect(tileLayerTileUrl(regions, { cluster: true })).toBe(
			'https://api.example.test/map/tiles/regions/{z}/{x}/{y}.mvt',
		);
		expect(tileLayerClusters(regions)).toBe(false);
	});
});

// Each row's filters come off the spec it names, so a row naming another
// kind's spec changes the filters its entries take, and these fail `tsc`.
describe('layer filter types', () => {
	it('types each kind by its own spec', () => {
		expectTypeOf<FiltersOf<'habitats'>>().toEqualTypeOf<HabitatTileFilters>();
		expectTypeOf<FiltersOf<'regions'>>().toEqualTypeOf<RegionTileFilters>();
		expectTypeOf<FiltersOf<'addresses'>>().toEqualTypeOf<AddressTileFilters>();
		expectTypeOf<FiltersOf<'inspections'>>().toEqualTypeOf<InspectionTileFilters>();
		expectTypeOf<FiltersOf<'samples'>>().toEqualTypeOf<SampleTileFilters>();
		expectTypeOf<FiltersOf<'chemical'>>().toEqualTypeOf<ChemicalTileFilters>();
		expectTypeOf<FiltersOf<'source-reduction'>>().toEqualTypeOf<SourceReductionTileFilters>();
		expectTypeOf<FiltersOf<'biocontrol'>>().toEqualTypeOf<BiocontrolTileFilters>();
		expectTypeOf<FiltersOf<'outreach'>>().toEqualTypeOf<OutreachTileFilters>();
		expectTypeOf<FiltersOf<'traps'>>().toEqualTypeOf<TrapTileFilters>();
		expectTypeOf<FiltersOf<'collections'>>().toEqualTypeOf<CollectionTileFilters>();
		expectTypeOf<FiltersOf<'service-requests'>>().toEqualTypeOf<ServiceRequestTileFilters>();
	});

	it('refuses filters of another kind on an entry', () => {
		// @ts-expect-error `awaitingOnly` is a collection filter, not a habitat one.
		const wrong: MapTileLayer = { kind: 'habitats', serverUrl, filters: { awaitingOnly: true } };

		expect(wrong.kind).toBe('habitats');
	});
});

type FiltersOf<TKind extends MapTileLayer['kind']> = NonNullable<
	Extract<MapTileLayer, { readonly kind: TKind }>['filters']
>;

function tileUrl(layer: MapTileLayer): string {
	return tileLayerTileUrl(layer, {});
}

function extentUrl(layer: MapTileLayer): string | null {
	return tileLayerExtentUrl(layer);
}

function queryOf(url: string | null): string {
	return url?.split('?')[1] ?? '';
}
