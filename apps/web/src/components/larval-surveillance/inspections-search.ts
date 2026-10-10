import { LARVAL_DENSITIES, type LarvalDensity } from '@simmer-mosquito/domain';
import { addDaysToDateString } from '../../lib/local-date';
import type { MapQueryValue } from '../../lib/map-query-params';
import {
	choiceParam,
	choiceSetParam,
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
} from '../../lib/search-filters';
import { defineRecordSet, type RecordSetSurface } from '../explorer/record-set';
import { whenAny, whenOn, whenText } from '../explorer/tile-filter-params';
import type { InspectionTileFilters } from '../map';

// The inspections explorer's URL filter contract, outside the route module so
// the overview panels can build deep links from the same definition. Every
// codec drops what it cannot read, so a malformed URL degrades to the
// explorer's defaults.

const waterValues = ['all', 'wet', 'dry'] as const;
export type WaterFilterValue = (typeof waterValues)[number];

/** The explorer's filter state, keyed by the param each field appears under. */
export interface InspectionFilters {
	/** Inclusive start of the inspection-date window (`YYYY-MM-DD`). */
	readonly from: string;
	/** Inclusive end of the inspection-date window (`YYYY-MM-DD`). */
	readonly to: string;
	readonly water: WaterFilterValue;
	readonly density: ReadonlySet<LarvalDensity>;
	/** Restrict to inspections where at least one life stage was found. */
	readonly positive: boolean;
	readonly types: ReadonlySet<string>;
	readonly inspectors: ReadonlySet<string>;
	/** Restrict to inspections inside these regions. */
	readonly regions: ReadonlySet<string>;
}

export const inspectionFilterCodecs: FilterCodecs<InspectionFilters> = {
	from: dateParam,
	to: dateParam,
	water: choiceParam(waterValues, 'all'),
	density: choiceSetParam(LARVAL_DENSITIES),
	positive: flagParam,
	types: idSetParam,
	inspectors: idSetParam,
	regions: idSetParam,
};

/**
 * The encoded shape, as a deep link supplies it. A type alias rather than an
 * interface so it carries an implicit index signature and satisfies the
 * router's search type.
 */
export type InspectionsSearch = {
	readonly from?: string;
	readonly to?: string;
	readonly water?: WaterFilterValue;
	readonly density?: readonly LarvalDensity[];
	readonly positive?: boolean;
	readonly types?: readonly string[];
	readonly inspectors?: readonly string[];
	readonly regions?: readonly string[];
};

/** How far back the Map opens, and what Clear all returns it to. */
const MAP_WINDOW_DAYS = 30;

/**
 * What an inspection surface's address with no filter params means. The two
 * surfaces open on different windows when the address names no dates: the Map
 * on the last 30 days, because a season of inspections is a solid block of
 * dots, and the Table on all time, because it shows a page of rows whatever
 * the reach and says it holds every inspection.
 */
function inspectionFilterDefaults(today: string, surface: RecordSetSurface): InspectionFilters {
	const allTime = surface === 'table';
	return {
		from: allTime ? '' : addDaysToDateString(today, -(MAP_WINDOW_DAYS - 1)),
		to: allTime ? '' : today,
		water: 'all',
		density: new Set<LarvalDensity>(),
		positive: false,
		types: new Set<string>(),
		inspectors: new Set<string>(),
		regions: new Set<string>(),
	};
}

/** The filters as the inspections tile layer reads them. An unset filter is absent. */
export function inspectionTileFilters(filters: InspectionFilters): InspectionTileFilters {
	return {
		...(filters.water === 'all' ? {} : { isWet: filters.water === 'wet' }),
		...whenAny('densities', filters.density),
		...whenOn('positiveOnly', filters.positive),
		...whenAny('habitatTypeIds', filters.types),
		...whenAny('inspectedByProfileIds', filters.inspectors),
		...whenAny('regionIds', filters.regions),
		...whenText('dateFrom', filters.from),
		...whenText('dateTo', filters.to),
	};
}

/** The same filters as `/map/inspections` reads them. */
export function inspectionListParams(
	filters: InspectionTileFilters,
): Record<string, MapQueryValue> {
	return {
		isWet: filters.isWet,
		density: filters.densities,
		positive: filters.positiveOnly,
		habitatTypeId: filters.habitatTypeIds,
		inspectedBy: filters.inspectedByProfileIds,
		regionId: filters.regionIds,
		dateFrom: filters.dateFrom,
		dateTo: filters.dateTo,
	};
}

/**
 * The Inspections Map and Table. Both read `/map/inspections`. The Table has
 * no Region control, so Region is the Map's alone and a switch to the Table
 * leaves it behind.
 */
export const inspectionRecordSet = defineRecordSet({
	recordType: 'inspection',
	paths: {
		map: '/larval-surveillance/inspections',
		table: '/larval-surveillance/inspections/table',
	},
	codecs: inspectionFilterCodecs,
	endpoint: { path: '/map/inspections', rowsKey: 'inspections', rowKey: 'inspection' },
	tileset: 'inspections',
	tileFilters: inspectionTileFilters,
	listParams: inspectionListParams,
	defaults: ({ today }, surface) => inspectionFilterDefaults(today, surface),
	counting: DATE_RANGE_COUNTING,
	applies: {
		from: 'both',
		to: 'both',
		water: 'both',
		density: 'both',
		positive: 'both',
		types: 'both',
		inspectors: 'both',
		regions: 'map',
	},
});
