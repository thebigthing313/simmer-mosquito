import { TRAP_MAP_FILTERS } from '@simmer-mosquito/domain';
import { choiceParam, type FilterCodecs, idSetParam, textParam } from '../../../lib/search-filters';
import { defineRecordSet } from '../../explorer/record-set';
import { whenAny, whenText } from '../../explorer/tile-filter-params';
import type { TrapTileFilters } from '../../map';
import { TRAP_STATUS_VALUES, type TrapStatusFilter } from './legend';

// The traps URL filter contract, outside the route modules so the Map and the
// Table read the same params. Every codec drops what it cannot read, so a
// malformed URL degrades to the defaults.

/** The filter state, keyed by the param each field appears under. */
export interface TrapFilters {
	readonly search: string;
	readonly status: TrapStatusFilter;
	readonly methods: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
}

export const TRAP_FILTER_DEFAULTS: TrapFilters = {
	search: '',
	status: 'active',
	methods: new Set(),
	regions: new Set(),
};

export const trapFilterCodecs: FilterCodecs<TrapFilters> = {
	search: textParam,
	status: choiceParam(TRAP_STATUS_VALUES, TRAP_FILTER_DEFAULTS.status),
	methods: idSetParam,
	regions: idSetParam,
};

/** The filters as the traps tile layer reads them. An unset filter is absent. */
export function trapTileFilters(filters: TrapFilters): TrapTileFilters {
	return {
		...whenAny('collectionMethodIds', filters.methods),
		...(filters.status === 'all' ? {} : { isActive: filters.status === 'active' }),
		...whenAny('regionIds', filters.regions),
		...whenText('search', filters.search),
	};
}

/**
 * The Traps Map and Table. Both read `/map/traps` and apply every filter.
 */
export const trapRecordSet = defineRecordSet({
	recordType: 'trap',
	paths: { map: '/adult-surveillance/traps', table: '/adult-surveillance/traps/table' },
	codecs: trapFilterCodecs,
	endpoint: { path: '/map/traps', rowsKey: 'traps', rowKey: 'trap' },
	tileset: 'traps',
	tileFilters: trapTileFilters,
	filterSpec: TRAP_MAP_FILTERS,
	defaults: () => TRAP_FILTER_DEFAULTS,
	textSearch: { key: 'search', delayMs: 200 },
	applies: { search: 'both', status: 'both', methods: 'both', regions: 'both' },
});
