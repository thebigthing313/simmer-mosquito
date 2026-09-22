import {
	OVERVIEW_RATIOS,
	OVERVIEW_RECORD_TYPES,
	type OverviewRatioRow,
	type OverviewRecordType,
	type OverviewResponse,
	type OverviewTypeRow,
} from '@simmer-mosquito/domain';

/**
 * One `GET /overview/day` answer for 2026-09-15, shaped the way the reader
 * shapes it: every type present, two never recorded, a three-day series so a
 * suite can count points, and the ratio rows carrying one zero denominator.
 * A day has two columns, the day and the day before.
 */
export function dayOverview(overrides: Partial<OverviewResponse> = {}): OverviewResponse {
	const series = ['2026-09-13', '2026-09-14', '2026-09-15'];
	const values: Readonly<Record<OverviewRecordType, readonly (number | null)[]>> = {
		inspections: [120, 98],
		samples: [7, 3],
		collections: [26, 0],
		applications: [61, 55],
		sourceReductions: [4, 2],
		releases: [0, 0],
		serviceRequests: [3, 5],
		outreachActions: [0, 0],
	};
	const recordedEver: Readonly<Record<OverviewRecordType, boolean>> = {
		inspections: true,
		samples: true,
		collections: true,
		applications: true,
		sourceReductions: true,
		releases: false,
		serviceRequests: true,
		outreachActions: false,
	};
	const types = OVERVIEW_RECORD_TYPES.map(
		(type): OverviewTypeRow => ({
			type,
			recordedEver: recordedEver[type],
			values: values[type],
			averageYears: 0,
			series: series.map((period, index) => ({ period, value: index + 1 })),
		}),
	);
	const ratios = OVERVIEW_RATIOS.map(
		(ratio): OverviewRatioRow => ({
			ratio,
			numerators: ratio === 'positiveInspections' ? [41, 30] : [3210, 0],
			denominators: ratio === 'positiveInspections' ? [120, 98] : [26, 0],
			averageYears: 0,
			series: series.map((period) => ({ period, numerator: 2, denominator: 4 })),
		}),
	);
	return {
		grain: 'day',
		period: '2026-09-15',
		today: '2026-09-15',
		cutThrough: null,
		earliest: '2011-04-02',
		columns: [
			{ key: 'period', from: '2026-09-15', to: '2026-09-15' },
			{ key: 'previous', from: '2026-09-14', to: '2026-09-14' },
		],
		types,
		ratios,
		...overrides,
	};
}

/**
 * One `GET /overview/month` answer for September 2026 read on the 15th: a
 * partial month cut through the 15th, four columns, a 21-point series over
 * 2025 and 2026 so the grouped bar has a comparison bar with no period bar
 * beside it (October to December 2025), and the same never-recorded types.
 */
export function monthOverview(overrides: Partial<OverviewResponse> = {}): OverviewResponse {
	const months = [
		...Array.from({ length: 12 }, (_, index) => `2025-${`${index + 1}`.padStart(2, '0')}`),
		...Array.from({ length: 9 }, (_, index) => `2026-${`${index + 1}`.padStart(2, '0')}`),
	];
	const values: Readonly<Record<OverviewRecordType, readonly (number | null)[]>> = {
		inspections: [2140, 3980, 2310, 2266.4],
		samples: [90, 140, 101, 88],
		collections: [310, 402, 288, 301.2],
		applications: [1200, 1950, 1104, 1310],
		sourceReductions: [40, 61, 38, 44.6],
		releases: [0, 0, 0, null],
		serviceRequests: [88, 120, 91, 84],
		outreachActions: [0, 0, 0, null],
	};
	const recordedEver: Readonly<Record<OverviewRecordType, boolean>> = {
		inspections: true,
		samples: true,
		collections: true,
		applications: true,
		sourceReductions: true,
		releases: false,
		serviceRequests: true,
		outreachActions: false,
	};
	const types = OVERVIEW_RECORD_TYPES.map(
		(type): OverviewTypeRow => ({
			type,
			recordedEver: recordedEver[type],
			values: values[type],
			averageYears: values[type][3] === null ? 0 : 5,
			series: months.map((period, index) => ({ period, value: index + 1 })),
		}),
	);
	const ratios = OVERVIEW_RATIOS.map(
		(ratio): OverviewRatioRow => ({
			ratio,
			numerators:
				ratio === 'positiveInspections' ? [600, 900, 610, 2400] : [9000, 12000, 8100, 40000],
			denominators:
				ratio === 'positiveInspections' ? [2140, 3980, 2310, 11332] : [290, 380, 270, 1400],
			averageYears: 5,
			series: months.map((period) => ({ period, numerator: 2, denominator: 4 })),
		}),
	);
	return {
		grain: 'month',
		period: '2026-09',
		today: '2026-09-15',
		cutThrough: '2026-09-15',
		earliest: '2011-04-02',
		columns: [
			{ key: 'period', from: '2026-09-01', to: '2026-09-15' },
			{ key: 'previous', from: '2026-08-01', to: '2026-08-15' },
			{ key: 'lastYear', from: '2025-09-01', to: '2025-09-15' },
			{ key: 'average', years: { from: 2021, to: 2025 } },
		],
		types,
		ratios,
		...overrides,
	};
}
