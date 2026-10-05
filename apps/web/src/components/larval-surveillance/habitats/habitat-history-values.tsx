import { formatAmount } from '../../../lib/format-count';

/** An amount and its unit's abbreviation, or the bare amount when the unit is not in the client. */
export function amountWithUnit(amount: number, abbreviation: string | null): string {
	return abbreviation === null || abbreviation === ''
		? formatAmount(amount)
		: `${formatAmount(amount)} ${abbreviation}`;
}

/**
 * A stamp, in the organization's zone. Takes a `Date` or a string, because
 * the read seam hands back `Date` and older call sites hand back ISO strings.
 */
export function formatDateTime(value: string | Date, timeZone: string | undefined): string {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return 'Unknown';
	}

	return new Intl.DateTimeFormat('en-US', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		...(timeZone === undefined ? {} : { timeZone }),
	}).format(date);
}
