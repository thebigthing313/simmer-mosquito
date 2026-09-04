/**
 * The unit catalog: the whole list, and indexed both ways.
 *
 * Three views because three questions get asked of one small table, and one read
 * answers all of them.
 *
 * `byId` is for the surfaces that hold an amount and a unit id and have to render
 * the pair. `byCode` is for totalling across units that convert — `usageTotal` in
 * `routes/control-operations/-control-display.tsx` works over a `Map` of totals
 * keyed by unit id and reaches the conversion table by unit *code*. That is what
 * makes this a lookup rather than a join: a join gives a row its own unit, but it
 * cannot give a roll-up every unit its parts were measured in.
 *
 * `all` is for the form selects, which filter the catalog down to the unit types
 * a field can carry (see `lib/unit-options.ts`) — a question about the catalog
 * rather than about any one row.
 *
 * Anywhere one row means one unit, join it instead. `use-application.ts` and the
 * two beside it do.
 *
 * Units are a global catalog rather than an agency one — no `organization_id` —
 * and there are a few dozen, so this reads the whole table and suspends.
 */

import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { units } from '../../lib/collections/units';

/** A unit as the surfaces that show one read it: how to print it, how to convert it. */
export interface UnitLabel {
	readonly id: string;
	/** The domain's conversion key — see `packages/domain`, never the units table. */
	readonly code: string;
	readonly abbreviation: string;
	readonly unitName: string;
	/** Which kind of quantity it measures, so a field can offer only what it takes. */
	readonly unitType: UnitType;
	/**
	 * Which family it belongs to. Read by the unit-defaults sheet, which groups a
	 * type's units by system before name so metric and imperial do not interleave.
	 */
	readonly unitSystem: 'si' | 'imperial' | 'us_customary';
}

/** The `unit_type` enum, as the domain's field predicates spell it. */
export type UnitType =
	| 'weight'
	| 'distance'
	| 'area'
	| 'volume'
	| 'temperature'
	| 'duration'
	| 'count'
	| 'speed';

export function useUnitLabels(): {
	readonly all: readonly UnitLabel[];
	readonly byId: ReadonlyMap<string, UnitLabel>;
	readonly byCode: ReadonlyMap<string, UnitLabel>;
} {
	const result = useLiveSuspenseQuery(
		(query) =>
			query.from({ unit: units() }).select(({ unit }) => ({
				id: unit.id,
				code: unit.code,
				abbreviation: unit.abbreviation,
				unitName: unit.unit_name,
				unitType: unit.unit_type,
				unitSystem: unit.unit_system,
			})),
		[],
	);

	const rows = result.data;

	return useMemo(
		() => ({
			all: rows,
			byId: new Map(rows.map((unit) => [unit.id, unit] as const)),
			byCode: new Map(rows.map((unit) => [unit.code, unit] as const)),
		}),
		[rows],
	);
}
