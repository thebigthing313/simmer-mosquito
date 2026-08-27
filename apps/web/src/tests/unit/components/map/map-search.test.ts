import { describe, expect, it } from 'vitest';
import { stepIndex } from '../../../../components/map/map-search';

/**
 * The arrow-key half of the place search. It is a pure function so that the
 * wrap-around, which is the part that is easy to get wrong and invisible in a
 * screenshot, can be stated rather than clicked.
 */
describe('stepIndex', () => {
	it('starts at the first option when stepping down from none', () => {
		expect(stepIndex(-1, 1, 6)).toBe(0);
	});

	it('starts at the last option when stepping up from none', () => {
		expect(stepIndex(-1, -1, 6)).toBe(5);
	});

	it('wraps past the end back to the first', () => {
		expect(stepIndex(5, 1, 6)).toBe(0);
	});

	it('wraps past the start back to the last', () => {
		expect(stepIndex(0, -1, 6)).toBe(5);
	});

	it('walks the middle of the list one at a time', () => {
		expect(stepIndex(2, 1, 6)).toBe(3);
		expect(stepIndex(2, -1, 6)).toBe(1);
	});

	it('stays on the only option in a list of one', () => {
		expect(stepIndex(0, 1, 1)).toBe(0);
		expect(stepIndex(0, -1, 1)).toBe(0);
	});
});
