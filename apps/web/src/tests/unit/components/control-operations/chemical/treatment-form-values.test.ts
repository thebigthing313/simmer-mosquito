/** @vitest-environment jsdom */

/**
 * The Treatment form's rules and its product rows (#1753).
 *
 * The rows are checked before the domain builder runs, so a repeated product
 * reads "X is already line 1" on its row. Everything else is
 * `recordTreatmentCommand`, with each `applications.N` issue mapped onto row N.
 * The line helpers are the form's whole model of the list: adding, removing a
 * saved row until Save, filling and recomputing from a recipe, and putting a
 * server refusal on the row it names.
 */

import { CommandError } from '@simmer-mosquito/sync';
import { describe, expect, it } from 'vitest';
import {
	noSelectionValue,
	type TreatmentFormValues,
	treatmentSaveInput,
	validateTreatment,
} from '../../../../../components/control-operations/chemical/treatment-form-values';
import {
	keepLine,
	lineFieldForIssue,
	linesFromRecipe,
	recomputeLines,
	removeLine,
	type TreatmentLineValue,
	type TreatmentRecipe,
} from '../../../../../components/control-operations/chemical/treatment-line-values';
import {
	recipeChangedMessage,
	treatmentSaveRefusal,
} from '../../../../../components/control-operations/chemical/treatment-save-refusal';
import type {
	FormulationComponentListing,
	FormulationListing,
	InsecticideListing,
} from '../../../../../hooks/queries/chemical-roster-view';

const POINT = { type: 'Point', coordinates: [-118.24, 34.05] } as const;
const ALTOSID = '44444444-4444-4444-8444-444444444444';
const VECTOBAC = '45454545-4545-4545-8545-454545454545';
const GALLON = '55555555-5555-4555-8555-555555555555';
const OUNCE = '56565656-5656-4656-8656-565656565656';
const FORMULATION = '66666666-6666-4666-8666-666666666666';
const LINE_A = 'a1111111-1111-4111-8111-111111111111';
const LINE_B = 'b2222222-2222-4222-8222-222222222222';

const INSECTICIDES: readonly InsecticideListing[] = [
	{ id: ALTOSID, tradeName: 'Altosid XR-G', isActive: true, defaultUnitId: GALLON },
	{ id: VECTOBAC, tradeName: 'VectoBac 12AS', isActive: true, defaultUnitId: OUNCE },
];

const MIX_A: FormulationListing = {
	id: FORMULATION,
	formulationName: 'Mix A',
	isActive: true,
	batchSize: 26,
	batchUnitId: GALLON,
};

function component(insecticideId: string, amount: number, unitId: string) {
	return {
		id: `c-${insecticideId}`,
		formulationId: FORMULATION,
		insecticideId,
		amount,
		unitId,
	} satisfies FormulationComponentListing;
}

const RECIPE: TreatmentRecipe = {
	formulation: MIX_A,
	components: [component(ALTOSID, 2, GALLON), component(VECTOBAC, 13, OUNCE)],
};
const NO_RECIPE: TreatmentRecipe = { formulation: undefined, components: [] };

function line(overrides: Partial<TreatmentLineValue> = {}): TreatmentLineValue {
	return {
		id: LINE_A,
		insecticideId: ALTOSID,
		amount: 12,
		unitId: GALLON,
		batchIds: [],
		stored: false,
		removed: false,
		savedBatchCount: 0,
		...overrides,
	};
}

function values(overrides: Partial<TreatmentFormValues> = {}): TreatmentFormValues {
	return {
		entry: 'products',
		formulationId: '',
		mixAmount: null,
		lines: [line()],
		applicationDate: '2026-08-12',
		applicationMethodId: noSelectionValue,
		applicatorProfileId: noSelectionValue,
		additionalPersonnelIds: [],
		vehicleId: noSelectionValue,
		equipmentId: noSelectionValue,
		addressId: null,
		habitatId: null,
		metadata: null,
		comment: '',
		...overrides,
	};
}

function validate(overrides: Partial<TreatmentFormValues>, recipe: TreatmentRecipe = NO_RECIPE) {
	return validateTreatment(values(overrides), POINT, recipe, INSECTICIDES);
}

describe('a Treatment the form refuses', () => {
	it('passes a complete one-product Treatment', () => {
		expect(validate({})).toBeUndefined();
	});

	it('refuses a repeated product on its row, naming the line it repeats', () => {
		const result = validate({
			lines: [line(), line({ id: LINE_B, amount: 3 })],
		});

		expect(result?.fields?.['lines[1].insecticideId']).toBe(
			'Altosid XR-G is already line 1. Put these batches on that line.',
		);
	});

	it('numbers the repeated line among the live rows, skipping a removed one', () => {
		const result = validate({
			lines: [
				line({ id: 'removed', insecticideId: VECTOBAC, stored: true, removed: true }),
				line(),
				line({ id: LINE_B }),
			],
		});

		expect(result?.fields?.['lines[2].insecticideId']).toBe(
			'Altosid XR-G is already line 1. Put these batches on that line.',
		);
	});

	it('names a row with no product or no amount on that row', () => {
		const result = validate({
			lines: [
				line({ insecticideId: '' }),
				line({ id: LINE_B, insecticideId: VECTOBAC, amount: null }),
			],
		});

		expect(result?.fields?.['lines[0].insecticideId']).toBe('Pick a product.');
		expect(result?.fields?.['lines[1].amount']).toBe('Enter the amount applied.');
	});

	it('names the date on the date field', () => {
		expect(validate({ applicationDate: '' })?.fields?.applicationDate).toBeDefined();
	});

	it('asks for a Formulation and a mix total under formulation entry', () => {
		const result = validate({ entry: 'formulation' });

		expect(result?.fields?.formulationId).toBe('Pick a formulation.');
		expect(result?.fields?.mixAmount).toBe('Enter the total mix applied.');
	});

	it('passes a Formulation Treatment whose rows are the recipe', () => {
		const lines = linesFromRecipe([], RECIPE, 78);

		expect(
			validate({ entry: 'formulation', formulationId: FORMULATION, mixAmount: 78, lines }, RECIPE),
		).toBeUndefined();
	});
});

describe('the product rows', () => {
	it('drops a new row, and strikes a saved one through until it is kept', () => {
		const lines = [line({ stored: true, savedBatchCount: 2 }), line({ id: LINE_B })];

		const removed = removeLine(removeLine(lines, LINE_B), LINE_A);
		expect(removed).toEqual([line({ stored: true, savedBatchCount: 2, removed: true })]);
		expect(keepLine(removed, LINE_A)[0]?.removed).toBe(false);
	});

	it('fills one row per recipe component at the unrounded scaled amount', () => {
		const lines = linesFromRecipe([], RECIPE, 78);

		// 78 gal of a 26 gal batch is three batches: 3 × 2 gal and 3 × 13 oz.
		expect(lines.map((row) => [row.insecticideId, row.amount, row.unitId])).toEqual([
			[VECTOBAC, 39, OUNCE],
			[ALTOSID, 6, GALLON],
		]);
	});

	it('shows the saved rows as removed when a different Formulation replaces them', () => {
		const lines = linesFromRecipe([line({ stored: true })], RECIPE, 78);

		expect(lines[0]).toMatchObject({ id: LINE_A, removed: true });
		expect(lines.filter((row) => !row.removed)).toHaveLength(2);
	});

	it('keeps each product row, id and lots when the mix total changes', () => {
		const filled = linesFromRecipe([], RECIPE, 78).map((row) => ({
			...row,
			batchIds: [`lot-${row.insecticideId}`],
		}));

		const recomputed = recomputeLines(filled, RECIPE, 26);

		expect(recomputed.map((row) => row.id)).toEqual(filled.map((row) => row.id));
		expect(recomputed.map((row) => row.amount)).toEqual([13, 2]);
		expect(recomputed.map((row) => row.batchIds)).toEqual(filled.map((row) => row.batchIds));
	});

	it('lands an issue on applications.N on the Nth live row', () => {
		const lines = [
			line({ id: 'removed', stored: true, removed: true }),
			line(),
			line({ id: LINE_B }),
		];

		expect(lineFieldForIssue(lines, 'applications.1.insecticide_id')).toBe(
			'lines[2].insecticideId',
		);
		expect(lineFieldForIssue(lines, 'applications.0.amount_applied')).toBe('lines[1].amount');
		expect(lineFieldForIssue(lines, 'applicationDate')).toBeNull();
	});
});

describe('a refused save', () => {
	const refusal = (body: Record<string, unknown>) =>
		new CommandError('Record treatment command is invalid.', 400, {
			error: 'invalid_command',
			...body,
		});

	it('puts a 400 naming applications.N on row N+1', () => {
		const form = values({ lines: [line(), line({ id: LINE_B, insecticideId: VECTOBAC })] });

		const result = treatmentSaveRefusal(
			refusal({ issues: [{ path: 'applications.1.insecticide_id', message: 'Retired.' }] }),
			form,
			() => NO_RECIPE,
		);

		expect(result.fields).toEqual({ 'lines[1].insecticideId': 'Retired.' });
		expect(result.lines).toBeNull();
	});

	it('recomputes the rows from the current recipe when the recipe check refuses', () => {
		const stale = linesFromRecipe(
			[],
			{ ...RECIPE, components: [component(ALTOSID, 2, GALLON)] },
			78,
		);
		const form = values({
			entry: 'formulation',
			formulationId: FORMULATION,
			mixAmount: 78,
			lines: stale,
		});

		const result = treatmentSaveRefusal(
			refusal({ issues: [{ path: 'applications', message: 'Mix A includes VectoBac 12AS.' }] }),
			form,
			() => RECIPE,
		);

		expect((result.error as Error).message).toBe(recipeChangedMessage);
		expect(result.lines?.map((row) => row.insecticideId)).toEqual([ALTOSID, VECTOBAC]);
		expect(result.lines?.[0]?.id).toBe(stale[0]?.id);
	});

	it('leaves anything but a 400 as it was', () => {
		const error = new Error('offline');

		expect(treatmentSaveRefusal(error, values(), () => NO_RECIPE)).toEqual({
			error,
			fields: {},
			lines: null,
		});
	});
});

describe('the save input', () => {
	it('sends the live rows and the Formulation set only under formulation entry', () => {
		const lines = [...linesFromRecipe([line({ stored: true })], RECIPE, 78)];

		const input = treatmentSaveInput(
			values({ entry: 'formulation', formulationId: FORMULATION, mixAmount: 78, lines }),
			RECIPE,
		);

		expect(input.mix).toEqual({ formulationId: FORMULATION, mixAmount: 78, mixUnitId: GALLON });
		expect(input.lines.map((row) => row.id)).not.toContain(LINE_A);
		expect(treatmentSaveInput(values(), NO_RECIPE).mix).toBeNull();
	});
});
