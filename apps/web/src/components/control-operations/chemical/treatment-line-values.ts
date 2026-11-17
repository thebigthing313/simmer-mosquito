import { newRecordId } from '../../../hooks/mutations/shared';
import type {
	FormulationComponentListing,
	FormulationListing,
	InsecticideListing,
} from '../../../hooks/queries/chemical-roster-view';
import { insecticideDisplayName } from '../control-display';
import { componentAmounts, sortedComponents } from './formulation-math';

/**
 * A Treatment's product list as the form holds it: one row per Chemical
 * Application, numbered among the live rows. A saved row the crew took out
 * stays in the list as `removed` until Save, so the form can strike it through
 * and offer Keep.
 */
export interface TreatmentLineValue {
	/** The Chemical Application's id: stored on edit, minted for a new row. */
	readonly id: string;
	/** An insecticide id, or '' while the row has none. */
	readonly insecticideId: string;
	readonly amount: number | null;
	/** A unit id, or '' while the row has none. */
	readonly unitId: string;
	/** The lots this product drew from. */
	readonly batchIds: readonly string[];
	/** Saved on the Treatment. A new row is not. */
	readonly stored: boolean;
	/** A saved row the crew took out; it leaves the set on Save. */
	readonly removed: boolean;
	/** How many batch links the saved row holds, which go with it when it is removed. */
	readonly savedBatchCount: number;
}

/** The Formulation a mix is read from, and its rows. */
export interface TreatmentRecipe {
	readonly formulation: FormulationListing | undefined;
	readonly components: readonly FormulationComponentListing[];
}

export function blankLine(): TreatmentLineValue {
	return {
		id: newRecordId(),
		insecticideId: '',
		amount: null,
		unitId: '',
		batchIds: [],
		stored: false,
		removed: false,
		savedBatchCount: 0,
	};
}

/** The rows that save, in order. Their positions are the `applications.N` the server names. */
export function liveLines(lines: readonly TreatmentLineValue[]): readonly TreatmentLineValue[] {
	return lines.filter((line) => !line.removed);
}

/**
 * Take a row out. A saved row is marked removed so it can be kept again; a new
 * one is dropped, since nothing was stored for it.
 */
export function removeLine(
	lines: readonly TreatmentLineValue[],
	lineId: string,
): readonly TreatmentLineValue[] {
	return lines.flatMap((line) => {
		if (line.id !== lineId) {
			return [line];
		}
		return line.stored ? [{ ...line, removed: true }] : [];
	});
}

/** Put a removed saved row back. */
export function keepLine(
	lines: readonly TreatmentLineValue[],
	lineId: string,
): readonly TreatmentLineValue[] {
	return lines.map((line) => (line.id === lineId ? { ...line, removed: false } : line));
}

/** One recipe component's amount at this mix total, or `null` while it does not scale. */
function recipeAmounts(recipe: TreatmentRecipe, mixAmount: number | null) {
	const ordered = sortedComponents(recipe.components);
	const amounts =
		recipe.formulation === undefined
			? null
			: componentAmounts({
					components: ordered,
					batchSize: recipe.formulation.batchSize,
					totalAmount: mixAmount,
				});
	return ordered.map((component) => {
		const amount = amounts?.find((row) => row.insecticideId === component.insecticideId);
		return {
			insecticideId: component.insecticideId,
			unitId: amount?.unitId ?? component.unitId,
			amount: amount?.amount ?? null,
		};
	});
}

/**
 * A newly picked Formulation's rows in place of the ones there: one row per
 * component, the saved rows shown as removed, and the lots of a dropped new row
 * carried to the recipe row for the same product.
 *
 * Amounts are `calculateFormulationComponentAmounts`'s, unrounded, because the
 * server compares them to its own with exact equality.
 */
export function linesFromRecipe(
	lines: readonly TreatmentLineValue[],
	recipe: TreatmentRecipe,
	mixAmount: number | null,
): readonly TreatmentLineValue[] {
	const droppedBatches = new Map(
		lines
			.filter((line) => !line.stored && line.insecticideId !== '')
			.map((line) => [line.insecticideId, line.batchIds] as const),
	);
	return [
		...lines.filter((line) => line.stored).map((line) => ({ ...line, removed: true })),
		...recipeAmounts(recipe, mixAmount).map((component) => ({
			...blankLine(),
			insecticideId: component.insecticideId,
			unitId: component.unitId,
			amount: component.amount,
			batchIds: droppedBatches.get(component.insecticideId) ?? [],
		})),
	];
}

/**
 * The live rows recomputed from the current recipe at this mix total, keeping
 * each product's row, id and lots. A product the recipe no longer lists leaves
 * the set, and one it has gained gets a new row. What a mix total change and a
 * recipe-mismatch refusal both run.
 */
export function recomputeLines(
	lines: readonly TreatmentLineValue[],
	recipe: TreatmentRecipe,
	mixAmount: number | null,
): readonly TreatmentLineValue[] {
	const components = recipeAmounts(recipe, mixAmount);
	const inRecipe = new Set(components.map((component) => component.insecticideId));
	const kept = lines.flatMap((line) => {
		if (line.removed || inRecipe.has(line.insecticideId)) {
			return [line];
		}
		return line.stored ? [{ ...line, removed: true }] : [];
	});
	const live = new Map(
		kept.filter((line) => !line.removed).map((line) => [line.insecticideId, line] as const),
	);
	const recomputed = kept.map((line) => {
		const component = components.find((row) => row.insecticideId === line.insecticideId);
		return line.removed || component === undefined
			? line
			: { ...line, amount: component.amount, unitId: component.unitId };
	});
	const added = components
		.filter((component) => !live.has(component.insecticideId))
		.map((component) => ({
			...blankLine(),
			insecticideId: component.insecticideId,
			unitId: component.unitId,
			amount: component.amount,
		}));
	return [...recomputed, ...added];
}

/** A product's name for a row or a refusal. */
export function productLabel(
	insecticides: readonly InsecticideListing[],
	insecticideId: string,
): string {
	const insecticide = insecticides.find((row) => row.id === insecticideId);
	return insecticide === undefined ? 'Unknown insecticide' : insecticideDisplayName(insecticide);
}

/** The form field a row's value sits in. */
export function lineFieldName(
	index: number,
	field: 'insecticideId' | 'amount' | 'unitId' | 'batchIds',
): `lines[${number}].${typeof field}` {
	return `lines[${index}].${field}`;
}

/**
 * The refusals a row can be told before anything is sent, keyed by the form
 * field each lands on. A repeated Insecticide names the line it repeats,
 * numbered among the live rows as the list draws them.
 */
export function lineRefusals(
	lines: readonly TreatmentLineValue[],
	insecticides: readonly InsecticideListing[],
): Record<string, string> {
	const refusals: Record<string, string> = {};
	const firstLive = new Map<string, number>();
	let liveNumber = 0;
	lines.forEach((line, index) => {
		if (line.removed) {
			return;
		}
		liveNumber += 1;
		if (line.insecticideId === '') {
			refusals[lineFieldName(index, 'insecticideId')] = 'Pick a product.';
			return;
		}
		const earlier = firstLive.get(line.insecticideId);
		if (earlier !== undefined) {
			refusals[lineFieldName(index, 'insecticideId')] =
				`${productLabel(insecticides, line.insecticideId)} is already line ${earlier}. Put these batches on that line.`;
			return;
		}
		firstLive.set(line.insecticideId, liveNumber);
		if (line.amount === null) {
			refusals[lineFieldName(index, 'amount')] = 'Enter the amount applied.';
		}
		if (line.unitId === '') {
			refusals[lineFieldName(index, 'unitId')] = 'Pick a unit.';
		}
	});
	return refusals;
}

/**
 * The form field a server issue on `applications.N.<column>` lands on: the
 * Nth live row, so row N+1 as the list numbers them. `null` for an issue that
 * names no row.
 */
export function lineFieldForIssue(
	lines: readonly TreatmentLineValue[],
	path: string,
): string | null {
	const match = /^applications\.(\d+)(?:\.(\w+))?/.exec(path);
	if (match === null) {
		return null;
	}
	const live = liveLines(lines)[Number(match[1])];
	if (live === undefined) {
		return null;
	}
	const index = lines.indexOf(live);
	switch (match[2]) {
		case 'amount_applied':
			return lineFieldName(index, 'amount');
		case 'application_unit_id':
			return lineFieldName(index, 'unitId');
		case 'application_batches':
			return lineFieldName(index, 'batchIds');
		default:
			return lineFieldName(index, 'insecticideId');
	}
}

/** Whether a server issue is the recipe check's: a row's product, unit or amount, or a missing product. */
export function isRecipeIssue(path: string): boolean {
	return (
		path === 'applications' ||
		/^applications\.\d+\.(insecticide_id|application_unit_id|amount_applied)$/.test(path)
	);
}
