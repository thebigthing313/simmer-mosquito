/**
 * A count, thousands separated.
 *
 * Three surfaces had grown their own copy of this, two of them sharing the same
 * doc comment: a rail that says 14245 makes the reader count digits.
 */
export function formatCount(value: number, maximumFractionDigits = 0): string {
	return value.toLocaleString('en-US', { maximumFractionDigits });
}
