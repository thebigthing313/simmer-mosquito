/**
 * How much of each product went out over a window.
 *
 * Reads the Treatments dated in the window, then each one's lines through the
 * correlated include in `treatment-lines.ts`: a line carries no date, so the
 * window is the Treatment's. The roll-up is over lines, because the product is
 * the thing counted here: a Treatment that put out two products adds one
 * Chemical Application to each.
 *
 * Totals are kept per unit rather than summed across them: the same product can
 * be recorded in gallons on one job and pounds on the next, and adding those
 * together would report a quantity that was never applied. `usageTotal` in
 * `components/control-operations/control-display.tsx` is what decides, per
 * product, whether the units convert into one honest number or have to stay
 * separated.
 *
 * The roll-up is a plain fold rather than a `sum()` aggregate because the shape
 * it builds is a map of maps, product to unit to total, and a query returns
 * rows. The product name is still joined, so the caller sorts by a name it was
 * handed.
 */

import { gte, useLiveQuery } from '@tanstack/react-db';
import { treatments } from '../../lib/collections/treatments';
import { PERFORMED_ACTIONS } from './performed-action-reads';
import { liveQueryGcTimeMs } from './shared';
import { linesOf, type TreatmentLine, treatmentLines } from './treatment-lines';

const treatmentReads = PERFORMED_ACTIONS.treatments;

/** One product's total over the window, per unit it was measured in. */
export interface InsecticideUsage {
	readonly insecticideId: string;
	/** `null` while the product is not in the client. */
	readonly name: string | null;
	readonly totalsByUnitId: ReadonlyMap<string, number>;
	/** The Chemical Applications naming this product: one per Treatment that put it out. */
	readonly applicationCount: number;
}

export function useInsecticideUsage(sinceDate: string): {
	readonly usage: readonly InsecticideUsage[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ treatment: treatments() })
				.where(({ treatment }) => gte(treatmentReads.date(treatment), sinceDate))
				.select(({ treatment }) => ({
					id: treatment.id,
					lines: treatmentLines(query, treatment),
				})),
	});

	const usage = usageByInsecticide(result.data.flatMap((row) => linesOf(row.lines)));

	return { usage, isReady: result.isReady, isError: result.isError };
}

/** The window's lines rolled up per insecticide, one total per unit. */
function usageByInsecticide(lines: readonly TreatmentLine[]): readonly InsecticideUsage[] {
	const byInsecticide = new Map<
		string,
		{ name: string | null; totals: Map<string, number>; count: number }
	>();
	for (const line of lines) {
		const entry = byInsecticide.get(line.insecticideId) ?? {
			name: line.insecticideName,
			totals: new Map<string, number>(),
			count: 0,
		};
		entry.totals.set(line.unitId, (entry.totals.get(line.unitId) ?? 0) + line.amount);
		entry.count += 1;
		byInsecticide.set(line.insecticideId, entry);
	}
	return [...byInsecticide.entries()].map(([insecticideId, entry]) => ({
		insecticideId,
		name: entry.name,
		totalsByUnitId: entry.totals,
		applicationCount: entry.count,
	}));
}
