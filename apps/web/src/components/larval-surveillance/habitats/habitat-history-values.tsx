import { formatAmount } from '../../../lib/format-count';

/** An amount and its unit's abbreviation, or the bare amount when the unit is not in the client. */
export function amountWithUnit(amount: number, abbreviation: string | null): string {
	return abbreviation === null || abbreviation === ''
		? formatAmount(amount)
		: `${formatAmount(amount)} ${abbreviation}`;
}
