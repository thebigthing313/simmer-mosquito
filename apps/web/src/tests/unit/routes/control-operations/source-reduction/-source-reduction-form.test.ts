/** @vitest-environment jsdom */

/**
 * Where a refused source reduction save puts its message.
 *
 * The form used to run two validation channels. The domain builder attributed
 * each issue to a field, and a hand-rolled `validate()` re-checked the same five
 * rules and threw a bare string into the page alert, which is what the operator
 * read. These are the five, each asserted on the field it belongs to.
 */

import { describe, expect, it } from 'vitest';
import {
	noTechnicianValue,
	type SourceReductionFormValues,
	validateSourceReduction,
} from '../../../../../routes/control-operations/source-reduction/-source-reduction-form';

const POINT = { type: 'Point', coordinates: [-118.24, 34.05] } as const;
const METHOD = '44444444-4444-4444-8444-444444444444';
const UNIT = '55555555-5555-4555-8555-555555555555';

function values(overrides: Partial<SourceReductionFormValues> = {}): SourceReductionFormValues {
	return {
		sourceReductionMethodId: METHOD,
		sourcesEliminatedAmount: 3,
		sourcesEliminatedUnitId: UNIT,
		sourceReductionDate: '2026-08-12',
		technicianProfileId: noTechnicianValue,
		additionalPersonnelIds: [],
		addressId: null,
		habitatId: null,
		metadata: null,
		comment: '',
		...overrides,
	};
}

function validate(overrides: Partial<SourceReductionFormValues>) {
	return validateSourceReduction(values(overrides), POINT, true);
}

describe('a source reduction the domain refuses', () => {
	it('passes a complete record', () => {
		expect(validateSourceReduction(values(), POINT, true)).toBeUndefined();
	});

	it('names the method on the method field', () => {
		const result = validate({ sourceReductionMethodId: '' });

		expect(result?.fields?.sourceReductionMethodId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names an unfilled amount on the amount field', () => {
		const result = validate({ sourcesEliminatedAmount: null });

		expect(result?.fields?.sourcesEliminatedAmount).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names a negative amount on the amount field', () => {
		const result = validate({ sourcesEliminatedAmount: -1 });

		expect(result?.fields?.sourcesEliminatedAmount).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names the unit on the unit field', () => {
		const result = validate({ sourcesEliminatedUnitId: '' });

		expect(result?.fields?.sourcesEliminatedUnitId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names the date on the date field', () => {
		const result = validate({ sourceReductionDate: '' });

		expect(result?.fields?.sourceReductionDate).toBeDefined();
		expect(result?.form).toBeUndefined();
	});
});
