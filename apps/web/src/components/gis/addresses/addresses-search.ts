import type { MapQueryValue } from '../../../hooks/explorer/use-paged-map-resource';
import { type FilterCodecs, idSetParam, textParam } from '../../../lib/search-filters';
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
 * The params a move between the Map and the Table carries. That is every
 * filter, since both surfaces read the same list endpoint and apply each one.
 */
export function sharedAddressSearch(search: Record<string, unknown>): Record<string, unknown> {
	const carried: Record<string, unknown> = {};
	for (const key of Object.keys(addressFilterCodecs)) {
		const value = search[key];
		if (value !== undefined) {
			carried[key] = value;
		}
	}
	return carried;
}
