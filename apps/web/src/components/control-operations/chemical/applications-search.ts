import { CHEMICAL_MAP_FILTERS } from '@simmer-mosquito/domain';
import {
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	idSetParam,
} from '../../../lib/search-filters';
import {
	defineRecordSet,
	type RecordSetWindowBounds,
	TABLE_OPENS_ON_ALL_TIME,
} from '../../explorer/record-set';
import { whenAny, whenText } from '../../explorer/tile-filter-params';
import type { ChemicalTileFilters } from '../../map';

// The chemical applications URL filter contract, outside the route modules so
// the Map and the Table read the same params. Every codec drops what it cannot
// read, so a malformed URL degrades to the defaults.

/** The filter state, keyed by the param each field appears under. */
export interface ApplicationFilters {
	/** Inclusive start of the window on the application date (`YYYY-MM-DD`). */
	readonly from: string;
	/** Inclusive end of the window on the application date (`YYYY-MM-DD`). */
	readonly to: string;
	readonly insecticides: ReadonlySet<string>;
	/** The applicators, by Profile id. */
	readonly people: ReadonlySet<string>;
	readonly methods: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
}

export const applicationFilterCodecs: FilterCodecs<ApplicationFilters> = {
	from: dateParam,
	to: dateParam,
	insecticides: idSetParam,
	people: idSetParam,
	methods: idSetParam,
	regions: idSetParam,
};

/**
 * What an address with no filter params means: every chemical application inside `window`, the
 * bounds the set's `windows` open the surface on.
 */
export function applicationFilterDefaults(window: RecordSetWindowBounds): ApplicationFilters {
	return {
		from: window.from,
		to: window.to,
		insecticides: new Set(),
		people: new Set(),
		methods: new Set(),
		regions: new Set(),
	};
}

/** The filters as the chemical tile layer reads them. An unset filter is absent. */
export function applicationTileFilters(filters: ApplicationFilters): ChemicalTileFilters {
	return {
		...whenAny('insecticideIds', filters.insecticides),
		...whenAny('applicationMethodIds', filters.methods),
		...whenAny('applicatorProfileIds', filters.people),
		...whenAny('regionIds', filters.regions),
		...whenText('dateFrom', filters.from),
		...whenText('dateTo', filters.to),
	};
}

/**
 * The Chemical Applications Map and Table. Both read `/map/chemical` and apply every filter.
 */
export const applicationRecordSet = defineRecordSet({
	recordType: 'application',
	paths: { map: '/control-operations/chemical', table: '/control-operations/chemical/table' },
	codecs: applicationFilterCodecs,
	endpoint: {
		path: '/map/chemical',
		rowsKey: 'applications',
		rowKey: 'application',
		exports: true,
	},
	tileset: 'chemical',
	tileFilters: applicationTileFilters,
	filterSpec: CHEMICAL_MAP_FILTERS,
	defaults: ({ window }) => applicationFilterDefaults(window),
	windows: {
		map: {
			kind: 'lastDays',
			days: 90,
			reason: 'Ninety days is one season of chemical applications.',
		},
		table: TABLE_OPENS_ON_ALL_TIME,
	},
	counting: DATE_RANGE_COUNTING,
	applies: {
		from: 'both',
		to: 'both',
		insecticides: 'both',
		people: 'both',
		methods: 'both',
		regions: 'both',
	},
});
