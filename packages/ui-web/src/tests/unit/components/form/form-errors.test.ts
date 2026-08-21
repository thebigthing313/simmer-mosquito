import { describe, expect, it } from 'vitest';
import { errorMessagesFrom } from '../../../../components/form/form-errors';

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
