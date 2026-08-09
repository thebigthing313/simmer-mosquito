import { DEFAULT_UNIT_DEFAULTS } from '@simmer-mosquito/domain';
import type { UnitRow } from '@simmer-mosquito/sync';
import { describe, expect, it } from 'vitest';
import { usageTotal } from './-control-display';

function unit(
	id: string,
	code: string,
	abbreviation: string,
	unitType: UnitRow['unitType'],
): UnitRow {
	return {
		id,
		code,
		unitName: code,
		abbreviation,
		unitType,
		unitSystem: 'us_customary',
		createdAt: '2026-08-01T00:00:00.000Z',
	};
}

const GALLON = unit('u-gallon', 'gallon', 'gal', 'volume');
const FLUID_OUNCE = unit('u-floz', 'fluid_ounce', 'fl oz', 'volume');
const POUCH = unit('u-pouch', 'pouch', 'pch', 'count');
const POUND = unit('u-pound', 'pound', 'lb', 'weight');

const UNITS = [GALLON, FLUID_OUNCE, POUCH, POUND];

function total(totals: ReadonlyArray<readonly [UnitRow, number]>) {
	return usageTotal({
		totalsByUnitId: new Map(totals.map(([row, amount]) => [row.id, amount])),
		unitById: new Map(UNITS.map((row) => [row.id, row])),
		unitByCode: new Map(UNITS.map((row) => [row.code, row])),
		// Volume defaults to gallons, weight to pounds.
		unitDefaults: DEFAULT_UNIT_DEFAULTS,
	});
}

describe('usageTotal', () => {
	it('leaves a single unit alone, with nothing to explain', () => {
		expect(total([[GALLON, 12]])).toEqual({ text: '12 gal', convertedFrom: null });
	});

	// The point of #91's third item: 12 gal · 128 fl oz is a true answer to a
	// question nobody asked.
	it('totals two units of the same quantity into the agency default', () => {
		const result = total([
			[GALLON, 12],
			[FLUID_OUNCE, 128],
		]);

		expect(result.text).toBe('13 gal');
		// An operator who recorded ounces has to be able to tell why it says gallons.
		expect(result.convertedFrom).toBe('Totalled from 12 gal · 128 fl oz');
	});

	// A larvicide put out both as pouches and by weight. There is no factor
	// between them, and inventing one would misstate a pesticide record.
	it('keeps units apart when they do not convert', () => {
		const result = total([
			[POUND, 4],
			[POUCH, 6],
		]);

		expect(result.text).toBe('4 lb · 6 pch');
		expect(result.convertedFrom).toBeNull();
	});

	it('keeps count units apart from each other', () => {
		expect(total([[POUCH, 6]]).text).toBe('6 pch');
	});

	// Order must not decide the answer. The convertibility of the *first* entry
	// is what the code inspects to pick a target unit, so the same pair listed
	// the other way round has to reach the same refusal.
	it('keeps them apart whichever unit comes first', () => {
		const pouchFirst = total([
			[POUCH, 6],
			[POUND, 4],
		]);

		expect(pouchFirst.text).toBe('6 pch · 4 lb');
		expect(pouchFirst.convertedFrom).toBeNull();
	});

	// Rounding is the formatter's, not the conversion's: a third of a gallon is
	// shown to two places rather than in full.
	it('formats a fractional total the way every other amount is formatted', () => {
		const result = total([
			[GALLON, 1],
			[FLUID_OUNCE, 64],
		]);

		expect(result.text).toBe('1.50 gal');
	});

	it('falls back to the separated list when a unit is not in the catalog', () => {
		const result = usageTotal({
			totalsByUnitId: new Map([
				[GALLON.id, 3],
				['u-missing', 5],
			]),
			unitById: new Map([[GALLON.id, GALLON]]),
			unitByCode: new Map([[GALLON.code, GALLON]]),
			unitDefaults: DEFAULT_UNIT_DEFAULTS,
		});

		expect(result.text).toBe('3 gal · 5');
		expect(result.convertedFrom).toBeNull();
	});
});
