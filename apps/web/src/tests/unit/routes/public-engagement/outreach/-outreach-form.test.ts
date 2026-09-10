/** @vitest-environment jsdom */

/**
 * Where a refused outreach save puts its message.
 *
 * The three rules below were written twice: once by the domain builder, which
 * says which field is wrong, and once as a chain of `throw new Error` in the
 * form's `onSubmit`, which put a bare string in the page alert. Only the builder
 * runs now, and each rule is asserted on the field it belongs to.
 */

import { describe, expect, it } from 'vitest';
import {
	noTechnicianValue,
	type OutreachFormValues,
	validateOutreach,
} from '../../../../../routes/public-engagement/outreach/-outreach-form';

const POINT = { type: 'Point', coordinates: [-118.24, 34.05] } as const;
const METHOD = '44444444-4444-4444-8444-444444444444';

function values(overrides: Partial<OutreachFormValues> = {}): OutreachFormValues {
	return {
		addressId: null,
		outreachMethodId: METHOD,
		technicianProfileId: noTechnicianValue,
		additionalPersonnelIds: [],
		outreachDate: '2026-08-12',
		reach: 42,
		reachDescription: '',
		metadata: null,
		comment: '',
		...overrides,
	};
}

function validate(overrides: Partial<OutreachFormValues>) {
	return validateOutreach(values(overrides), POINT, true);
}

describe('an outreach action the domain refuses', () => {
	it('passes a complete record', () => {
		expect(validateOutreach(values(), POINT, true)).toBeUndefined();
	});

	it('names the method on the method field', () => {
		const result = validate({ outreachMethodId: '' });

		expect(result?.fields?.outreachMethodId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names an unfilled reach on the reach field', () => {
		const result = validate({ reach: null });

		expect(result?.fields?.reach).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	it('names the date on the date field', () => {
		const result = validate({ outreachDate: '' });

		expect(result?.fields?.outreachDate).toBeDefined();
		expect(result?.form).toBeUndefined();
	});
});
