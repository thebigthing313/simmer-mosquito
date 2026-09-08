import { describe, expect, it } from 'vitest';
import {
	errorMessagesFrom,
	isSaveFailure,
	SaveFailure,
	saveFailureAloneBlocksSubmit,
} from '../../../../components/form/form-errors';

/**
 * What reaches this function is whatever TanStack Form put in `state.errors`,
 * and that is not one shape. A field validator returns a string; a form-level
 * validator returns `{ form, fields }`, which the library only unpacks when the
 * `fields` key is present. The cases below are the ones the forms in `apps/web`
 * actually produce.
 */
describe('errorMessagesFrom', () => {
	it('passes a plain string through', () => {
		expect(errorMessagesFrom(['Name is required.'])).toEqual([{ message: 'Name is required.' }]);
	});

	it('reads the form text out of a form-level validator result', () => {
		expect(
			errorMessagesFrom([
				{
					form: 'Geometry must be a GeoJSON geometry object.',
					fields: { name: 'Name is required.' },
				},
			]),
		).toEqual([{ message: 'Geometry must be a GeoJSON geometry object.' }]);
	});

	it('reads the form text when the validator found no field to blame', () => {
		// The shape TanStack Form leaves unrouted: no `fields` key at all. This is
		// the case that used to render the generic fallback instead.
		expect(errorMessagesFrom([{ form: 'Geometry must be a GeoJSON geometry object.' }])).toEqual([
			{ message: 'Geometry must be a GeoJSON geometry object.' },
		]);
	});

	it('says nothing when every issue already sits on a field', () => {
		expect(errorMessagesFrom([{ fields: { name: 'Name is required.' } }])).toEqual([]);
	});

	it('falls back to the generic wording when `fields` names no message', () => {
		// A `fields` key alone is not a reason to stay quiet. Nothing here will
		// reach a field, so an empty alert would lose the failure altogether.
		expect(errorMessagesFrom([{ fields: {} }])).toEqual([{ message: 'Unable to save changes.' }]);
		expect(errorMessagesFrom([{ code: 'unknown', fields: ['name'] }])).toEqual([
			{ message: 'Unable to save changes.' },
		]);
	});

	it('reads an Error thrown into the form', () => {
		expect(errorMessagesFrom([new Error('The server refused the write.')])).toEqual([
			{ message: 'The server refused the write.' },
		]);
	});

	it('flattens nested arrays and drops the empty slots a form leaves', () => {
		expect(
			errorMessagesFrom([null, undefined, false, '', ['Pick a date.', 'Pick a date.']]),
		).toEqual([{ message: 'Pick a date.' }]);
	});

	it('falls back to the generic wording for an object it cannot read', () => {
		expect(errorMessagesFrom([{ code: 'unknown' }])).toEqual([
			{ message: 'Unable to save changes.' },
		]);
	});
});

/**
 * The predicate the save button reads on top of `canSubmit`.
 *
 * A recorded save failure sits in the same error map a failed validation does,
 * so `canSubmit` is false either way. This is what tells the two apart, and it
 * has to read the recorded value rather than count the errors: three
 * `apps/admin` forms wrote a plain string into that map, so the last case here
 * is the bug #754 was filed on.
 */
describe('saveFailureAloneBlocksSubmit', () => {
	function state(errors: readonly unknown[], overrides: Partial<Record<string, boolean>> = {}) {
		return {
			errors,
			isFieldsValid: overrides.isFieldsValid ?? true,
			isFieldsValidating: overrides.isFieldsValidating ?? false,
		};
	}

	it('is true when a recorded save failure is the only error and the fields are valid', () => {
		expect(saveFailureAloneBlocksSubmit(state([new SaveFailure(new Error('Gone.'))]))).toBe(true);
	});

	it('is false when a field is invalid', () => {
		expect(
			saveFailureAloneBlocksSubmit(
				state([new SaveFailure(new Error('Gone.'))], { isFieldsValid: false }),
			),
		).toBe(false);
	});

	it('is false while the fields are still validating', () => {
		expect(
			saveFailureAloneBlocksSubmit(
				state([new SaveFailure(new Error('Gone.'))], { isFieldsValidating: true }),
			),
		).toBe(false);
	});

	it('is false when the recorded error is a plain string rather than a save failure', () => {
		// What the deleted `apps/admin` helper wrote. It reads as a validation
		// error, so Save stayed disabled until the operator edited a field.
		expect(saveFailureAloneBlocksSubmit(state([{ form: 'Gone.', fields: {} }]))).toBe(false);
		expect(saveFailureAloneBlocksSubmit(state(['Gone.']))).toBe(false);
	});

	it('is false when nothing is recorded, because there is nothing to retry', () => {
		expect(saveFailureAloneBlocksSubmit(state([]))).toBe(false);
	});

	it('is false when a save failure sits beside an error that is not one', () => {
		expect(
			saveFailureAloneBlocksSubmit(
				state([new SaveFailure(new Error('Gone.')), 'Name is required.']),
			),
		).toBe(false);
	});
});

describe('SaveFailure', () => {
	it("carries the thrown error's own sentence, and the cause behind it", () => {
		const cause = new Error('A genus named Aedes already exists.');
		const failure = new SaveFailure(cause);

		expect(failure.message).toBe('A genus named Aedes already exists.');
		expect(failure.cause).toBe(cause);
		expect(isSaveFailure(failure)).toBe(true);
	});

	it('falls back to the kit sentence when the thrown value names no reason', () => {
		expect(new SaveFailure({ status: 500 }).message).toBe('Unable to save changes.');
	});

	it('recognises nothing else as a save failure', () => {
		expect(isSaveFailure(new Error('Gone.'))).toBe(false);
		expect(isSaveFailure('Gone.')).toBe(false);
	});
});
