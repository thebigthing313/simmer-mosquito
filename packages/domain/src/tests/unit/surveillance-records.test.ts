import { describe, expect, it } from 'vitest';
import {
	type ImmatureStageFlags,
	isPositiveInspection,
	type PositiveInspectionInput,
} from '../../larval-surveillance/index.js';

/**
 * `isPositiveInspection` is `CONTEXT.md`'s Positive Inspection: wet, and a
 * density other than `none` or a larvae count above zero. Life stages are not
 * part of the rule, so the last row sets every stage flag on a wet inspection
 * with no abundance and still reads negative.
 */
const cases: ReadonlyArray<{
	readonly name: string;
	readonly input: PositiveInspectionInput & Partial<ImmatureStageFlags>;
	readonly positive: boolean;
}> = [
	{
		name: 'dry with larvae recorded',
		input: { isWet: false, density: 'heavy', larvaeCount: 12 },
		positive: false,
	},
	{
		name: 'wet with density none and no count',
		input: { isWet: true, density: 'none', larvaeCount: null },
		positive: false,
	},
	{
		name: 'wet with density none and a count of 0',
		input: { isWet: true, density: 'none', larvaeCount: 0 },
		positive: false,
	},
	{
		name: 'wet with a band above none',
		input: { isWet: true, density: 'light', larvaeCount: null },
		positive: true,
	},
	{
		name: 'wet with no density and a count above 0',
		input: { isWet: true, density: null, larvaeCount: 3 },
		positive: true,
	},
	{
		name: 'wet with no density and no count',
		input: { isWet: true, density: null, larvaeCount: null },
		positive: false,
	},
	{
		name: 'wet with only life stages set',
		input: {
			isWet: true,
			density: null,
			larvaeCount: null,
			hasFirstInstar: true,
			hasSecondInstar: true,
			hasThirdInstar: true,
			hasFourthInstar: true,
			hasPupae: true,
			hasEggs: true,
		},
		positive: false,
	},
];

describe('isPositiveInspection', () => {
	it.each(cases)('$name reads $positive', ({ input, positive }) => {
		expect(isPositiveInspection(input)).toBe(positive);
	});
});
