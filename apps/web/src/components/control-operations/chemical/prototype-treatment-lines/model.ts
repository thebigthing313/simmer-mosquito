/**
 * PROTOTYPE, throwaway (wayfinder ticket #1743). Lives on the
 * `prototype/treatment-lines-form` branch only and never merges.
 *
 * The in-memory model the three variants share: a Treatment's product lines,
 * the optional Formulation it was mixed from, the two refusals the server
 * enforces on the final line set, and the command body a save would send.
 */

import { newRecordId } from '../../../../hooks/mutations/shared';
import type {
	FormulationComponentListing,
	FormulationListing,
	InsecticideListing,
} from '../../../../hooks/queries/chemical-roster-view';
import type { UnitLabel } from '../../../../hooks/queries/use-unit-labels';
import { productLabel } from '../application-form-values';
import { componentAmounts, sortedComponents } from '../formulation-math';

export interface Line {
	readonly id: string;
	readonly insecticideId: string;
	readonly amount: number | null;
	readonly unitId: string;
	readonly batchIds: readonly string[];
	/** Already saved on the Treatment (edit mode). New lines are not. */
	readonly stored: boolean;
	/** A stored line the crew took out; it leaves the set on save. */
	readonly removed: boolean;
	/** The amount the mix worked out to when the line was filled from it. */
	readonly fromMix: number | null;
}

export interface Mix {
	readonly formulationId: string;
	readonly mixAmount: number | null;
}

export type Mode = 'create' | 'edit';

export interface Catalog {
	readonly insecticides: readonly InsecticideListing[];
	readonly units: readonly UnitLabel[];
	readonly formulations: readonly FormulationListing[];
	readonly components: readonly FormulationComponentListing[];
}

export function blankLine(): Line {
	return {
		id: newRecordId(),
		insecticideId: '',
		amount: null,
		unitId: '',
		batchIds: [],
		stored: false,
		removed: false,
		fromMix: null,
	};
}

/** Two saved lines, the first holding two batch links, to try edits against. */
export function seededEditLines(catalog: Catalog): Line[] {
	const [first, second] = catalog.insecticides.filter((row) => row.isActive);
	const seeded: Line[] = [];
	if (first !== undefined) {
		seeded.push({
			id: newRecordId(),
			insecticideId: first.id,
			amount: 12,
			unitId: first.defaultUnitId,
			batchIds: [SEED_BATCHES[0].value, SEED_BATCHES[1].value],
			stored: true,
			removed: false,
			fromMix: null,
		});
	}
	if (second !== undefined) {
		seeded.push({
			id: newRecordId(),
			insecticideId: second.id,
			amount: 4,
			unitId: second.defaultUnitId,
			batchIds: [],
			stored: true,
			removed: false,
			fromMix: null,
		});
	}
	return seeded;
}

/** Stand-in lots for the seeded edit lines, so a removal has batches to lose. */
export const SEED_BATCHES = [
	{ label: 'LOT-2411 (seeded)', value: 'seed-lot-2411' },
	{ label: 'LOT-2417 (seeded)', value: 'seed-lot-2417' },
] as const;

export function componentsOf(catalog: Catalog, formulationId: string) {
	return catalog.components.filter((row) => row.formulationId === formulationId);
}

export function formulationOf(catalog: Catalog, formulationId: string) {
	return catalog.formulations.find((row) => row.id === formulationId);
}

/** One line per component, scaled to the mix amount. Null amounts until it scales. */
export function linesFromMix(catalog: Catalog, mix: Mix): Line[] {
	const formulation = formulationOf(catalog, mix.formulationId);
	if (formulation === undefined) {
		return [];
	}
	const ordered = sortedComponents(componentsOf(catalog, mix.formulationId));
	const amounts = componentAmounts({
		components: ordered,
		batchSize: formulation.batchSize,
		totalAmount: mix.mixAmount,
	});
	return ordered.map((component) => {
		const amount = amounts?.find((row) => row.insecticideId === component.insecticideId);
		return {
			...blankLine(),
			insecticideId: component.insecticideId,
			unitId: amount?.unitId ?? component.unitId,
			amount: amount === undefined ? null : round(amount.amount),
			fromMix: amount === undefined ? null : round(amount.amount),
		};
	});
}

/** What the mix works out to for one product, or null when it is not in the mix. */
export function mixShare(catalog: Catalog, mix: Mix | null, insecticideId: string): number | null {
	if (mix === null) {
		return null;
	}
	return (
		linesFromMix(catalog, mix).find((line) => line.insecticideId === insecticideId)?.fromMix ?? null
	);
}

export interface Refusals {
	readonly formError: string | null;
	readonly lineErrors: ReadonlyMap<string, string>;
}

/** The rules the server checks on the final set, run here as the form would. */
export function refusalsFor(
	catalog: Catalog,
	lines: readonly Line[],
	mode: Mode,
	serverDuplicate: boolean,
): Refusals {
	const live = lines.filter((line) => !line.removed);
	const lineErrors = new Map<string, string>();
	let formError: string | null = null;
	if (live.length === 0) {
		formError =
			mode === 'create'
				? 'Add at least one product.'
				: 'A treatment keeps at least one product. To remove them all, delete the treatment.';
	}
	live.forEach((line, index) => {
		if (line.insecticideId === '') {
			lineErrors.set(line.id, 'Pick a product.');
			return;
		}
		const earlier = live.findIndex((other) => other.insecticideId === line.insecticideId);
		if (earlier < index) {
			lineErrors.set(
				line.id,
				`${productLabel(catalog.insecticides, line.insecticideId)} is already line ${earlier + 1}. Put these batches on that line.`,
			);
			return;
		}
		if (line.amount === null || line.amount <= 0) {
			lineErrors.set(line.id, 'Enter the amount applied.');
		}
	});
	const second = live[1];
	if (serverDuplicate && second !== undefined) {
		lineErrors.set(
			second.id,
			'The server refused this line: applications.1.insecticide_id repeats a product already on the treatment.',
		);
	}
	return { formError, lineErrors };
}

export function liveCount(lines: readonly Line[]): number {
	return lines.filter((line) => !line.removed).length;
}

/** The request a save would send, per #1740. */
export function commandBody(input: {
	readonly mode: Mode;
	readonly treatmentId: string;
	readonly header: Readonly<Record<string, unknown>>;
	readonly headerTouched: boolean;
	readonly lines: readonly Line[];
	readonly mix: Mix | null;
	readonly mixUnitId: string | null;
}) {
	const rows = input.lines
		.filter((line) => !line.removed)
		.map((line) => ({
			id: line.id,
			insecticide_id: line.insecticideId,
			amount_applied: line.amount,
			application_unit_id: line.unitId,
			application_batches: line.batchIds.map((batchId) => ({
				id: `<${line.stored ? 'kept or new' : 'new'} link id>`,
				insecticide_batch_id: batchId,
			})),
		}));
	const formulation =
		input.mix === null
			? { formulationId: null, mixAmount: null, mixUnitId: null }
			: {
					formulationId: input.mix.formulationId,
					mixAmount: input.mix.mixAmount,
					mixUnitId: input.mixUnitId,
				};
	if (input.mode === 'create') {
		return {
			method: 'POST /commands/treatments',
			intents: ['controlOperations.recordTreatment'],
			treatment: { id: input.treatmentId, ...input.header, ...formulation, applications: rows },
		};
	}
	const intents = [
		...(input.headerTouched ? ['controlOperations.updateTreatmentFieldDetails'] : []),
		'controlOperations.reviseTreatmentLines',
	];
	return {
		method: `PATCH /commands/treatments/${input.treatmentId}`,
		intents,
		...(input.headerTouched ? { fieldDetails: { ...input.header, ...formulation } } : {}),
		applications: rows,
		removedOnSave: input.lines
			.filter((line) => line.removed)
			.map((line) => ({ id: line.id, batchLinksGoing: line.batchIds.length })),
	};
}

function round(value: number): number {
	return Number.parseFloat(value.toFixed(4));
}

/** `1 batch link`, `2 batch links`. */
export function batchPhrase(total: number): string {
	return `${total} batch ${total === 1 ? 'link' : 'links'}`;
}
