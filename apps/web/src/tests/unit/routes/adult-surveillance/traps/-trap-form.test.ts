/** @vitest-environment jsdom */

/**
 * Where a refused trap save puts its message.
 *
 * The collection method was checked twice: by the domain builder, which says
 * which field is wrong, and by a `throw new Error` in the form's `onSubmit`,
 * which put a bare string in the page alert. Only the builder runs now.
 */

import { describe, expect, it } from 'vitest';
import {
	type TrapFormValues,
	validateTrap,
} from '../../../../../routes/adult-surveillance/traps/-trap-form';

const POINT = { type: 'Point', coordinates: [-118.24, 34.05] } as const;
const METHOD = '44444444-4444-4444-8444-444444444444';
const LURE = '55555555-5555-4555-8555-555555555555';

function values(overrides: Partial<TrapFormValues> = {}): TrapFormValues {
	return {
		addressId: null,
		collectionMethodId: METHOD,
		collectionLureId: LURE,
		trapName: 'North yard CO2',
		trapCode: '',
		description: '',
		isActive: true,
		...overrides,
	};
}

describe('a trap the domain refuses', () => {
	it('passes a complete record', () => {
		expect(validateTrap(values(), POINT, true)).toBeUndefined();
	});

	it('names the collection method on the method field', () => {
		const result = validateTrap(values({ collectionMethodId: '' }), POINT, true);

		expect(result?.fields?.collectionMethodId).toBeDefined();
		expect(result?.form).toBeUndefined();
	});

	// An edit does not ask for a redraw, so an untouched trap must not be refused
	// over a point the operator was never shown.
	it('leaves an unredrawn trap alone on edit', () => {
		expect(validateTrap(values(), null, false)).toBeUndefined();
	});
});
