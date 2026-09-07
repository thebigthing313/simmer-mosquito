import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countLabel, formatAmount, formatCount } from '../../../lib/format-count';

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

/**
 * The Habitat detail page and the Inspection detail page held byte-identical
 * copies of this, twenty lines from where each one also parsed a date by hand.
 * Both returned the em dash for a non-finite number, which #584 gave to absence.
 */
describe('formatAmount', () => {
	let warn: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warn.mockRestore();
	});

	it('keeps a whole amount whole', () => {
		expect(formatAmount(2)).toBe('2');
	});

	it('trims a stored decimal to what was recorded', () => {
		expect(formatAmount(2.5)).toBe('2.5');
	});

	it('stops at three places, the way both copies did', () => {
		expect(formatAmount(1.23456)).toBe('1.235');
	});

	it('separates thousands', () => {
		expect(formatAmount(14245)).toBe('14,245');
	});

	it('writes a non-finite amount out rather than drawing it as absent', () => {
		expect(formatAmount(Number.NaN)).toBe('NaN');
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
