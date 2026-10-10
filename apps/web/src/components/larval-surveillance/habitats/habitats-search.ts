import { HABITAT_MAP_FILTERS } from '@simmer-mosquito/domain';
import {
	choiceParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
	textParam,
} from '../../../lib/search-filters';
import { defineRecordSet } from '../../explorer/record-set';
import { whenAny, whenText } from '../../explorer/tile-filter-params';
import type { HabitatTileFilters } from '../../map';
import type { AccessFilter, HabitatStatusFilter } from './legend';

// The habitats URL filter contract, outside the route modules so the Map and
// the Table read the same params. Every codec drops what it cannot read, so a
// malformed URL degrades to the defaults.

const STATUS_VALUES: readonly HabitatStatusFilter[] = ['all', 'active', 'inactive'];
const ACCESS_VALUES: readonly AccessFilter[] = ['all', 'accessible', 'inaccessible'];

/** The filter state, keyed by the param each field appears under. */
export interface HabitatFilters {
	readonly search: string;
	readonly status: HabitatStatusFilter;
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
 * The Habitats Map and Table. Both read `/map/habitats` and apply every filter.
 */
export const habitatRecordSet = defineRecordSet({
	recordType: 'habitat',
	paths: { map: '/larval-surveillance/habitats', table: '/larval-surveillance/habitats/table' },
	codecs: habitatFilterCodecs,
	endpoint: { path: '/map/habitats', rowsKey: 'habitats', rowKey: 'habitat' },
	tileset: 'habitats',
	tileFilters: habitatTileFilters,
	filterSpec: HABITAT_MAP_FILTERS,
	defaults: () => HABITAT_FILTER_DEFAULTS,
	textSearch: { key: 'search' },
	applies: {
		search: 'both',
		status: 'both',
		access: 'both',
		typeIds: 'both',
		tagIds: 'both',
		regions: 'both',
		untreated: 'both',
	},
});
