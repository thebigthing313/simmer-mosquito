import type { MapQueryValue } from '../../../hooks/explorer/use-paged-map-resource';
import {
	choiceParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
	textParam,
} from '../../../lib/search-filters';
import { whenAny, whenText } from '../../explorer/tile-filter-params';
import type { HabitatTileFilters } from '../../map';
import type { AccessFilter, StatusFilter } from './legend';

// The habitats URL filter contract, outside the route modules so the Map and
// the Table read the same params. Every codec drops what it cannot read, so a
// malformed URL degrades to the defaults.

const STATUS_VALUES: readonly StatusFilter[] = ['all', 'active', 'inactive'];
const ACCESS_VALUES: readonly AccessFilter[] = ['all', 'accessible', 'inaccessible'];

/** The filter state, keyed by the param each field appears under. */
export interface HabitatFilters {
	readonly search: string;
	readonly status: StatusFilter;
	readonly access: AccessFilter;
	readonly typeIds: ReadonlySet<string>;
	readonly tagIds: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
	/**
	 * Untreated: heavy in the last 7 days with no control action since. The
	 * server's rule, which the Dashboard's banner counts by and links here with.
	 */
	readonly untreated: boolean;
}

export const HABITAT_FILTER_DEFAULTS: HabitatFilters = {
	search: '',
	status: 'active',
	access: 'all',
	typeIds: new Set(),
	tagIds: new Set(),
	regions: new Set(),
	untreated: false,
};

export const habitatFilterCodecs: FilterCodecs<HabitatFilters> = {
	search: textParam,
	status: choiceParam(STATUS_VALUES, HABITAT_FILTER_DEFAULTS.status),
	access: choiceParam(ACCESS_VALUES, HABITAT_FILTER_DEFAULTS.access),
	typeIds: idSetParam,
	tagIds: idSetParam,
	regions: idSetParam,
	untreated: flagParam,
};

/** The filters as the habitats tile layer reads them. An unset filter is absent. */
export function habitatTileFilters(filters: HabitatFilters): HabitatTileFilters {
	return {
		...(filters.status === 'all' ? {} : { isActive: filters.status === 'active' }),
		...(filters.access === 'all' ? {} : { isInaccessible: filters.access === 'inaccessible' }),
		...whenAny('habitatTypeIds', filters.typeIds),
		...whenAny('tagIds', filters.tagIds),
		...whenAny('regionIds', filters.regions),
		...whenText('search', filters.search),
		...(filters.untreated ? { untreatedOnly: true } : {}),
	};
}

/**
 * The same filters as `/map/habitats` reads them. The Map adds the viewport's
 * `bbox` to these and the Table adds the whole world's, so the two surfaces
 * send one filter set under two boxes.
 */
export function habitatListParams(filters: HabitatTileFilters): Record<string, MapQueryValue> {
	return {
		isActive: filters.isActive,
		isInaccessible: filters.isInaccessible,
		habitatTypeId: filters.habitatTypeIds,
		tagId: filters.tagIds,
		regionId: filters.regionIds,
		search: filters.search,
		untreated: filters.untreatedOnly,
	};
}

/**
 * The params a move between the Map and the Table carries. That is every
 * filter, since both surfaces read the same list endpoint and apply each one.
 */
export function sharedHabitatSearch(search: Record<string, unknown>): Record<string, unknown> {
	const carried: Record<string, unknown> = {};
	for (const key of Object.keys(habitatFilterCodecs)) {
		const value = search[key];
		if (value !== undefined) {
			carried[key] = value;
		}
	}
	return carried;
}
