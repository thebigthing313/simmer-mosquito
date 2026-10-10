import type { MapQueryValue } from '../../../hooks/explorer/use-paged-map-resource';
import { type FilterCodecs, idSetParam, textParam } from '../../../lib/search-filters';
import { defineRecordSet } from '../../explorer/record-set';
import { whenAny, whenText } from '../../explorer/tile-filter-params';
import type { AddressTileFilters } from '../../map';

// The addresses URL filter contract, outside the route modules so the Map and
// the Table read the same params. Every codec drops what it cannot read, so a
// malformed URL degrades to the defaults.

/** The filter state, keyed by the param each field appears under. */
export interface AddressFilters {
	readonly search: string;
	readonly regions: ReadonlySet<string>;
}

/** No filter at all: the whole address book. */
export const ADDRESS_FILTER_DEFAULTS: AddressFilters = { search: '', regions: new Set() };

export const addressFilterCodecs: FilterCodecs<AddressFilters> = {
	search: textParam,
	regions: idSetParam,
};

/** The filters as the addresses tile layer reads them. An unset filter is absent. */
export function addressTileFilters(filters: AddressFilters): AddressTileFilters {
	return {
		...whenText('search', filters.search.trim()),
		...whenAny('regionIds', filters.regions),
	};
}

/**
 * The same filters as `/map/addresses` reads them. The Map adds the viewport's
 * `bbox` to these and the Table adds the whole world's, so the two surfaces
 * send one filter set under two boxes.
 */
export function addressListParams(filters: AddressTileFilters): Record<string, MapQueryValue> {
	return { search: filters.search, regionId: filters.regionIds };
}

/**
 * The Addresses Map and Table. Both read `/map/addresses` and apply every filter.
 */
export const addressRecordSet = defineRecordSet({
	recordType: 'address',
	paths: { map: '/gis/addresses', table: '/gis/addresses/table' },
	codecs: addressFilterCodecs,
	endpoint: { path: '/map/addresses', rowsKey: 'addresses' },
	tileFilters: addressTileFilters,
	listParams: addressListParams,
	defaults: () => ADDRESS_FILTER_DEFAULTS,
	textSearch: { key: 'search' },
	applies: { search: 'both', regions: 'both' },
});
