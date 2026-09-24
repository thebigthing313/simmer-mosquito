/**
 * A phone number as a US reader expects to see it.
 *
 * The columns are free text: a number arrives as `5551234567`, `555.123.4567`
 * or `+1 555-123-4567` depending on who typed it, and a list that draws all
 * three reads as three different numbers. So a display site passes the stored
 * value through here and gets `(555) 123-4567` back. The stored value is never
 * rewritten; a form still edits what was typed.
 *
 * SIMMER serves US organizations only, so the rule is the North American one:
 * ten digits, or eleven with a leading country code of 1, and a seven-digit
 * local number as `123-4567`. An extension written as `x`, `ext`, `ext.`,
 * `extension` or `#` is kept as ` ext. 12`. Anything else comes back trimmed
 * and otherwise as written, because a number this cannot read is still one a
 * person can, and reformatting it would only hide the typo.
 */

const PHONE_CHARACTERS = /^[\d\s().+-]+$/;
const EXTENSION = /^(.*?)\s*(?:x|ext\.?|extension|#)\s*(\d+)$/i;

export function formatPhoneNumber(value: string): string;
export function formatPhoneNumber(value: string | null): string | null;
export function formatPhoneNumber(value: string | null): string | null {
	if (value === null) {
		return null;
	}
	const written = value.trim();
	const extensionMatch = EXTENSION.exec(written);
	const number = extensionMatch?.[1] ?? written;
	const extension = extensionMatch?.[2];

	const formatted = formatNumber(number);
	if (formatted === null) {
		return written;
	}
	return extension === undefined ? formatted : `${formatted} ext. ${extension}`;
}

function formatNumber(number: string): string | null {
	if (!PHONE_CHARACTERS.test(number)) {
		return null;
	}
	const digits = number.replace(/\D/g, '');
	const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
	if (national.length === 10) {
		return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
	}
	if (national.length === 7) {
		return `${national.slice(0, 3)}-${national.slice(3)}`;
	}
	return null;
}
