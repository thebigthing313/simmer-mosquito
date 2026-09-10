/** @vitest-environment jsdom */

/**
 * Where a refused chemical application save puts its message.
 *
 * This form carried the longest hand-rolled channel of the sixteen: 27 lines
 * re-checking the product, the amount, the unit and the date the domain builder
 * already holds, throwing a bare string into the page alert. Only the builder
 * runs now, and both entry modes are asserted, since a mix is validated as the
 * applications it expands into rather than as itself.
 */

import { describe, expect, it } from 'vitest';
import type { FormulationComponentListing } from '../../../../../hooks/queries/use-chemical-rosters';
import {
	type ApplicationFormValues,
	type ApplicationMix,
	noSelectionValue,
	validateApplication,
} from '../../../../../routes/control-operations/chemical/-application-form';

const POINT = { type: 'Point', coordinates: [-118.24, 34.05] } as const;
const INSECTICIDE = '44444444-4444-4444-8444-444444444444';
const UNIT = '55555555-5555-4555-8555-555555555555';
const FORMULATION = '66666666-6666-4666-8666-666666666666';

const COMPONENT: FormulationComponentListing = {
	id: '77777777-7777-4777-8777-777777777777',
	formulationId: FORMULATION,
	insecticideId: INSECTICIDE,
	amount: 0.5,
	unitId: UNIT,
};

/** What the component hands over once a mix is chosen. */
const CHOSEN_MIX: ApplicationMix = { batchSize: 26, components: [COMPONENT] };

/** What it hands over while the formulation select is still empty. */
const NO_MIX: ApplicationMix = { batchSize: Number.NaN, components: [] };

function values(overrides: Partial<ApplicationFormValues> = {}): ApplicationFormValues {
	return {
		productMode: 'insecticide',
		insecticideId: INSECTICIDE,
		formulationId: '',
		amountApplied: 78,
		applicationUnitId: UNIT,
		applicationDate: '2026-08-12',
		applicationMethodId: noSelectionValue,
		applicatorProfileId: noSelectionValue,
		additionalPersonnelIds: [],
		insecticideBatchIds: [],
		componentBatchIds: {},
		vehicleId: noSelectionValue,
		equipmentId: noSelectionValue,
		addressId: null,
		habitatId: null,
		metadata: null,
		comment: '',
		...overrides,
	};
}

function validate(overrides: Partial<ApplicationFormValues>, mix: ApplicationMix = NO_MIX) {
	return validateApplication(values(overrides), POINT, true, mix);
}

describe('a single-product application the domain refuses', () => {
	it('passes a complete record', () => {
		expect(validate({})).toBeUndefined();
	});

	it('names the product on the insecticide field', () => {
		const result = validate({ insecticideId: '' });

		expect(result?.fields?.insecticideId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names an unfilled amount on the amount field', () => {
		const result = validate({ amountApplied: null });

		expect(result?.fields?.amountApplied).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names the unit on the unit field', () => {
		const result = validate({ applicationUnitId: '' });

		expect(result?.fields?.applicationUnitId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names the date on the date field', () => {
		const result = validate({ applicationDate: '' });

		expect(result?.fields?.applicationDate).toBeDefined();
		expect(result?.form).toBeUndefined();
	});
});

describe('a mix the domain refuses', () => {
	const mixed = { productMode: 'formulation', formulationId: FORMULATION } as const;

	it('passes a complete mix', () => {
		expect(validate(mixed, CHOSEN_MIX)).toBeUndefined();
	});

	// An unchosen mix reaches the expansion as no components and no batch size,
	// and both belong to the select the operator has not touched.
	it('names an unchosen mix on the formulation field', () => {
		const result = validate({ ...mixed, formulationId: '' }, NO_MIX);

		expect(result?.fields?.formulationId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names a mix with no products on the formulation field', () => {
		const result = validate(mixed, { batchSize: 26, components: [] });

		expect(result?.fields?.formulationId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names the total on the amount field', () => {
		const result = validate({ ...mixed, amountApplied: null }, CHOSEN_MIX);

		expect(result?.fields?.amountApplied).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names the date on the date field', () => {
		const result = validate({ ...mixed, applicationDate: '' }, CHOSEN_MIX);

		expect(result?.fields?.applicationDate).toBeDefined();
		expect(result?.form).toBeUndefined();
	});
});
