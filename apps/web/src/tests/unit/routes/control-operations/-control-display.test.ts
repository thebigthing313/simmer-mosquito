import { DEFAULT_UNIT_DEFAULTS } from '@simmer-mosquito/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	formatActionDate,
	formatMeasure,
	usageTotal,
} from '../../../../routes/control-operations/-control-display';

/**
 * What `usageTotal` actually reads off a unit: the conversion key and what gets
 * printed. It takes a structural `MeasureUnit`, so building a whole unit row
 * here claimed a dependency the code does not have — and pinned the test to a
 * row type the app no longer holds.
 *
 * `id` is not read by the subject; it is how these fixtures key the two maps.
 */
interface TestUnit {
	readonly id: string;
	readonly code: string;
	readonly abbreviation: string;
}

function unit(id: string, code: string, abbreviation: string): TestUnit {
	return { id, code, abbreviation };
}

const GALLON = unit('u-gallon', 'gallon', 'gal');
const FLUID_OUNCE = unit('u-floz', 'fluid_ounce', 'fl oz');
const POUCH = unit('u-pouch', 'pouch', 'pch');
const POUND = unit('u-pound', 'pound', 'lb');

const UNITS = [GALLON, FLUID_OUNCE, POUCH, POUND];

function total(totals: ReadonlyArray<readonly [TestUnit, number]>) {
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
	it('totals two units of the same quantity into the organization default', () => {
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

describe('formatMeasure', () => {
	let warn: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warn.mockRestore();
	});

	it('keeps a whole amount whole and takes a fraction to two places', () => {
		expect(formatMeasure(12, 'gal')).toBe('12 gal');
		expect(formatMeasure(1.5, 'gal')).toBe('1.50 gal');
	});

	it('writes the amount bare when the unit is not known', () => {
		expect(formatMeasure(12, null)).toBe('12');
	});

	// It already read `NaN gal`, silently: neither is an integer and `toFixed`
	// writes both out. #609 kept the string and added the line that says so.
	it('keeps a non-finite amount on screen, and says it would not render', () => {
		expect(formatMeasure(Number.NaN, 'gal')).toBe('NaN gal');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatMeasure');
	});
});

/**
 * A control action's date is a day, and this is one of the two formatters that
 * builds a local `Date` on purpose: `toLocaleDateString` with no zone reads the
 * local parts back, so the two cancel.
 *
 * The rendered label is the reader's locale, so what is asserted here is the day
 * rather than the wording. Reading the string as an instant is what would move
 * it, and that is the failure these cases are for.
 */
describe('formatActionDate', () => {
	let warn: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warn.mockRestore();
	});

	it('renders the day that was recorded, whatever zone the reader is in', () => {
		const label = formatActionDate('2026-08-12');
		expect(label).toContain('12');
		expect(label).toContain('2026');
		expect(label).not.toContain('11');
	});

	it('reads the day a timestamp begins on', () => {
		expect(formatActionDate('2026-08-12T23:30:00Z')).toBe(formatActionDate('2026-08-12'));
	});

	it('hands back a date it cannot read, and says so', () => {
		expect(formatActionDate('12 August')).toBe('12 August');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatActionDate');
	});
});
