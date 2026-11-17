/**
 * A Treatment's lines, as the correlated include every collection-backed
 * reader pulls them through.
 *
 * Not a hook, so not a `use-` file. A Treatment is the visit and each
 * Chemical Application under it is one Insecticide and one amount (ADR 0020).
 * A reader queries `treatments` for the window, habitat or inspection it
 * wants, and selects `lines: treatmentLines(query, treatment.id)` beside the
 * Treatment's own columns. The include's `where` is the line's `treatment_id`
 * alone, which the `applications` collection indexes, so the compiler loads
 * lines by `treatment_id = any(...)` over the Treatments it matched. Nothing
 * here filters or sorts lines by a Treatment column, because that drops the
 * pushdown and loads every line in the Organization.
 *
 * The product and unit names are `left` joins over the two eagerly synced
 * catalogs, so the include holds no second on-demand level.
 *
 * Counting work counts Treatments; counting a product counts lines.
 */

import type { Treatment } from '@simmer-mosquito/sync';
import type { InitialQueryBuilder } from '@tanstack/db';
import { toArray } from '@tanstack/react-db';
import { applications } from '../../lib/collections/applications';
import { insecticides } from '../../lib/collections/insecticides';
import { units } from '../../lib/collections/units';
import type { HasColumn } from './activity-dates';
import { PERFORMED_ACTIONS } from './performed-action-reads';
import { joinedOrNull } from './shared';

const lineReads = PERFORMED_ACTIONS.treatmentLines;

/** One product a Treatment put out, as the include projects it. */
export interface TreatmentLine {
	/** The Chemical Application's own id. */
	readonly id: string;
	readonly insecticideId: string;
	/** `null` while the product is not in the client. */
	readonly insecticideName: string | null;
	readonly amount: number;
	readonly unitId: string;
	/** `null` while the unit is not in the client. */
	readonly unitAbbreviation: string | null;
}

/**
 * The include, for a `select` over `treatments`, correlated on the outer
 * Treatment's ref. Lines come oldest first, which is the order the server's
 * activity rows list them in.
 */
export function treatmentLines(
	query: InitialQueryBuilder,
	treatment: HasColumn<Treatment, 'id'>,
	// Annotated because the inferred type names `ToArrayWrapper`, which
	// `@tanstack/db` does not export, so declaration emit cannot name it.
	// Every caller reads the result through `linesOf`, which narrows it.
): ReturnType<typeof toArray> {
	return toArray(
		query
			.from({ line: applications() })
			.where(({ line }) => lineReads.of(line, treatment))
			.join(
				{ product: insecticides() },
				({ line, product }) => lineReads.joinProduct(line, product),
				'left',
			)
			.join({ unit: units() }, ({ line, unit }) => lineReads.joinUnit(line, unit), 'left')
			.orderBy(({ line }) => line.created_at, 'asc')
			.select(({ line, product, unit }) => {
				const measured = lineReads.measured(line);
				return {
					id: line.id,
					insecticideId: measured.productId,
					insecticideName: joinedOrNull(product.trade_name),
					amount: measured.amount,
					unitId: measured.unitId,
					unitAbbreviation: joinedOrNull(unit.abbreviation),
				};
			}),
	);
}

/**
 * The include arrives typed by the query builder's own aggregate; this
 * narrows it to the projection above.
 */
export function linesOf(included: unknown): readonly TreatmentLine[] {
	return included as readonly TreatmentLine[];
}
