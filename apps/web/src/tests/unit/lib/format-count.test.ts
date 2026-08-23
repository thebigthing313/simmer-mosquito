import { describe, expect, it } from 'vitest';
import { countLabel, formatCount } from '../../../lib/format-count';

const HABITATS = { one: 'habitat', many: 'habitats' };

describe('formatCount', () => {
	it('separates thousands', () => {
		expect(formatCount(14245)).toBe('14,245');
	});
});

describe('countLabel', () => {
	// The rail's header and its footer counted the same rows by two different
	// rules, so a rail holding one record read "1 habitat" at the top and
	// "1 habitats" at the bottom.
	it('agrees with itself on one record', () => {
		expect(countLabel(1, HABITATS)).toBe('1 habitat');
	});

	it('separates thousands on the plural', () => {
		expect(countLabel(14245, HABITATS)).toBe('14,245 habitats');
	});

	// "0 habitats" reads as a count that failed rather than a set that is empty.
	it('says None rather than zero', () => {
		expect(countLabel(0, HABITATS)).toBe('None');
	});
});
