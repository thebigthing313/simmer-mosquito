import { describe, expect, it } from 'vitest';
import { isNoOpUpdate } from './change-set';

describe('isNoOpUpdate', () => {
	it('recognises a diff that found nothing to send', () => {
		expect(isNoOpUpdate({})).toBe(true);
	});

	it('lets a real change through', () => {
		expect(isNoOpUpdate({ trapName: 'Culex trap 4' })).toBe(false);
	});

	it('counts a field cleared to null as a change', () => {
		// `pickChanged` writes the new value verbatim, so clearing an optional field
		// puts an explicit null in the body — that is a change, not an absence.
		expect(isNoOpUpdate({ addressId: null })).toBe(false);
	});

	it('counts a geometry-only edit as a change', () => {
		// Moving a point leaves every scalar untouched; the body carries just the
		// location, and skipping it would silently discard the move.
		expect(isNoOpUpdate({ locationSource: { kind: 'geometry', geometry: {} } })).toBe(false);
	});
});
