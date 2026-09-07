import { unreadable } from './unreadable-input';

/**
 * A count, thousands separated.
 *
 * Three surfaces had grown their own copy of this, two of them sharing the same
 * doc comment: a rail that says 14245 makes the reader count digits.
 */
export function formatCount(value: number, maximumFractionDigits = 0): string {
	return value.toLocaleString('en-US', { maximumFractionDigits });
}

/**
 * `2`, `2.5`, `14,245` — a recorded amount, with no trailing zeros.
 *
 * A stored decimal is `2.50` and an operator wrote `2.5`, so the trailing zero
 * is the column's and not the record's. Whole amounts stay whole, and the number
 * reads naturally next to its unit either way.
 *
 * The Habitat detail page and the Inspection detail page held byte-identical
 * copies of this, each returning the em dash for a non-finite amount. Merged
 * here in #609, and the dash is gone: a number that will not render is a failure
 * rather than an absence, so it goes back out as it arrived and warns.
 *
 * The locale stays the reader's rather than this file's `en-US`, which is what
 * both copies did and what keeps every former call site rendering as it did.
 * {@link formatCount} pins `en-US` because it counts rows, which is a fact about
 * the data rather than a quantity somebody recorded.
 */
export function formatAmount(value: number): string {
	if (!Number.isFinite(value)) {
		return unreadable('formatAmount', value);
	}
	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
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
