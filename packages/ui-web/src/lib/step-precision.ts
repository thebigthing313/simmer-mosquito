/**
 * Keeping a stepped number as precise as the numbers that made it.
 *
 * Adding a fractional step in binary floating point drifts — three clicks of 0.1
 * land on 0.30000000000000004 — and in a controlled input that drift is what gets
 * rendered straight back into the field. Neither the value nor the step carried
 * more precision than its own decimals, so rounding the result to that many places
 * restores the expected number without inventing any.
 */

/** Decimal places in a number's plain decimal form — 0.25 → 2, 3 → 0. */
function decimalPlaces(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	const text = String(value);
	// Exponential notation ("1e-7") hides its decimals behind the exponent. Rather
	// than decode it, report none and let the other operand set the precision.
	if (text.includes('e') || text.includes('E')) {
		return 0;
	}

	const point = text.indexOf('.');
	return point === -1 ? 0 : text.length - point - 1;
}

/**
 * Round a stepped result to the precision its operands already carried.
 *
 * Capped at 12 places: real entry never reaches that, and a value that arrived
 * already drifted would otherwise claim its full 17 and defeat the rounding.
 */
export function roundToOperandPrecision(result: number, ...operands: readonly number[]): number {
	const places = Math.min(12, Math.max(0, ...operands.map(decimalPlaces)));
	return places === 0 ? result : Number(result.toFixed(places));
}
