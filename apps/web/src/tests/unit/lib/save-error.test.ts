import { describe, expect, it } from 'vitest';
import { errorMessageForSave } from '../../../lib/save-error';

/**
 * The one rule for what a refused write says. `RecordDeleteDialog` and
 * `ServiceRequestDetailHeader` used to spell the ternary themselves (#1133),
 * and 35 more call sites did after that (#1162), so this is the sentence they
 * all read instead. The check that no copy came back is the grep in that
 * issue, `instanceof Error ?`, and its sibling `instanceof Error &&`, which
 * three private `messageOf` helpers wrote to fall back on an empty message;
 * outside the tests trees both name this module alone.
 */
describe('errorMessageForSave', () => {
	it('reads the message off an Error', () => {
		expect(errorMessageForSave(new Error('Viewers have read-only access.'))).toBe(
			'Viewers have read-only access.',
		);
	});

	it('answers the generic sentence for anything else', () => {
		expect(errorMessageForSave('refused')).toBe('Unable to save changes.');
		expect(errorMessageForSave(undefined)).toBe('Unable to save changes.');
	});

	it('answers the fallback for an Error whose message is empty', () => {
		expect(errorMessageForSave(new Error(''))).toBe('Unable to save changes.');
		expect(errorMessageForSave(new Error(''), 'Unable to add species.')).toBe(
			'Unable to add species.',
		);
	});

	it('answers the caller its own fallback when the failure carries no message', () => {
		expect(errorMessageForSave(null, 'Unable to delete the habitat.')).toBe(
			'Unable to delete the habitat.',
		);
		expect(errorMessageForSave(new Error('Blocked.'), 'Unable to delete the habitat.')).toBe(
			'Blocked.',
		);
	});
});
