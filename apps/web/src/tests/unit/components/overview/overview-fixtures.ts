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
