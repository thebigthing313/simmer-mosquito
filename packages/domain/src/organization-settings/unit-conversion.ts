/**
 * How many of one unit make another.
 *
 * The `units` table deliberately carries no factor and no base-unit column: a
 * unit pointing at another unit is a self-reference in the schema, and the
 * agency-facing tables already reference units heavily. So units are matched by
 * their stable `code`, and the arithmetic lives here, in one place, keyed to
 * those codes.
 *
 * The tradeoff is accepted and worth stating: **adding a unit to the database
 * means adding it here too.** A unit this table does not know is not a silent
 * zero — it makes a total unavailable, and callers fall back to reporting each
 * unit separately, which is what they did before any of this existed. A
 * database-backed test asserts every seeded unit is accounted for, so the
 * omission surfaces as a failure rather than as a number nobody checks.
 *
 * Each type has one base unit, and a unit carries only its factor to that
 * base; converting between two units of a type goes through it.
 *
 * Every factor is exact by definition, not measured: the international yard and
 * pound agreement (1959) fixes the yard at 0.9144 m and the pound at
 * 0.45359237 kg, and the US gallon is 231 cubic inches exactly. The bases are
 * chosen so that each factor is exact in decimal too, which is what keeps a
 * conversion and its reverse lossless.
 */

import type { UnitType } from './types-and-defaults.js';

/**
 * The unit types whose members convert by multiplication alone.
 *
 * `temperature` is absent because it does not: °C to °F is affine (×9/5 + 32),
 * and a factor cannot express an offset. `count` is absent because its members
 * are not related at all — a pouch is not some fixed number of pieces, it is
 * how a particular product is packaged, and totalling them would invent a
 * quantity nobody applied.
 */
export type ConvertibleUnitType = Exclude<UnitType, 'temperature' | 'count'>;

/**
 * The unit each convertible type is measured against.
 *
 * A real code from the catalog rather than an abstract quantity, so that a
 * factor is always "how many of a unit somebody actually uses", and so the
 * base is checkable: exactly one unit per type carries a factor of 1.
 *
 * The choice per type is whichever base makes every factor exact in decimal.
 * Teaspoons rather than gallons for volume, because a teaspoon is a
 * seven-hundred-and-sixty-eighth of a gallon and the reciprocal repeats;
 * square feet rather than acres for area, for the same reason.
 */
export const UNIT_TYPE_BASE_CODES: Readonly<Record<ConvertibleUnitType, string>> = {
	weight: 'gram',
	distance: 'meter',
	area: 'square_foot',
	volume: 'teaspoon',
	duration: 'second',
	speed: 'kilometers_per_hour',
};

interface ConvertibleUnit {
	readonly unitType: ConvertibleUnitType;
	/** How many of this type's base unit one of this unit is. */
	readonly factorToBase: number;
}

const CONVERTIBLE_UNITS: Readonly<Record<string, ConvertibleUnit>> = {
	// Mass, in grams. The pound is 0.45359237 kg exactly; the ounce is a
	// sixteenth of it.
	gram: { unitType: 'weight', factorToBase: 1 },
	kilogram: { unitType: 'weight', factorToBase: 1000 },
	ounce: { unitType: 'weight', factorToBase: 28.349523125 },
	pound: { unitType: 'weight', factorToBase: 453.59237 },

	// Length, in metres. The foot is 0.3048 m exactly; the mile is 5280 feet.
	meter: { unitType: 'distance', factorToBase: 1 },
	foot: { unitType: 'distance', factorToBase: 0.3048 },
	mile: { unitType: 'distance', factorToBase: 1609.344 },

	// Area, in square feet. The acre is one chain by one furlong — 66 ft by 660
	// ft — which is 43,560 square feet exactly.
	square_foot: { unitType: 'area', factorToBase: 1 },
	acre: { unitType: 'area', factorToBase: 43560 },

	// Volume, in US teaspoons, where every other measure is a whole number of
	// them: 3 to the tablespoon, 6 to the fluid ounce, 768 to the gallon.
	teaspoon: { unitType: 'volume', factorToBase: 1 },
	tablespoon: { unitType: 'volume', factorToBase: 3 },
	fluid_ounce: { unitType: 'volume', factorToBase: 6 },
	gallon: { unitType: 'volume', factorToBase: 768 },

	second: { unitType: 'duration', factorToBase: 1 },
	minute: { unitType: 'duration', factorToBase: 60 },
	hour: { unitType: 'duration', factorToBase: 3600 },
	day: { unitType: 'duration', factorToBase: 86400 },

	kilometers_per_hour: { unitType: 'speed', factorToBase: 1 },
	miles_per_hour: { unitType: 'speed', factorToBase: 1.609344 },
};

/**
 * Units that exist and deliberately do not convert.
 *
 * Named rather than merely absent, so that "we decided this one cannot be
 * totalled" is distinguishable from "nobody has added this one yet". The
 * database-backed test relies on that difference.
 */
const NON_CONVERTIBLE_UNITS: Readonly<Record<string, UnitType>> = {
	celsius: 'temperature',
	fahrenheit: 'temperature',
	count: 'count',
	each: 'count',
	piece: 'count',
	pouch: 'count',
};

export type UnitConversionLookup =
	| {
			readonly kind: 'convertible';
			readonly unitType: ConvertibleUnitType;
			readonly factorToBase: number;
	  }
	| { readonly kind: 'notConvertible'; readonly unitType: UnitType }
	| { readonly kind: 'unknown' };

/** What this table knows about a unit code. */
export function lookupUnitConversion(unitCode: string): UnitConversionLookup {
	const convertible = CONVERTIBLE_UNITS[unitCode];
	if (convertible !== undefined) {
		return {
			kind: 'convertible',
			unitType: convertible.unitType,
			factorToBase: convertible.factorToBase,
		};
	}

	const nonConvertible = NON_CONVERTIBLE_UNITS[unitCode];
	if (nonConvertible !== undefined) {
		return { kind: 'notConvertible', unitType: nonConvertible };
	}

	return { kind: 'unknown' };
}

/**
 * `amount` of `fromUnitCode`, expressed in `toUnitCode`.
 *
 * `null` when either unit is unknown or does not convert, and when the two
 * measure different kinds of quantity — gallons into pounds is not a rounding
 * question, it is a category error, and returning a number for it would be
 * worse than returning nothing.
 */
export function convertUnitAmount(
	amount: number,
	fromUnitCode: string,
	toUnitCode: string,
): number | null {
	const from = lookupUnitConversion(fromUnitCode);
	const to = lookupUnitConversion(toUnitCode);
	if (from.kind !== 'convertible' || to.kind !== 'convertible') {
		return null;
	}

	if (from.unitType !== to.unitType) {
		return null;
	}

	return (amount * from.factorToBase) / to.factorToBase;
}

export interface UnitAmount {
	readonly unitCode: string;
	readonly amount: number;
}

/**
 * Several measurements of the same thing, as one number in `toUnitCode`.
 *
 * `null` if any single one of them cannot get there. All or nothing on purpose:
 * a total that quietly dropped the two litres it could not convert would be
 * indistinguishable from a total that included them.
 */
export function totalInUnit(amounts: readonly UnitAmount[], toUnitCode: string): number | null {
	let total = 0;
	for (const { unitCode, amount } of amounts) {
		const converted = convertUnitAmount(amount, unitCode, toUnitCode);
		if (converted === null) {
			return null;
		}
		total += converted;
	}

	return total;
}

/** Every unit code this table accounts for, convertible or deliberately not. */
export function knownUnitCodes(): readonly string[] {
	return [...Object.keys(CONVERTIBLE_UNITS), ...Object.keys(NON_CONVERTIBLE_UNITS)];
}
