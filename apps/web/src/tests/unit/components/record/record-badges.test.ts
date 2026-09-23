/**
 * `hasBadges` is what `recordBadges` asks before a row gets an element (#1107).
 *
 * `ExplorerRow` lays out a badge container on `badges !== undefined`, and an
 * empty fragment is not undefined, so a kind whose badges draw nothing still
 * cost every row a blank line under its subtitle. The answer here has to agree
 * with what the register draws, so the cases are the ones where the two halves
 * split: a state pill that exists under one placement and not the other, and a
 * detail badge that depends on the record rather than on its kind.
 */
import { describe, expect, it } from 'vitest';
import { hasBadges } from '../../../../components/record/record-badges';

describe('hasBadges', () => {
	it('draws nothing for a chemical application or a source reduction', () => {
		expect(hasBadges({ category: 'application' }, 'badge')).toBe(false);
		expect(hasBadges({ category: 'application' }, 'dot')).toBe(false);
		expect(hasBadges({ category: 'sourceReduction' }, 'badge')).toBe(false);
	});

	it('draws a habitat state as a pill only where the dot is spent on something else', () => {
		expect(hasBadges({ category: 'habitat', status: 'inaccessible' }, 'badge')).toBe(true);
		expect(hasBadges({ category: 'habitat', status: 'inaccessible' }, 'dot')).toBe(false);
	});

	// The log already says "Collected" as the verb, so a collected collection
	// gets no pill, and with no bycatch it has nothing else to say.
	it('draws nothing for a collected collection with no bycatch', () => {
		const facts = { category: 'collection', status: 'collected', hasBycatch: false } as const;
		expect(hasBadges(facts, 'badge')).toBe(false);
		expect(hasBadges({ ...facts, status: 'pending' }, 'badge')).toBe(true);
		expect(hasBadges({ ...facts, hasBycatch: true }, 'dot')).toBe(true);
	});

	it('draws the stages a wet inspection found under either placement', () => {
		const stages = {
			hasEggs: false,
			hasFirstInstar: false,
			hasSecondInstar: true,
			hasThirdInstar: false,
			hasFourthInstar: false,
			hasPupae: false,
		};
		const result = { isWet: true, density: 'medium', stages } as const;
		expect(hasBadges({ category: 'inspection', result }, 'dot')).toBe(true);
		expect(hasBadges({ category: 'inspection', result: { ...result, stages: null } }, 'dot')).toBe(
			false,
		);
	});
});
