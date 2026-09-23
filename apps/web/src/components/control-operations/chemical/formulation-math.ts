import {
	calculateFormulationComponentAmounts,
	DomainValidationError,
	type FormulationComponentAmount,
} from '@simmer-mosquito/domain';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { unreadable } from '../../../lib/unreadable-input';

/**
 * Reading a formulation: what one batch of a mix takes, and what an application
 * of it works out to. One batch makes `batchSize` of finished mix and takes
 * `amount` of each product, each in the unit it was entered in. The scaling is
 * the domain's own helper.
 */

/** One product's share of a mix, structural so both read paths satisfy it. */
export interface FormulationComponentAmounts {
	readonly insecticideId: string;
	readonly amount: number;
	readonly unitId: string;
}

/** Components in display order, largest first, so the main product leads. */
export function sortedComponents<TComponent extends FormulationComponentAmounts>(
	components: readonly TComponent[],
): readonly TComponent[] {
	return [...components].sort((first, second) => second.amount - first.amount);
}

/**
 * Scale a mix's components to the amount applied, or `null` when that is not
 * yet a mix that can be scaled. Callers render a hint instead of a breakdown.
 */
export function componentAmounts(input: {
	readonly components: readonly FormulationComponentAmounts[];
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

/** `0.5`, `26`, `1.5`: a recipe amount with no trailing zeros. */
export function formatAmountValue(value: number): string {
	return trimNumber(value, 4);
}

/** `0.5 lb`: an amount against its unit, or bare when the unit is unknown. */
export function formatAmountWithUnit(value: number, unit: UnitLabel | undefined): string {
	const amount = formatAmountValue(value);
	return unit === undefined ? amount : `${amount} ${unit.abbreviation}`;
}

/**
 * The same shape as `formatAmount` in `lib/format-count` without the thousands
 * separator, because a recipe amount is typed back into a mix. Hands back the
 * value it cannot render, per `lib/unreadable-input`.
 */
function trimNumber(value: number, maxDecimals: number): string {
	if (!Number.isFinite(value)) {
		return unreadable('trimNumber', value);
	}
	return Number.parseFloat(value.toFixed(maxDecimals)).toString();
}
