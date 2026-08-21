/**
 * How much of each product went out over a window.
 *
 * Totals are kept per unit rather than summed across them: the same product can
 * be recorded in gallons on one job and pounds on the next, and adding those
 * together would report a quantity that was never applied. `usageTotal` in
 * `routes/control-operations/-control-display.tsx` is what decides, per product,
 * whether the units convert into one honest number or have to stay separated.
 *
 * The roll-up is a `useMemo` rather than a `sum()` aggregate because the shape it
 * builds is a map of maps — product → unit → total — and a query returns rows.
 * The product name is still joined, so the caller sorts by a name it was handed.
 */

import { coalesce, eq, gte, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { applications } from '../../lib/collections/applications';
import { insecticides } from '../../lib/collections/insecticides';
import { activityGcTimeMs } from './shared';

/** One product's total over the window, per unit it was measured in. */
export interface InsecticideUsage {
	readonly insecticideId: string;
	readonly name: string;
	readonly totalsByUnitId: ReadonlyMap<string, number>;
	readonly applicationCount: number;
}

export function useInsecticideUsage(sinceDate: string): {
	readonly usage: readonly InsecticideUsage[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ application: applications })
					.where(({ application }) => gte(application.application_date, sinceDate))
					.join(
						{ product: insecticides },
						({ application, product }) => eq(application.insecticide_id, product.id),
						'left',
					)
					.select(({ application, product }) => ({
						insecticideId: application.insecticide_id,
						name: coalesce(product.trade_name, 'Unknown insecticide'),
						amountApplied: application.amount_applied,
						unitId: application.application_unit_id,
					})),
		},
		[sinceDate],
	);

	const rows = result.data;

	const usage = useMemo<readonly InsecticideUsage[]>(() => {
		const byInsecticide = new Map<
			string,
			{ name: string; totals: Map<string, number>; count: number }
		>();
		for (const row of rows) {
			const entry = byInsecticide.get(row.insecticideId) ?? {
				name: row.name,
				totals: new Map<string, number>(),
				count: 0,
			};
			entry.totals.set(row.unitId, (entry.totals.get(row.unitId) ?? 0) + row.amountApplied);
			entry.count += 1;
			byInsecticide.set(row.insecticideId, entry);
		}
		return [...byInsecticide.entries()].map(([insecticideId, entry]) => ({
			insecticideId,
			name: entry.name,
			totalsByUnitId: entry.totals,
			applicationCount: entry.count,
		}));
	}, [rows]);

	return { usage, isReady: result.isReady, isError: result.isError };
}
