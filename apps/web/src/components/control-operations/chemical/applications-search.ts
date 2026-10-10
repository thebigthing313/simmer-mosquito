import type { MapQueryValue } from '../../../hooks/explorer/use-paged-map-resource';
import { addDaysToDateString } from '../../../lib/local-date';
import { dateParam, type FilterCodecs, idSetParam } from '../../../lib/search-filters';
import { defineRecordSet } from '../../explorer/record-set';
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

/** How many days the window opens on, ending on the Organization's today. */
export const APPLICATION_WINDOW_DAYS = 90;

/**
 * What an address with no filter params means: every chemical application over
 * the last ninety days, ending on the Organization's today.
 */
export function applicationFilterDefaults(today: string): ApplicationFilters {
	return {
		from: addDaysToDateString(today, -(APPLICATION_WINDOW_DAYS - 1)),
		to: today,
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
 * The same filters as `/map/chemical` reads them. The Map adds the viewport's
 * `bbox` to these and the Table adds the whole world's, so the two surfaces
 * send one filter set under two boxes.
 */
export function applicationListParams(filters: ChemicalTileFilters): Record<string, MapQueryValue> {
	return {
		insecticideId: filters.insecticideIds,
		applicationMethodId: filters.applicationMethodIds,
		applicator: filters.applicatorProfileIds,
		regionId: filters.regionIds,
		dateFrom: filters.dateFrom,
		dateTo: filters.dateTo,
	};
}

/**
 * The Chemical Applications Map and Table. Both read `/map/chemical` and apply every filter.
 */
export const applicationRecordSet = defineRecordSet({
	recordType: 'application',
	paths: { map: '/control-operations/chemical', table: '/control-operations/chemical/table' },
	codecs: applicationFilterCodecs,
	applies: {
		from: 'both',
		to: 'both',
		insecticides: 'both',
		people: 'both',
		methods: 'both',
		regions: 'both',
	},
});
