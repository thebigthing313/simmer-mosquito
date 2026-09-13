import { describe, expect, it } from 'vitest';
import { coordinateLabel } from '../../../lib/coordinate-label';

describe('coordinateLabel', () => {
	it('reads both coordinates to five places', () => {
		expect(coordinateLabel(34.05213, -118.24368)).toBe('34.05213, -118.24368');
	});

	// The three detail modules this replaced wrote the same test two ways, one
	// against `typeof lat === 'number'` and one against `lat == null`.
	it('has a word for a record with no latitude', () => {
		expect(coordinateLabel(null, -118.24368)).toBe('Unknown coordinates');
	});

	it('has a word for a record with no longitude', () => {
		expect(coordinateLabel(34.05213, null)).toBe('Unknown coordinates');
	});

	it('has a word for a row that carries no centroid columns', () => {
		expect(coordinateLabel(undefined, undefined)).toBe('Unknown coordinates');
	});

	// Zero is a coordinate, and a falsy test would call it missing.
	it('reads a coordinate of zero', () => {
		expect(coordinateLabel(0, 0)).toBe('0.00000, 0.00000');
	});
});
