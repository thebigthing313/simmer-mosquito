/**
 * While a Treatment names the Formulation it was mixed from, its live lines are
 * exactly that recipe scaled to the mix amount (ADR 0020).
 *
 * The server recomputes the expected lines with the same
 * `calculateFormulationComponentAmounts` the form uses, from the same rows, and
 * compares them exactly: a JSON round trip preserves a double, so a form that
 * computed its lines from the recipe it loaded matches, and a recipe edited
 * between the load and the save is a 400 the form answers by recomputing.
 *
 * Which writes run it is the caller's decision, not this module's. It runs
 * only when a write changes the Formulation reference, the mix amount, the set
 * of live lines, or a live line's Insecticide, amount or unit, so a batch-only
 * revise on a Treatment whose recipe was edited after it was saved goes
 * through: the saved lines are the record of the recipe as it stood.
 * `docs/treatment-spec.md`, "When the recipe check runs", is the rule.
 */

import { ReferenceRefusedError } from '@simmer-mosquito/db';
import {
	calculateFormulationComponentAmounts,
	DomainValidationError,
	type DomainValidationIssue,
} from '@simmer-mosquito/domain';
import type { ControlOperationsTransaction } from './shared.js';

const RECIPE_MISMATCH = "The treatment's chemical applications do not match its formulation.";

/**
 * Refuse a Treatment whose live lines are not its Formulation's recipe.
 *
 * `lineOrder` is the order the client sent the lines in, so a refusal names the
 * line as `applications.N.…` and lands on the row it came from. A header-only
 * write sent no lines, and the stored order stands in for it.
 *
 * @throws DomainValidationError naming the first line that differs, or the
 * product the lines are missing, or `mixUnitId` when the mix is not in the
 * Formulation's batch unit.
 */
export async function assertTreatmentRecipe(
	trx: ControlOperationsTransaction,
	input: {
		readonly treatmentId: string;
		readonly organizationId: string;
		readonly lineOrder: readonly string[] | null;
	},
): Promise<void> {
	const { treatmentId, organizationId } = input;
	const treatment = await trx
		.selectFrom('treatments')
		.select(['formulation_id', 'mix_amount', 'mix_unit_id'])
		.where('id', '=', treatmentId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (
		treatment === undefined ||
		treatment.formulation_id === null ||
		treatment.mix_amount === null
	) {
		return;
	}

	const formulation = await trx
		.selectFrom('formulations')
		.select(['formulation_name', 'batch_size', 'batch_unit_id'])
		.where('id', '=', treatment.formulation_id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (formulation === undefined) {
		throw new ReferenceRefusedError('formulation', 'missing', 'formulation');
	}
	if (treatment.mix_unit_id !== formulation.batch_unit_id) {
		refuse({
			path: 'mixUnitId',
			message: `The mix amount has to be in the batch unit of ${formulation.formulation_name}.`,
		});
	}

	const components = await trx
		.selectFrom('formulation_insecticides')
		.innerJoin('insecticides', 'insecticides.id', 'formulation_insecticides.insecticide_id')
		.select([
			'formulation_insecticides.insecticide_id',
			'formulation_insecticides.amount',
			'formulation_insecticides.unit_id',
			'insecticides.trade_name',
		])
		.where('formulation_insecticides.formulation_id', '=', treatment.formulation_id)
		.where('formulation_insecticides.organization_id', '=', organizationId)
		.where('formulation_insecticides.deleted_at', 'is', null)
		.orderBy('formulation_insecticides.created_at')
		.orderBy('formulation_insecticides.id')
		.execute();
	if (components.length === 0) {
		refuse({
			path: 'formulationId',
			message: `${formulation.formulation_name} lists no insecticides, so a treatment cannot be mixed from it.`,
		});
	}

	const expected = calculateFormulationComponentAmounts({
		totalAmount: treatment.mix_amount,
		batchSize: formulation.batch_size,
		components: components.map((component) => ({
			insecticideId: component.insecticide_id,
			amount: component.amount,
			unitId: component.unit_id,
		})),
	});
	const expectedByInsecticide = new Map(expected.map((line) => [line.insecticideId, line]));

	const lines = orderLines(
		await trx
			.selectFrom('applications')
			.select(['id', 'insecticide_id', 'amount_applied', 'application_unit_id'])
			.where('treatment_id', '=', treatmentId)
			.where('organization_id', '=', organizationId)
			.where('deleted_at', 'is', null)
			.orderBy('created_at')
			.orderBy('id')
			.execute(),
		input.lineOrder,
	);

	lines.forEach((line, index) => {
		const path = `applications.${index}`;
		const component = expectedByInsecticide.get(line.insecticide_id);
		if (component === undefined) {
			refuse({
				path: `${path}.insecticide_id`,
				message: `This insecticide is not in ${formulation.formulation_name}. To add a product the recipe does not list, record the treatment product by product.`,
			});
		}
		if (line.application_unit_id !== component.unitId) {
			refuse({
				path: `${path}.application_unit_id`,
				message: `${formulation.formulation_name} measures this insecticide in a different unit.`,
			});
		}
		if (line.amount_applied !== component.amount) {
			refuse({
				path: `${path}.amount_applied`,
				message: `${formulation.formulation_name} at this mix amount takes ${component.amount} of this insecticide, not ${line.amount_applied}. Recompute the lines from the current recipe.`,
			});
		}
	});

	const lined = new Set(lines.map((line) => line.insecticide_id));
	const missing = components.find((component) => !lined.has(component.insecticide_id));
	if (missing !== undefined) {
		refuse({
			path: 'applications',
			message: `${formulation.formulation_name} includes ${missing.trade_name}, and this treatment has no line for it.`,
		});
	}
}

/** The stored lines in the order the client sent them, when it sent any. */
function orderLines<TLine extends { readonly id: string }>(
	lines: readonly TLine[],
	order: readonly string[] | null,
): readonly TLine[] {
	if (order === null) {
		return lines;
	}
	const position = new Map(order.map((id, index) => [id, index]));
	return [...lines].sort(
		(left, right) =>
			(position.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
			(position.get(right.id) ?? Number.MAX_SAFE_INTEGER),
	);
}

function refuse(issue: DomainValidationIssue): never {
	throw new DomainValidationError(RECIPE_MISMATCH, [issue]);
}
