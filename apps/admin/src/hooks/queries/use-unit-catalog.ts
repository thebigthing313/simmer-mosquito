/**
 * The global unit catalog, as the page that maintains it reads it.
 *
 * The folder is the console read seam — `use-genus-roster.ts` states the rules.
 *
 * Sorted by name in the query rather than per group in the component: the page
 * groups by what a unit measures, and a group's members are the same rows in the
 * same order whichever group they land in, so the sort belongs to the read.
 *
 * `unit_type` and `unit_system` come back as the enum values Postgres stores.
 * They are narrowed here rather than at the call site because this is the seam:
 * above it the page picks its labels from a value it can switch on exhaustively.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { units } from '../../lib/collections/units';
import type { UnitSystem, UnitType } from '../../lib/collections/writes';

/** A unit as the catalog page reads it. */
export interface UnitListing {
	readonly id: string;
	/**
	 * The conversion key, not a label.
	 *
	 * `packages/domain`'s conversion table matches units by this, which is why the
	 * page shows it as the row's subtitle and why changing it asks for an
	 * acknowledgement.
	 */
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
}

export function useUnitCatalog(): {
	readonly units: readonly UnitListing[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ unit: units })
				.orderBy(({ unit }) => unit.unit_name, 'asc')
				.select(({ unit }) => ({
					id: unit.id,
					code: unit.code,
					unitName: unit.unit_name,
					abbreviation: unit.abbreviation,
					unitType: unit.unit_type,
					unitSystem: unit.unit_system,
				})),
		[],
	);

	return { units: result.data as readonly UnitListing[], isReady: result.isReady };
}
