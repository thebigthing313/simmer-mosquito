/**
 * The unit catalog, indexed both ways.
 *
 * For the surfaces that hold an amount and a unit id and have to render the pair
 * — and, where the units convert, total across several of them. That totalling
 * (`usageTotal` in `routes/control-operations/-control-display.tsx`) is what
 * makes this a lookup rather than a join: it works over a `Map` of totals keyed
 * by unit id, and reaches the conversion table by unit *code*, so it needs the
 * catalog indexed by both. A join gives a row its own unit; it cannot give a
 * roll-up every unit its parts were measured in.
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
}

export function useUnitLabels(): {
	readonly byId: ReadonlyMap<string, UnitLabel>;
	readonly byCode: ReadonlyMap<string, UnitLabel>;
} {
	const result = useLiveSuspenseQuery(
		(query) =>
			query.from({ unit: units }).select(({ unit }) => ({
				id: unit.id,
				code: unit.code,
				abbreviation: unit.abbreviation,
			})),
		[],
	);

	const rows = result.data;

	return useMemo(
		() => ({
			byId: new Map(rows.map((unit) => [unit.id, unit] as const)),
			byCode: new Map(rows.map((unit) => [unit.code, unit] as const)),
		}),
		[rows],
	);
}
