import { SOURCE_REDUCTION_MAP_FILTERS } from '@simmer-mosquito/domain';
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
import type { SourceReductionTileFilters } from '../../map';

// The source reductions URL filter contract, outside the route modules so the
// Map and the Table read the same params. Every codec drops what it cannot
// read, so a malformed URL degrades to the defaults.

/** The filter state, keyed by the param each field appears under. */
export interface SourceReductionFilters {
	/** Inclusive start of the window on the source reduction date (`YYYY-MM-DD`). */
	readonly from: string;
	/** Inclusive end of the window on the source reduction date (`YYYY-MM-DD`). */
	readonly to: string;
	/** The technicians, by Profile id. */
	readonly people: ReadonlySet<string>;
	readonly methods: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
}

export const sourceReductionFilterCodecs: FilterCodecs<SourceReductionFilters> = {
	from: dateParam,
	to: dateParam,
	people: idSetParam,
	methods: idSetParam,
	regions: idSetParam,
};

/**
 * What an address with no filter params means: every source reduction inside `window`, the
 * bounds the set's `windows` open the surface on.
 */
export function sourceReductionFilterDefaults(
	window: RecordSetWindowBounds,
): SourceReductionFilters {
	return {
		from: window.from,
		to: window.to,
		people: new Set(),
		methods: new Set(),
		regions: new Set(),
	};
}

/** The filters as the source reduction tile layer reads them. An unset filter is absent. */
export function sourceReductionTileFilters(
	filters: SourceReductionFilters,
): SourceReductionTileFilters {
	return {
		...whenAny('sourceReductionMethodIds', filters.methods),
		...whenAny('technicianProfileIds', filters.people),
		...whenAny('regionIds', filters.regions),
		...whenText('dateFrom', filters.from),
		...whenText('dateTo', filters.to),
	};
}

/**
 * The Source Reductions Map and Table. Both read `/map/source-reduction` and apply every filter.
 */
export const sourceReductionRecordSet = defineRecordSet({
	recordType: 'sourceReduction',
	paths: {
		map: '/control-operations/source-reduction',
		table: '/control-operations/source-reduction/table',
	},
	codecs: sourceReductionFilterCodecs,
	endpoint: {
		path: '/map/source-reduction',
		rowsKey: 'sourceReductions',
		rowKey: 'sourceReduction',
	},
	tileset: 'source-reduction',
	tileFilters: sourceReductionTileFilters,
	filterSpec: SOURCE_REDUCTION_MAP_FILTERS,
	defaults: ({ window }) => sourceReductionFilterDefaults(window),
	windows: {
		map: { kind: 'lastDays', days: 90, reason: 'Ninety days is one season of source reductions.' },
		table: TABLE_OPENS_ON_ALL_TIME,
	},
	counting: DATE_RANGE_COUNTING,
	applies: { from: 'both', to: 'both', people: 'both', methods: 'both', regions: 'both' },
});
