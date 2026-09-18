import { describe, expect, it } from 'vitest';
import { errorMessageForSave } from '../../../lib/save-error';

/**
 * The one rule for what a refused write says. `RecordDeleteDialog` and
 * `ServiceRequestDetailHeader` used to spell the ternary themselves (#1133),
 * so this is the sentence they now read instead.
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

	it('answers the caller its own fallback when the failure carries no message', () => {
		expect(errorMessageForSave(null, 'Unable to delete the habitat.')).toBe(
			'Unable to delete the habitat.',
		);
		expect(errorMessageForSave(new Error('Blocked.'), 'Unable to delete the habitat.')).toBe(
			'Blocked.',
		);
	});
});
