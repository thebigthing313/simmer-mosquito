import { describe, expect, it } from 'vitest';
import { speciesPreview, speciesWindowSince } from '../../../components/species-composition-panel';

function totals(...counts: readonly number[]) {
	return counts.map((total, index) => ({
		speciesId: `s-${index}`,
		name: `Species ${index}`,
		total,
	}));
}

describe('speciesPreview', () => {
	it('draws every species and sums no tail when there are six or fewer', () => {
		const preview = speciesPreview(totals(60, 50, 40, 30, 20, 10));

		expect(preview.top).toHaveLength(6);
		expect(preview.otherTotal).toBe(0);
		expect(preview.otherCount).toBe(0);
		expect(preview.maxBar).toBe(60);
	});

	it('draws the first six and sums the rest into one other row', () => {
		const preview = speciesPreview(totals(60, 50, 40, 30, 20, 10, 7, 2, 1));

		expect(preview.top.map((entry) => entry.total)).toEqual([60, 50, 40, 30, 20, 10]);
		expect(preview.otherTotal).toBe(10);
		expect(preview.otherCount).toBe(3);
		expect(preview.maxBar).toBe(60);
	});

	it('falls back to a bar scale of one when there is nothing to draw', () => {
		const preview = speciesPreview(totals());

		expect(preview.top).toEqual([]);
		expect(preview.otherTotal).toBe(0);
		expect(preview.maxBar).toBe(1);
	});
});

describe('speciesWindowSince', () => {
	it('counts the day it is handed as the last day of the window', () => {
		expect(speciesWindowSince('2026-09-13', '7d')).toBe('2026-09-07');
		expect(speciesWindowSince('2026-09-13', '30d')).toBe('2026-08-15');
	});
});
