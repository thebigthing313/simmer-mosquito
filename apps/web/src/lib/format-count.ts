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
 * The locale was the reader's until #683 and is now `en-US`, the same pin
 * {@link formatCount} has always carried. Nothing in the product offers a locale
 * switch, so following the runtime was inheriting whatever the host happened to
 * be rather than serving a preference, and it left a separator that a suite
 * could not assert.
 */
export function formatAmount(value: number): string {
	if (!Number.isFinite(value)) {
		return unreadable('formatAmount', value);
	}
	return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

/** Singular and plural forms of whatever a surface is counting. */
export interface CountNoun {
	readonly one: string;
	readonly many: string;
}

/**
 * `0 habitats`, `1 habitat`, `14,245 habitats`.
 *
 * The number and the noun that agrees with it, and nothing else. Every count
 * naming something a person reads is built here, so the singular fork is
 * written once: a surface that forks on the number itself is the shape that
 * gave one rail `1 habitat` at the top and `1 habitats` at the bottom.
 *
 * Zero is a plural and stays one. What to draw for an empty set is the
 * surface's question rather than this function's, and the two surfaces answer
 * it differently: {@link countLabel} says `None` because an explorer's count
 * sits beside a heading, and a toast reporting what was just written never
 * reaches zero.
 */
export function countPhrase(total: number, noun: CountNoun): string {
	return `${formatCount(total)} ${total === 1 ? noun.one : noun.many}`;
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
	return total === 0 ? 'None' : countPhrase(total, noun);
}
