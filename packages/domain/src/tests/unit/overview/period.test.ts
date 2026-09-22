import { describe, expect, it } from 'vitest';
import {
	currentOverviewPeriod,
	overviewPeriodSpan,
	overviewScanWindow,
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

	it('has no lower bound on the year grain, because the series is the whole history', () => {
		expect(overviewScanWindow('year', '2020', TODAY)).toEqual({ from: null, to: TODAY });
	});

	it('names the current period at each grain', () => {
		expect(currentOverviewPeriod('month', '2026-01-05')).toBe('2026-01');
	});
});
