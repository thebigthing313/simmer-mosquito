/**
 * A count, thousands separated.
 *
 * Three surfaces had grown their own copy of this, two of them sharing the same
 * doc comment: a rail that says 14245 makes the reader count digits.
 */
export function formatCount(value: number, maximumFractionDigits = 0): string {
	return value.toLocaleString('en-US', { maximumFractionDigits });
}

/** Singular and plural forms of whatever a surface is counting. */
export interface CountNoun {
	readonly one: string;
	readonly many: string;
}

/**
 * `1 habitat`, `14,245 habitats`, `None`.
 *
 * The rail's header and its footer were counting the same rows with two
 * different rules: the header took a singular/plural pair, the footer took one
 * plural string and printed it whatever the number was. So a rail holding one
 * record read `1 habitat` at the top and `1 habitats` at the bottom.
 */
export function countLabel(total: number, noun: CountNoun): string {
	if (total === 0) {
		return 'None';
	}
	return total === 1 ? `1 ${noun.one}` : `${formatCount(total)} ${noun.many}`;
}
