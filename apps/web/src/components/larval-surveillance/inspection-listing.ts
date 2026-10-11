/**
 * One inspection as `/map/inspections` lists it.
 *
 * The Map's rail and the Table both page through that endpoint, so the row is
 * written once here, and the request is `inspectionRecordSet`'s.
 * `docs/web-components.md` carries why the Table pages on the server rather
 * than through a live query.
 */

import type { LarvalDensity } from '@simmer-mosquito/domain';

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
