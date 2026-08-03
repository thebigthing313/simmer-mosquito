import {
	calculateFormulationComponentAmounts,
	DomainValidationError,
	type FormulationComponentAmount,
} from '@simmer-mosquito/domain';
import type { FormulationInsecticideRow, UnitRow } from '@simmer-mosquito/sync';

/**
 * Reading a formulation: what one batch of a mix takes, and what an application
 * of it works out to.
 *
 * A formulation is a recipe stated the way a label states it — one batch makes
 * `batchSize` of finished mix (26 gallons) and takes `amount` of each product
 * (0.5 pounds). Nothing is dimensionless and nothing is converted: the batch
 * amount and every product amount stay in the unit they were entered in, which
 * is what lets a weight of product come out of a mix measured by volume.
 *
 * The scaling itself is the domain's own helper, so a preview cannot drift from
 * what the save writes.
 */

/** Components in display order — largest first, so the main product leads. */
export function sortedComponents(
	components: readonly FormulationInsecticideRow[],
): readonly FormulationInsecticideRow[] {
	return [...components].sort((first, second) => second.amount - first.amount);
}

/**
 * Scale a mix's components to the amount applied, or `null` when that is not yet
 * a mix that can be scaled — no products, no amount, a batch size the domain
 * rejects. Callers render a hint instead of a breakdown.
 */
export function componentAmounts(input: {
	readonly components: readonly FormulationInsecticideRow[];
	readonly batchSize: number;
	readonly totalAmount: number | null;
}): readonly FormulationComponentAmount[] | null {
	if (input.totalAmount === null || input.components.length === 0) {
		return null;
	}
	try {
		return calculateFormulationComponentAmounts({
			totalAmount: input.totalAmount,
			batchSize: input.batchSize,
			components: input.components.map((component) => ({
				insecticideId: component.insecticideId,
				amount: component.amount,
				unitId: component.unitId,
			})),
		});
	} catch (error) {
		if (error instanceof DomainValidationError) {
			return null;
		}
		throw error;
	}
}

/** `0.5`, `26`, `1.5` — a recipe amount with no trailing zeros. */
export function formatAmountValue(value: number): string {
	return trimNumber(value, 4);
}

/** `0.5 lb` — an amount against its unit, or bare when the unit is unknown. */
export function formatAmountWithUnit(value: number, unit: UnitRow | undefined): string {
	const amount = formatAmountValue(value);
	return unit === undefined ? amount : `${amount} ${unit.abbreviation}`;
}

function trimNumber(value: number, maxDecimals: number): string {
	if (!Number.isFinite(value)) {
		return '—';
	}
	return Number.parseFloat(value.toFixed(maxDecimals)).toString();
}
