import { describe, expect, it } from 'vitest';
import {
	aggregateOverview,
	OVERVIEW_RECORD_TYPES,
	type OverviewColumn,
	type OverviewDailyRow,
	type OverviewGrain,
	type OverviewRecordType,
	type OverviewResponse,
} from '../../../index.js';

/**
 * The cut arithmetic, over daily rows and no database. Each case names the
 * rule in `docs/today-spec.md` it holds: the same calendar date within each
 * earlier period, clamped to that period's last day, a year qualifying on any
 * row, the pooled ratio, and the series carrying whole periods.
 */

function perType<T>(value: T): Readonly<Record<OverviewRecordType, T>> {
	const record = {} as Record<OverviewRecordType, T>;
	for (const type of OVERVIEW_RECORD_TYPES) {
		record[type] = value;
	}
	return record;
}

const NOTHING = perType<readonly OverviewDailyRow[]>([]);
const NEVER = perType<string | null>(null);

function day(date: string, count: number, ratio?: readonly [number, number]): OverviewDailyRow {
	return ratio === undefined
		? { day: date, count }
		: { day: date, count, numerator: ratio[0], denominator: ratio[1] };
}

function read(
	grain: OverviewGrain,
	period: string,
	today: string,
	rows: Partial<Record<OverviewRecordType, readonly OverviewDailyRow[]>> = {},
	earliest: Partial<Record<OverviewRecordType, string | null>> = {},
): OverviewResponse {
	return aggregateOverview({
		grain,
		period,
		today,
		rows: { ...NOTHING, ...rows },
		earliest: { ...NEVER, ...earliest },
	});
}

function row(response: OverviewResponse, type: OverviewRecordType) {
	const found = response.types.find((entry) => entry.type === type);
	if (found === undefined) {
		throw new Error(`No row for ${type}.`);
	}
	return found;
}

function windows(columns: readonly OverviewColumn[]): readonly (string | number)[][] {
	return columns.map((column) =>
		column.key === 'average' ? [column.years.from, column.years.to] : [column.from, column.to],
	);
}

describe('the columns at each grain', () => {
	it('reads a day whole against the day before, the same date last year and five prior years', () => {
		const response = read('day', '2026-09-21', '2026-09-21');

		expect(response.cutThrough).toBeNull();
		expect(windows(response.columns)).toEqual([
			['2026-09-21', '2026-09-21'],
			['2026-09-20', '2026-09-20'],
			['2025-09-21', '2025-09-21'],
			[2021, 2025],
		]);
	});

	it('reads Feb 29 against Feb 28 in a common year', () => {
		const response = read('day', '2024-02-29', '2026-09-21', {
			inspections: [day('2023-02-28', 3), day('2023-03-01', 9), day('2020-02-29', 5)],
		});

		expect(windows(response.columns)[2]).toEqual(['2023-02-28', '2023-02-28']);
		// Last year's column reads Feb 28; the average reads Feb 29 in 2020,
		// which is a leap year, and Feb 28 in the other qualifying year.
		expect(row(response, 'inspections').values).toEqual([0, 0, 3, 4]);
		expect(row(response, 'inspections').averageYears).toBe(2);
	});

	it('cuts a partial month to the same day of each earlier month', () => {
		const response = read('month', '2026-09', '2026-09-21');

		expect(response.cutThrough).toBe('2026-09-21');
		expect(windows(response.columns)).toEqual([
			['2026-09-01', '2026-09-21'],
			['2026-08-01', '2026-08-21'],
			['2025-09-01', '2025-09-21'],
			[2021, 2025],
		]);
	});

	it('reads a March 31 read against the whole of February', () => {
		const response = read('month', '2026-03', '2026-03-31');

		expect(windows(response.columns)[1]).toEqual(['2026-02-01', '2026-02-28']);
	});

	it('reads January against the December before it', () => {
		const response = read('month', '2026-01', '2026-09-21');

		expect(response.cutThrough).toBeNull();
		expect(windows(response.columns)).toEqual([
			['2026-01-01', '2026-01-31'],
			['2025-12-01', '2025-12-31'],
			['2025-01-01', '2025-01-31'],
			[2021, 2025],
		]);
	});

	it('compares a past month whole against whole', () => {
		const response = read('month', '2025-09', '2026-09-21');

		expect(response.cutThrough).toBeNull();
		expect(windows(response.columns)[0]).toEqual(['2025-09-01', '2025-09-30']);
		expect(windows(response.columns)[2]).toEqual(['2024-09-01', '2024-09-30']);
	});

	it('cuts a partial year to the same calendar date and has three columns', () => {
		const response = read('year', '2026', '2026-09-21');

		expect(response.cutThrough).toBe('2026-09-21');
		expect(windows(response.columns)).toEqual([
			['2026-01-01', '2026-09-21'],
			['2025-01-01', '2025-09-21'],
			[2021, 2025],
		]);
	});

	it('cuts a year read on Feb 29 to Feb 28 in a common year', () => {
		const response = read('year', '2028', '2028-02-29');

		expect(windows(response.columns)[1]).toEqual(['2027-01-01', '2027-02-28']);
	});
});

describe('the average column', () => {
	it('divides by the years that hold any record, so a stray row qualifies a year', () => {
		const response = read('month', '2026-09', '2026-09-21', {
			sourceReductions: [
				// 2021 qualifies on one stray row in March and contributes a zero September.
				day('2021-03-04', 1),
				// 2024 holds a September.
				day('2024-09-10', 6),
				day('2024-09-15', 2),
				// A September row after the cut does not count in the window.
				day('2024-09-25', 100),
				// The period's own year is never in the average.
				day('2026-09-02', 7),
			],
		});

		const reductions = row(response, 'sourceReductions');
		expect(reductions.averageYears).toBe(2);
		expect(reductions.values).toEqual([7, 0, 0, 4]);
	});

	it('draws the absence value when no prior year qualifies', () => {
		const response = read('day', '2026-09-21', '2026-09-21', {
			releases: [day('2026-09-21', 2)],
		});

		expect(row(response, 'releases')).toMatchObject({ values: [2, 0, 0, null], averageYears: 0 });
	});

	it('averages a single date on the day grain over the years that hold it', () => {
		const response = read('day', '2026-07-04', '2026-09-21', {
			inspections: [
				day('2025-07-04', 10),
				day('2024-07-04', 20),
				day('2023-05-01', 1),
				day('2022-07-04', 30),
			],
		});

		// 2023 qualifies with a zero on the date; 2021 holds nothing and is skipped.
		expect(row(response, 'inspections').values).toEqual([0, 0, 10, 15]);
		expect(row(response, 'inspections').averageYears).toBe(4);
	});

	it('pools a ratio over the qualifying years of its denominator type', () => {
		const response = read('year', '2026', '2026-09-21', {
			inspections: [
				day('2025-03-01', 10, [2, 10]),
				day('2024-03-01', 10, [8, 10]),
				// A wet-only year: it qualifies and pools a zero numerator.
				day('2023-03-01', 4, [0, 4]),
				day('2026-01-10', 5, [5, 5]),
			],
		});

		const positive = response.ratios[0];
		expect(positive?.ratio).toBe('positiveInspections');
		expect(positive?.numerators).toEqual([5, 2, 10]);
		expect(positive?.denominators).toEqual([5, 10, 24]);
		expect(positive?.averageYears).toBe(3);
	});
});

describe('the zero divisor', () => {
	it('answers zero over zero rather than a number when nothing counts', () => {
		const response = read('day', '2026-09-21', '2026-09-21', {
			collections: [
				// A problem collection: counted in the row, in neither half of the ratio.
				day('2026-09-21', 1, [0, 0]),
			],
		});

		expect(row(response, 'collections').values).toEqual([1, 0, 0, null]);
		expect(response.ratios[1]).toMatchObject({
			ratio: 'mosquitoesPerCollection',
			numerators: [0, 0, 0, 0],
			denominators: [0, 0, 0, 0],
			averageYears: 0,
		});
	});
});

describe('the series', () => {
	it('runs every day of the picked year through today on the day grain', () => {
		const response = read('day', '2026-09-21', '2026-09-21', {
			inspections: [day('2026-09-21', 4), day('2026-01-01', 1)],
		});

		const series = row(response, 'inspections').series;
		expect(series).toHaveLength(264);
		expect(series[0]).toEqual({ period: '2026-01-01', value: 1 });
		expect(series.at(-1)).toEqual({ period: '2026-09-21', value: 4 });
	});

	it('runs the whole year for a day in a past year', () => {
		const response = read('day', '2024-06-01', '2026-09-21');

		const series = row(response, 'samples').series;
		expect(series).toHaveLength(366);
		expect(series.at(-1)?.period).toBe('2024-12-31');
	});

	it('carries 24 whole months on the month grain and none in the future', () => {
		const response = read('month', '2026-09', '2026-09-21', {
			applications: [day('2025-09-01', 3), day('2025-09-30', 4), day('2026-09-21', 8)],
		});

		const series = row(response, 'applications').series;
		expect(series).toHaveLength(21);
		expect(series[0]?.period).toBe('2025-01');
		expect(series.find((point) => point.period === '2025-09')).toEqual({
			period: '2025-09',
			value: 7,
		});
		// The partial month is a whole point, not a cut one.
		expect(series.at(-1)).toEqual({ period: '2026-09', value: 8 });
	});

	it('runs from the earliest year to the current year on the year grain', () => {
		const response = read(
			'year',
			'2020',
			'2026-09-21',
			{ collections: [day('2014-08-01', 2, [40, 2]), day('2026-08-01', 1, [5, 1])] },
			{ collections: '2014-08-01', inspections: '2019-04-01' },
		);

		expect(response.earliest).toBe('2014-08-01');
		const series = row(response, 'collections').series;
		expect(series.map((point) => point.period)).toEqual([
			'2014',
			'2015',
			'2016',
			'2017',
			'2018',
			'2019',
			'2020',
			'2021',
			'2022',
			'2023',
			'2024',
			'2025',
			'2026',
		]);
		expect(response.ratios[1]?.series[0]).toEqual({
			period: '2014',
			numerator: 40,
			denominator: 2,
		});
	});

	it('starts at the picked year when it is before the earliest record', () => {
		const response = read('year', '2010', '2026-09-21', {}, { inspections: '2015-01-01' });

		expect(row(response, 'inspections').series[0]?.period).toBe('2010');
	});
});

describe('the hidden-type rule', () => {
	it('answers every type with whether it was ever recorded', () => {
		const response = read('day', '2026-09-21', '2026-09-21', {}, { outreachActions: '2026-05-01' });

		expect(response.types.map((entry) => [entry.type, entry.recordedEver])).toEqual([
			['inspections', false],
			['samples', false],
			['collections', false],
			['applications', false],
			['sourceReductions', false],
			['releases', false],
			['serviceRequests', false],
			['outreachActions', true],
		]);
		expect(response.earliest).toBe('2026-05-01');
	});
});
