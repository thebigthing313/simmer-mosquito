/**
 * A recipe amount, and what it does with a number it cannot render.
 *
 * `trimNumber` behind this is the same *shape* as `formatAmount` in
 * `lib/format-count` and deliberately not the same function: `Intl.NumberFormat`
 * separates a thousand and this does not, and a comma in a mix amount is a
 * character somebody has to type back. What it took from #609 is the answer to a
 * non-finite number, which was the em dash absence had already been given.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatAmountValue } from '../../../../../routes/control-operations/chemical/-formulation-math';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	warn.mockRestore();
});

describe('formatAmountValue', () => {
	it('drops the trailing zeros a stored decimal carries', () => {
		expect(formatAmountValue(0.5)).toBe('0.5');
		expect(formatAmountValue(26)).toBe('26');
	});

	// The point of keeping this apart from `formatAmount`: a mix amount is a
	// measurement rather than a count, and a separator makes it unreadable back.
	it('separates nothing in a four-figure amount', () => {
		expect(formatAmountValue(1000)).toBe('1000');
	});

	it('writes a non-finite amount out rather than drawing it as absent', () => {
		expect(formatAmountValue(Number.NaN)).toBe('NaN');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('trimNumber');
	});
});
