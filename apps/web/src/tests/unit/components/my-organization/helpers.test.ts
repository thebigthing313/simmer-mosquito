import { describe, expect, it } from 'vitest';
import {
	densityRangesOrNull,
	numberInputValue,
	safeDensityRangesFromFormValues,
	serviceRequestContextFrom,
} from '../../../../components/my-organization/helpers';
import type {
	DensityRangeFormValues,
	PublicSettingsFormValues,
} from '../../../../components/my-organization/types';

const VALID: PublicSettingsFormValues = {
	radiusAmount: 0.5,
	radiusUnitCode: 'mi',
	daysBefore: 7,
	daysAfter: 14,
};

describe('serviceRequestContextFrom', () => {
	it('builds the context from valid values, a fractional radius included', () => {
		expect(serviceRequestContextFrom(VALID)).toEqual({
			radius: { amount: 0.5, unitCode: 'mi' },
			timeWindow: { daysBefore: 7, daysAfter: 14 },
		});
	});

	it('saves a day window of zero as zero', () => {
		expect(serviceRequestContextFrom({ ...VALID, daysBefore: 0, daysAfter: 0 }).timeWindow).toEqual(
			{ daysBefore: 0, daysAfter: 0 },
		);
	});

	it.each([
		['empty', null, 'Search radius is required.'],
		['zero', 0, 'Search radius must be greater than zero.'],
		['negative', -1, 'Search radius must be greater than zero.'],
		['non-numeric', Number.NaN, 'Search radius must be greater than zero.'],
	])('refuses a %s Search radius', (_case, radiusAmount, message) => {
		expect(() => serviceRequestContextFrom({ ...VALID, radiusAmount })).toThrow(message);
	});

	it.each([
		['daysBefore', 'Days before'],
		['daysAfter', 'Days after'],
	] as const)('refuses an empty, negative or fractional %s', (key, label) => {
		expect(() => serviceRequestContextFrom({ ...VALID, [key]: null })).toThrow(
			`${label} is required.`,
		);
		expect(() => serviceRequestContextFrom({ ...VALID, [key]: -1 })).toThrow(
			`${label} must be a nonnegative whole number.`,
		);
		expect(() => serviceRequestContextFrom({ ...VALID, [key]: 1.5 })).toThrow(
			`${label} must be a nonnegative whole number.`,
		);
	});

	it('refuses an empty Radius unit', () => {
		expect(() => serviceRequestContextFrom({ ...VALID, radiusUnitCode: ' ' })).toThrow(
			'Radius unit is required.',
		);
	});
});

describe('numberInputValue', () => {
	it('reads an empty or blank input as null rather than zero', () => {
		expect(numberInputValue('')).toBeNull();
		expect(numberInputValue('  ')).toBeNull();
		expect(numberInputValue(null)).toBeNull();
	});

	it('reads a typed number, zero included', () => {
		expect(numberInputValue('0')).toBe(0);
		expect(numberInputValue('2.5')).toBe(2.5);
	});
});

const BANDS: DensityRangeFormValues = {
	light: { minInclusive: '0', maxExclusive: '1' },
	medium: { minInclusive: '1', maxExclusive: '5' },
	heavy: { minInclusive: '5', maxExclusive: '10' },
	very_heavy: { minInclusive: '10', maxExclusive: '' },
};

type Band = keyof DensityRangeFormValues;
type BoundKey = 'minInclusive' | 'maxExclusive';

// The bounds the sheet lets a person type into, named the way the sheet draws them.
const EDITABLE_BOUNDS: readonly (readonly [Band, BoundKey, string])[] = [
	['light', 'maxExclusive', 'Up to and including in Light'],
	['medium', 'minInclusive', 'Greater than in Medium'],
	['medium', 'maxExclusive', 'Up to and including in Medium'],
	['heavy', 'minInclusive', 'Greater than in Heavy'],
	['heavy', 'maxExclusive', 'Up to and including in Heavy'],
	['very_heavy', 'minInclusive', 'Greater than in Very heavy'],
];

function withBound(band: Band, key: BoundKey, text: string): DensityRangeFormValues {
	return { ...BANDS, [band]: { ...BANDS[band], [key]: text } };
}

describe('densityRangesOrNull', () => {
	it('builds the bands from valid input', () => {
		expect(densityRangesOrNull(true, BANDS)).toEqual({
			light: { minInclusive: 0, maxExclusive: 1 },
			medium: { minInclusive: 1, maxExclusive: 5 },
			heavy: { minInclusive: 5, maxExclusive: 10 },
			veryHeavy: { minInclusive: 10 },
		});
	});

	it('saves a fractional bound when the bands are in order', () => {
		const values: DensityRangeFormValues = {
			...withBound('light', 'maxExclusive', '0.5'),
			medium: { minInclusive: '0.5', maxExclusive: '5' },
		};
		expect(densityRangesOrNull(true, values)?.light).toEqual({
			minInclusive: 0,
			maxExclusive: 0.5,
		});
	});

	it.each(EDITABLE_BOUNDS)('refuses an empty %s %s by its field', (band, key, field) => {
		expect(() => densityRangesOrNull(true, withBound(band, key, ''))).toThrow(
			`${field} is required.`,
		);
	});

	it.each(EDITABLE_BOUNDS)('reads a blank %s %s as empty', (band, key, field) => {
		expect(() => densityRangesOrNull(true, withBound(band, key, '   '))).toThrow(
			`${field} is required.`,
		);
	});

	it.each(EDITABLE_BOUNDS)('refuses a negative %s %s by its field', (band, key, field) => {
		expect(() => densityRangesOrNull(true, withBound(band, key, '-1'))).toThrow(
			`${field} must be a number of 0 or more.`,
		);
	});

	it.each(EDITABLE_BOUNDS)('refuses a non-numeric %s %s by its field', (band, key, field) => {
		expect(() => densityRangesOrNull(true, withBound(band, key, 'abc'))).toThrow(
			`${field} must be a number of 0 or more.`,
		);
	});

	it('refuses a band that does not start where the one before it ends', () => {
		expect(() => densityRangesOrNull(true, withBound('medium', 'minInclusive', '2'))).toThrow(
			'Greater than in Medium must equal Up to and including in Light.',
		);
	});

	it('refuses a band whose upper field is not above its lower one', () => {
		const values: DensityRangeFormValues = {
			...withBound('medium', 'maxExclusive', '1'),
			heavy: { minInclusive: '1', maxExclusive: '10' },
		};
		expect(() => densityRangesOrNull(true, values)).toThrow(
			'Up to and including in Medium must be more than Greater than in Medium.',
		);
	});

	it('names no field by a word the sheet does not draw', () => {
		const messages: string[] = [];
		for (const [band, key] of EDITABLE_BOUNDS) {
			for (const text of ['', '-1', 'abc', '2', '100']) {
				try {
					densityRangesOrNull(true, withBound(band, key, text));
				} catch (error) {
					messages.push(error instanceof Error ? error.message : String(error));
				}
			}
		}
		expect(messages.length).toBeGreaterThan(20);
		for (const message of messages) {
			expect(message).not.toMatch(/lower bound|upper bound|minimum/i);
		}
	});

	it('saves null ranges with density inference off, whatever the fields hold', () => {
		expect(densityRangesOrNull(false, withBound('medium', 'minInclusive', ''))).toBeNull();
		expect(densityRangesOrNull(false, withBound('heavy', 'maxExclusive', 'abc'))).toBeNull();
	});
});

describe('safeDensityRangesFromFormValues', () => {
	it('falls back to no preview while a bound is empty or invalid', () => {
		expect(safeDensityRangesFromFormValues(withBound('medium', 'maxExclusive', ''))).toBeNull();
		expect(safeDensityRangesFromFormValues(withBound('medium', 'maxExclusive', '-1'))).toBeNull();
		expect(safeDensityRangesFromFormValues(BANDS)).not.toBeNull();
	});
});
