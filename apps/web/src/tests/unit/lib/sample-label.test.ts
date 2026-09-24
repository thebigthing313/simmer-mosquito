import { describe, expect, it } from 'vitest';
import { generateSampleLabel } from '../../../lib/sample-label';

/** A random source handing back the given values in turn, one batch per call. */
function sequence(...batches: readonly (readonly number[])[]) {
	let call = 0;
	return (size: number) => {
		const batch = batches[call] ?? [];
		call += 1;
		return Uint32Array.from({ length: size }, (_, index) => batch[index] ?? 0);
	};
}

const DATE = '2026-09-24';

function checkOf(label: string | null): string | undefined {
	return label?.split('-').at(-1);
}

describe('generateSampleLabel', () => {
	// Worked by hand: `L` is read as `1`, and Luhn mod 32 over
	// W 1 0 9 2 4 7 G 9 X sums to 102, so the check is 32 - 6 = 26, `T`.
	it("writes the inspector's initials, the day, four characters and a check", () => {
		expect(generateSampleLabel('William Lynch', DATE, [], sequence([7, 16, 9, 29]))).toBe(
			'WL-0924-7G9X-T',
		);
	});

	it('takes the first and last word of a longer name', () => {
		expect(generateSampleLabel('Gerson Rubi Machado', DATE, [], sequence([1, 2, 3, 4]))).toMatch(
			/^GM-0924-1234-.$/,
		);
	});

	it('folds accents and drops punctuation from the initials', () => {
		expect(generateSampleLabel('Élmio  Sierra-Ruiz', DATE, [], sequence([0, 0, 0, 0]))).toMatch(
			/^ES-0924-0000-.$/,
		);
	});

	it('leaves the initials off when there is no inspector', () => {
		expect(generateSampleLabel(null, DATE, [], sequence([10, 11, 12, 13]))).toMatch(
			/^0924-ABCD-.$/,
		);
		expect(generateSampleLabel('  ', DATE, [], sequence([10, 11, 12, 13]))).toMatch(
			/^0924-ABCD-.$/,
		);
	});

	it('generates nothing without a day', () => {
		expect(generateSampleLabel('William Lynch', '', [])).toBeNull();
		expect(generateSampleLabel('William Lynch', '09/24/2026', [])).toBeNull();
	});

	it('draws only Crockford characters after the initials', () => {
		const drawn = new Set<string>();
		for (let value = 0; value < 64; value += 1) {
			const label = generateSampleLabel(null, DATE, [], sequence([value, value, value, value]));
			drawn.add(label?.[5] ?? '');
			drawn.add(checkOf(label) ?? '');
		}
		expect([...drawn].filter((character) => 'ILOU'.includes(character))).toEqual([]);
		expect(drawn.size).toBe(32);
	});

	// Luhn mod N gives every value at one position its own check, which is what
	// catches a single mistyped character.
	it('gives each character at one position its own check', () => {
		const checks = new Set<string | undefined>();
		for (let value = 0; value < 32; value += 1) {
			checks.add(
				checkOf(generateSampleLabel('William Lynch', DATE, [], sequence([value, 5, 5, 5]))),
			);
		}
		expect(checks.size).toBe(32);
	});

	it('changes the check when two adjacent characters swap', () => {
		for (let left = 0; left < 32; left += 1) {
			for (let right = 0; right < 32; right += 1) {
				const label = generateSampleLabel('William Lynch', DATE, [], sequence([left, right, 5, 5]));
				const swapped = generateSampleLabel(
					'William Lynch',
					DATE,
					[],
					sequence([right, left, 5, 5]),
				);
				// Luhn mod 32's one blind spot, 0 and 31, which the docblock names.
				const blind = (left === 0 && right === 31) || (left === 31 && right === 0);
				if (left !== right && !blind) {
					expect(checkOf(swapped), `${label} and ${swapped}`).not.toBe(checkOf(label));
				}
			}
		}
	});

	it('writes one initial for a one-word name', () => {
		expect(generateSampleLabel('Cher', DATE, [], sequence([1, 2, 3, 4]))).toMatch(
			/^C-0924-1234-.$/,
		);
	});

	// The server refuses two labels on one inspection that match after trimming
	// and case folding, so a label already in the form is drawn again.
	it('draws again past a label the form already holds', () => {
		const first = generateSampleLabel('William Lynch', DATE, [], sequence([1, 1, 1, 1]));
		expect(
			generateSampleLabel(
				'William Lynch',
				DATE,
				[` ${first?.toLowerCase()} `],
				sequence([1, 1, 1, 1], [2, 2, 2, 2]),
			),
		).toMatch(/^WL-0924-2222-.$/);
	});

	it('uses the platform random source by default', () => {
		expect(generateSampleLabel('Rey Delgado', DATE, [])).toMatch(
			/^RD-0924-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$/,
		);
	});
});
