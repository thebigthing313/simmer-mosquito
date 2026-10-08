import { describe, expect, it } from 'vitest';
import { rankedComposition } from '../../../../hooks/queries/use-adult-species-composition';

const names = new Map([
	['pipiens', 'Culex pipiens'],
	['vexans', 'Aedes vexans'],
	['unknown', 'unknown'],
]);

const rows = [
	{ speciesId: 'pipiens', count: 4, sex: 'female' as const },
	{ speciesId: 'pipiens', count: 10, sex: 'male' as const },
	{ speciesId: 'vexans', count: 6, sex: null },
	{ speciesId: 'unknown', count: 50, sex: 'female' as const },
];

describe('rankedComposition', () => {
	it('leaves males out by default and counts a row with no sex as female', () => {
		const { totals, grandTotal } = rankedComposition(rows, names, false);
		expect(totals.map((entry) => [entry.name, entry.total])).toEqual([
			['Aedes vexans', 6],
			['Culex pipiens', 4],
		]);
		expect(grandTotal).toBe(10);
	});

	it('counts males when asked to', () => {
		const { totals, grandTotal } = rankedComposition(rows, names, true);
		expect(totals.map((entry) => [entry.name, entry.total])).toEqual([
			['Culex pipiens', 14],
			['Aedes vexans', 6],
		]);
		expect(grandTotal).toBe(20);
	});

	it('leaves the unknown taxon out of the bars and the total', () => {
		const { totals, grandTotal } = rankedComposition(rows, names, true);
		expect(totals.some((entry) => entry.speciesId === 'unknown')).toBe(false);
		expect(grandTotal).toBe(20);
	});
});
