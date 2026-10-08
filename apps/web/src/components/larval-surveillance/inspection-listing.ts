/**
 * One inspection as `/map/inspections` lists it, and the request that lists it.
 *
 * The Map's rail and the Table both page through that endpoint, so the row and
 * the filter params are written once here. `docs/web-components.md` carries why
 * the Table pages on the server rather than through a live query.
 */

import type { LarvalDensity } from '@simmer-mosquito/domain';
import { whenAny, whenOn, whenText } from '../explorer';
import type { InspectionTileFilters } from '../map';
import type { InspectionFilterState } from './inspection-filters';

/**
 * The owned-geometry projection plus the record fields and the joined habitat,
 * address and inspector labels a row identifies itself with, since an
 * inspection has no name of its own.
 */
export interface InspectionListing {
	readonly id: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geomType: string | null;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
	readonly addressDisplayName: string | null;
	readonly inspectedByProfileId: string | null;
	readonly inspectedByName: string | null;
	readonly inspectionDate: string;
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly hasEggs: boolean;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
}

export const INSPECTIONS_PATH = '/map/inspections';

/** What the reader has narrowed by, as the tile layer wants it. */
export function inspectionTileFilters(set: InspectionFilterState): InspectionTileFilters {
	return {
		...(set.wetness === 'all' ? {} : { isWet: set.wetness === 'wet' }),
		...whenAny('densities', set.densities),
		...whenOn('positiveOnly', set.positiveOnly),
		...whenAny('habitatTypeIds', set.typeIds),
		...whenAny('inspectedByProfileIds', set.inspectorIds),
		...whenAny('regionIds', set.regionIds),
		...whenText('dateFrom', set.dateFrom),
		...whenText('dateTo', set.dateTo),
	};
}

/** The same filters as the list endpoint's query string. */
export function inspectionQueryParams(filters: InspectionTileFilters) {
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
