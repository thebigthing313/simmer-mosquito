/**
 * A label for a sample cup the crew has not labeled yet: `WL-0924-7GQ4-X`.
 *
 * The inspector's initials and the inspection's month and day narrow a clash to
 * one inspector's samples on one day, so four random characters are enough to
 * separate them. The random characters and the check character are Crockford
 * base 32, which leaves out `I`, `L`, `O` and `U` so a handwritten label reads
 * back one way. The check character is Luhn mod 32 over the whole label, so a
 * single mistyped character or two adjacent characters swapped fail the check
 * when the label is typed back in. `taken` is every label already in the form,
 * compared the way the server compares them, trimmed and case folded.
 *
 * `inspectionDate` is `YYYY-MM-DD`; anything else returns null, since a label
 * without its day is a label the lab cannot place.
 */
export function generateSampleLabel(
	inspectorName: string | null,
	inspectionDate: string,
	taken: readonly string[],
	random: (size: number) => Uint32Array = randomValues,
): string | null {
	const day = /^\d{4}-(\d{2})-(\d{2})$/.exec(inspectionDate);
	if (day === null) {
		return null;
	}
	const prefix = [labelInitials(inspectorName), `${day[1]}${day[2]}`].filter(Boolean).join('-');
	const used = new Set(taken.map((label) => label.trim().toUpperCase()));
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		const serial = [...random(SERIAL_LENGTH)]
			.map((value) => CROCKFORD[value % CROCKFORD.length])
			.join('');
		const body = `${prefix}-${serial}`;
		const label = `${body}-${checkCharacter(body)}`;
		if (!used.has(label)) {
			return label;
		}
	}
	throw new Error('No unused sample label after 16 attempts.');
}

/** First and last name initials, ASCII letters only; none when the name has no letters. */
function labelInitials(name: string | null): string {
	const words = (name ?? '')
		.normalize('NFD')
		.toUpperCase()
		.split(/\s+/)
		.map((word) => word.replace(/[^A-Z]/g, ''))
		.filter((word) => word.length > 0);
	const first = words[0];
	if (first === undefined) {
		return '';
	}
	const last = words.length > 1 ? words.at(-1) : undefined;
	return `${first[0]}${last?.[0] ?? ''}`;
}

/**
 * Luhn mod 32. Initials can hold the four letters Crockford leaves out, so each
 * character is read the way Crockford reads it back, `I` and `L` as `1`, `O` as
 * `0`, and `U` as `V`, and a lab typing `W1` for `WL` still passes.
 */
function checkCharacter(body: string): string {
	const codes = [...body.replaceAll('-', '')].map((character) =>
		CROCKFORD.indexOf(CROCKFORD_READS[character] ?? character),
	);
	let sum = 0;
	let factor = 2;
	for (let index = codes.length - 1; index >= 0; index -= 1) {
		const addend = factor * (codes[index] ?? 0);
		sum += Math.floor(addend / CROCKFORD.length) + (addend % CROCKFORD.length);
		factor = factor === 2 ? 1 : 2;
	}
	return CROCKFORD[(CROCKFORD.length - (sum % CROCKFORD.length)) % CROCKFORD.length] ?? '';
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CROCKFORD_READS: Readonly<Record<string, string>> = { I: '1', L: '1', O: '0', U: 'V' };
const SERIAL_LENGTH = 4;
const MAX_ATTEMPTS = 16;

function randomValues(size: number): Uint32Array {
	return crypto.getRandomValues(new Uint32Array(size));
}
