import type { MapQueryValue } from '../../../hooks/explorer/use-paged-map-resource';
import { addDaysToDateString } from '../../../lib/local-date';
import {
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	idSetParam,
} from '../../../lib/search-filters';
import { defineRecordSet } from '../../explorer/record-set';
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

/** How many days the window opens on, ending on the Organization's today. */
export const SOURCE_REDUCTION_WINDOW_DAYS = 90;

/**
 * What an address with no filter params means: every source reduction over the
 * last ninety days, ending on the Organization's today.
 */
export function sourceReductionFilterDefaults(today: string): SourceReductionFilters {
	return {
		from: addDaysToDateString(today, -(SOURCE_REDUCTION_WINDOW_DAYS - 1)),
		to: today,
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
 * The same filters as `/map/source-reduction` reads them. The Map adds the
 * viewport's `bbox` to these and the Table adds the whole world's, so the two
 * surfaces send one filter set under two boxes.
 */
export function sourceReductionListParams(
	filters: SourceReductionTileFilters,
): Record<string, MapQueryValue> {
	return {
		sourceReductionMethodId: filters.sourceReductionMethodIds,
		technician: filters.technicianProfileIds,
		regionId: filters.regionIds,
		dateFrom: filters.dateFrom,
		dateTo: filters.dateTo,
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
	endpoint: { path: '/map/source-reduction', rowsKey: 'sourceReductions' },
	tileFilters: sourceReductionTileFilters,
	listParams: sourceReductionListParams,
	defaults: ({ today }) => sourceReductionFilterDefaults(today),
	counting: DATE_RANGE_COUNTING,
	applies: { from: 'both', to: 'both', people: 'both', methods: 'both', regions: 'both' },
});
