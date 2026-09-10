/** @vitest-environment jsdom */

/**
 * Where a refused biocontrol save puts its message.
 *
 * The four rules below were written twice: once by the domain builder, which
 * says which field is wrong, and once as a chain of `throw new Error` in the
 * form's `onSubmit`, which put a bare string in the page alert. Only the builder
 * runs now, and each rule is asserted on the field it belongs to.
 */

import { describe, expect, it } from 'vitest';
import {
	type BiocontrolFormValues,
	noTechnicianValue,
	validateBiocontrol,
} from '../../../../../routes/control-operations/biocontrol/-biocontrol-form';

const POINT = { type: 'Point', coordinates: [-118.24, 34.05] } as const;
const METHOD = '44444444-4444-4444-8444-444444444444';
const UNIT = '55555555-5555-4555-8555-555555555555';

function values(overrides: Partial<BiocontrolFormValues> = {}): BiocontrolFormValues {
	return {
		addressId: null,
		habitatId: null,
		biocontrolMethodId: METHOD,
		technicianProfileId: noTechnicianValue,
		additionalPersonnelIds: [],
		biocontrolDate: '2026-08-12',
		amountReleased: 400,
		releaseUnitId: UNIT,
		metadata: null,
		comment: '',
		...overrides,
	};
}

function validate(overrides: Partial<BiocontrolFormValues>) {
	return validateBiocontrol(values(overrides), POINT, true);
}

describe('a biocontrol release the domain refuses', () => {
	it('passes a complete record', () => {
		expect(validateBiocontrol(values(), POINT, true)).toBeUndefined();
	});

	it('names the method on the method field', () => {
		const result = validate({ biocontrolMethodId: '' });

		expect(result?.fields?.biocontrolMethodId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names an unfilled amount on the amount field', () => {
		const result = validate({ amountReleased: null });

		expect(result?.fields?.amountReleased).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names the unit on the unit field', () => {
		const result = validate({ releaseUnitId: '' });

		expect(result?.fields?.releaseUnitId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names the date on the date field', () => {
		const result = validate({ biocontrolDate: '' });

		expect(result?.fields?.biocontrolDate).toBeDefined();
		expect(result?.form).toBeUndefined();
	});
});
