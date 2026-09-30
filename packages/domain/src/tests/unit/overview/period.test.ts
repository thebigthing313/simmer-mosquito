import { describe, expect, it } from 'vitest';
import {
	currentOverviewPeriod,
	OVERVIEW_TREND_YEARS,
	overviewPeriodSpan,
	overviewScanWindow,
	overviewTrendYears,
	parseOverviewPeriod,
} from '../../../index.js';

const TODAY = '2026-09-21';

describe('parseOverviewPeriod', () => {
	it('answers the current period when nothing is asked for', () => {
		expect(parseOverviewPeriod('day', undefined, TODAY)).toBe('2026-09-21');
		expect(parseOverviewPeriod('month', undefined, TODAY)).toBe('2026-09');
		expect(parseOverviewPeriod('year', undefined, TODAY)).toBe('2026');
	});

	it('keeps a well-formed past or current period', () => {
		expect(parseOverviewPeriod('day', '2024-02-29', TODAY)).toBe('2024-02-29');
		expect(parseOverviewPeriod('day', TODAY, TODAY)).toBe(TODAY);
		expect(parseOverviewPeriod('month', '2026-09', TODAY)).toBe('2026-09');
		expect(parseOverviewPeriod('year', '1990', TODAY)).toBe('1990');
	});

	// A period before `earliest` is legal and reads as zeros; a period before
	// the floor every written date is held to is malformed.
	it('refuses malformed, future and pre-floor periods', () => {
		expect(parseOverviewPeriod('day', '2026-13-40', TODAY)).toBeNull();
		expect(parseOverviewPeriod('day', '2023-02-29', TODAY)).toBeNull();
		expect(parseOverviewPeriod('day', '2026-09-22', TODAY)).toBeNull();
		expect(parseOverviewPeriod('day', '', TODAY)).toBeNull();
		expect(parseOverviewPeriod('month', '2026-13', TODAY)).toBeNull();
		expect(parseOverviewPeriod('month', '2026-10', TODAY)).toBeNull();
		expect(parseOverviewPeriod('month', '2026-09-01', TODAY)).toBeNull();
		expect(parseOverviewPeriod('year', '26', TODAY)).toBeNull();
		expect(parseOverviewPeriod('year', '2031', TODAY)).toBeNull();
		expect(parseOverviewPeriod('year', '1899', TODAY)).toBeNull();
		expect(parseOverviewPeriod('day', '1899-12-31', TODAY)).toBeNull();
	});
});

describe('overviewPeriodSpan', () => {
	it('spans the whole period, the last day included when the period is partial', () => {
		expect(overviewPeriodSpan('day', '2026-09-21')).toEqual({
			from: '2026-09-21',
			to: '2026-09-21',
		});
		expect(overviewPeriodSpan('month', '2026-09')).toEqual({
			from: '2026-09-01',
			to: '2026-09-30',
		});
		expect(overviewPeriodSpan('month', '2024-02')).toEqual({
			from: '2024-02-01',
			to: '2024-02-29',
		});
		expect(overviewPeriodSpan('year', '2026')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
	});
});

describe('overviewScanWindow', () => {
	it('reaches back five years on the month grain, one year on the day grain, and never past today', () => {
		expect(overviewScanWindow('day', '2026-09-21', TODAY)).toEqual({
			from: '2026-01-01',
			to: '2026-09-21',
		});
		expect(overviewScanWindow('day', '2024-06-01', TODAY)).toEqual({
			from: '2024-01-01',
			to: '2024-12-31',
		});
		expect(overviewScanWindow('month', '2026-09', TODAY)).toEqual({
			from: '2021-01-01',
			to: '2026-09-21',
		});
	});

	// The chart's ten years run 2017 to 2026 and the average reaches back to
	// 2015, so the average sets the bound.
	it('reaches back to the average column on the year grain when it starts before the chart', () => {
		expect(overviewScanWindow('year', '2020', TODAY)).toEqual({ from: '2015-01-01', to: TODAY });
	});

	it('reaches back to the chart window on the year grain when it starts before the average', () => {
		expect(overviewScanWindow('year', '2026', TODAY)).toEqual({ from: '2017-01-01', to: TODAY });
	});

	it('ends at the chart window on the year grain when the picked year is more than nine back', () => {
		expect(overviewScanWindow('year', '2010', TODAY)).toEqual({
			from: '2005-01-01',
			to: '2019-12-31',
		});
	});
});

describe('overviewTrendYears', () => {
	it('is the ten years ending at the current year when the picked year is inside them', () => {
		expect(OVERVIEW_TREND_YEARS).toBe(10);
		expect(overviewTrendYears(2026, TODAY)).toEqual({ from: 2017, to: 2026 });
		expect(overviewTrendYears(2017, TODAY)).toEqual({ from: 2017, to: 2026 });
	});

	it('starts at the picked year and runs ten forward when the picked year is older', () => {
		expect(overviewTrendYears(2016, TODAY)).toEqual({ from: 2016, to: 2025 });
		expect(overviewTrendYears(1990, TODAY)).toEqual({ from: 1990, to: 1999 });
	});
});

describe('currentOverviewPeriod', () => {
	it('names the current period at each grain', () => {
		expect(currentOverviewPeriod('month', '2026-01-05')).toBe('2026-01');
	});
});
