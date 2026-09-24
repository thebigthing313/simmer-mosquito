import { describe, expect, it } from 'vitest';
import { compareNames } from '../../../lib/natural-order';

describe('compareNames', () => {
	it('reads digit runs as numbers', () => {
		const names = [
			'CAR - S1 - 11',
			'CAR - S1 - 2',
			'CAR - S1 - 1',
			'CAR - S1 - 20',
			'CAR - S1 - 19',
		];

		expect([...names].sort(compareNames)).toEqual([
			'CAR - S1 - 1',
			'CAR - S1 - 2',
			'CAR - S1 - 11',
			'CAR - S1 - 19',
			'CAR - S1 - 20',
		]);
	});

	it('folds case the way localeCompare did', () => {
		expect(['b-1', 'A-2', 'a-1'].sort(compareNames)).toEqual(['a-1', 'A-2', 'b-1']);
	});
});
