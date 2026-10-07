import type { MapQueryValue } from '../../../hooks/explorer/use-paged-map-resource';
import { addDaysToDateString } from '../../../lib/local-date';
import { dateParam, type FilterCodecs, idSetParam } from '../../../lib/search-filters';
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
 * The params a move between the Map and the Table carries. That is every
 * filter, since both surfaces read the same list endpoint and apply each one.
 */
export function sharedSourceReductionSearch(
	search: Record<string, unknown>,
): Record<string, unknown> {
	const carried: Record<string, unknown> = {};
	for (const key of Object.keys(sourceReductionFilterCodecs)) {
		const value = search[key];
		if (value !== undefined) {
			carried[key] = value;
		}
	}
	return carried;
}
