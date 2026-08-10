import { describe, expect, it } from 'vitest';
import {
	convertUnitAmount,
	knownUnitCodes,
	lookupUnitConversion,
	totalInUnit,
	UNIT_TYPE_BASE_CODES,
} from '../../organization-settings/unit-conversion.js';

describe('convertUnitAmount', () => {
	// Spot values against the definitions, not against the table restated: if
	// these were derived from the factors they would pass no matter what the
	// factors said.
	it.each([
		['gallon', 'fluid_ounce', 1, 128],
		['pound', 'ounce', 1, 16],
		['pound', 'gram', 1, 453.59237],
		['mile', 'foot', 1, 5280],
		['acre', 'square_foot', 1, 43560],
		['hour', 'minute', 1, 60],
		['day', 'second', 1, 86400],
		['tablespoon', 'teaspoon', 1, 3],
		['miles_per_hour', 'kilometers_per_hour', 1, 1.609344],
	])('converts 1 %s to %s', (from, to, amount, expected) => {
		expect(convertUnitAmount(amount, from, to)).toBeCloseTo(expected, 9);
	});

	// The property #124 asked for. Doubles cannot promise exactness, but a
	// round trip that drifts more than this is a wrong factor, not rounding.
	it('returns the input after converting to another unit and back', () => {
		const pairs = [
			['gallon', 'teaspoon'],
			['pound', 'kilogram'],
			['acre', 'square_foot'],
			['mile', 'meter'],
			['day', 'minute'],
			['miles_per_hour', 'kilometers_per_hour'],
		] as const;

		for (const [from, to] of pairs) {
			const there = convertUnitAmount(7.5, from, to);
			expect(there).not.toBeNull();
			expect(convertUnitAmount(there as number, to, from)).toBeCloseTo(7.5, 9);
		}
	});

	// Gallons into pounds is not a rounding question.
	it('refuses to convert between different kinds of quantity', () => {
		expect(convertUnitAmount(1, 'gallon', 'pound')).toBeNull();
		expect(convertUnitAmount(1, 'acre', 'mile')).toBeNull();
	});

	it('refuses temperature, which needs an offset a factor cannot carry', () => {
		expect(convertUnitAmount(100, 'celsius', 'fahrenheit')).toBeNull();
		expect(lookupUnitConversion('celsius')).toEqual({
			kind: 'notConvertible',
			unitType: 'temperature',
		});
	});

	// A pouch is not some fixed number of pieces; it is how one product is
	// packaged.
	it('refuses count units, whose members have no fixed relation', () => {
		expect(convertUnitAmount(3, 'pouch', 'each')).toBeNull();
		expect(lookupUnitConversion('pouch')).toEqual({ kind: 'notConvertible', unitType: 'count' });
	});

	it('reports an unrecognised code as unknown rather than refusing quietly', () => {
		expect(lookupUnitConversion('hogshead')).toEqual({ kind: 'unknown' });
		expect(convertUnitAmount(1, 'hogshead', 'gallon')).toBeNull();
	});
});

describe('totalInUnit', () => {
	it('adds measurements taken in different units of the same quantity', () => {
		const total = totalInUnit(
			[
				{ unitCode: 'gallon', amount: 12 },
				{ unitCode: 'fluid_ounce', amount: 128 },
			],
			'gallon',
		);

		expect(total).toBeCloseTo(13, 9);
	});

	// All or nothing: a total that silently dropped what it could not convert
	// would look exactly like one that included it.
	it('gives no total at all when any single measurement cannot get there', () => {
		expect(
			totalInUnit(
				[
					{ unitCode: 'gallon', amount: 12 },
					{ unitCode: 'pouch', amount: 4 },
				],
				'gallon',
			),
		).toBeNull();
	});

	it('totals an empty list as zero', () => {
		expect(totalInUnit([], 'gallon')).toBe(0);
	});
});

describe('base units', () => {
	// The base is a declaration and the factors are data; nothing but this stops
	// them disagreeing. A base whose own factor is not 1 would skew every
	// conversion of its type by a constant — the kind of wrong that looks right.
	it('gives each type exactly one base, and that base a factor of 1', () => {
		for (const [unitType, baseCode] of Object.entries(UNIT_TYPE_BASE_CODES)) {
			const lookup = lookupUnitConversion(baseCode);

			expect(lookup, `${unitType} base ${baseCode} is missing`).toMatchObject({
				kind: 'convertible',
				unitType,
				factorToBase: 1,
			});
		}

		const basesByType = new Map<string, string[]>();
		for (const code of knownUnitCodes()) {
			const lookup = lookupUnitConversion(code);
			if (lookup.kind === 'convertible' && lookup.factorToBase === 1) {
				basesByType.set(lookup.unitType, [...(basesByType.get(lookup.unitType) ?? []), code]);
			}
		}

		for (const [unitType, codes] of basesByType) {
			expect(codes, `${unitType} has more than one unit at factor 1`).toHaveLength(1);
		}
	});
});

describe('knownUnitCodes', () => {
	it('names every code the table accounts for, in either category', () => {
		const codes = knownUnitCodes();

		expect(codes).toContain('gallon');
		expect(codes).toContain('pouch');
		expect(new Set(codes).size).toBe(codes.length);
	});
});
