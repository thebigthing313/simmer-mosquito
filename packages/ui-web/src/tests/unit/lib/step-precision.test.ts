import { describe, expect, it } from 'vitest';
import { roundToOperandPrecision } from '../../../lib/step-precision';

describe('roundToOperandPrecision', () => {
	it('clears the drift a fractional step introduces', () => {
		expect(roundToOperandPrecision(0.1 + 0.2, 0.1, 0.2)).toBe(0.3);
		expect(roundToOperandPrecision(0.3 - 0.1, 0.3, -0.1)).toBe(0.2);
	});

	it('keeps the precision the value was typed with', () => {
		// Rounding to the step's single decimal would have made this 12.7.
		expect(roundToOperandPrecision(12.567 + 0.1, 12.567, 0.1)).toBe(12.667);
	});

	it('leaves whole-number stepping alone', () => {
		expect(roundToOperandPrecision(12.5 + 1, 12.5, 1)).toBe(13.5);
		expect(roundToOperandPrecision(4 + 1, 4, 1)).toBe(5);
	});

	it('recovers a value that arrived already drifted', () => {
		expect(roundToOperandPrecision(0.30000000000000004 + 0.1, 0.30000000000000004, 0.1)).toBe(0.4);
	});

	it('passes exponential operands through rather than guessing at them', () => {
		const stepped = 1e-7 + 1e-7;
		expect(roundToOperandPrecision(stepped, 1e-7, 1e-7)).toBe(stepped);
	});
});
