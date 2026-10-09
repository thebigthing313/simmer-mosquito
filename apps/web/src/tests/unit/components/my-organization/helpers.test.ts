import { describe, expect, it } from 'vitest';
import {
	numberInputValue,
	serviceRequestContextFrom,
} from '../../../../components/my-organization/helpers';
import type { PublicSettingsFormValues } from '../../../../components/my-organization/types';

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
