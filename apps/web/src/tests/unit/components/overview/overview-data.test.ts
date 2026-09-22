import { describe, expect, it } from 'vitest';
import {
	columnHeader,
	columnLink,
	cutCaption,
	formatCell,
	formatRatio,
	periodDestination,
	periodSearchCodec,
	periodTitle,
	trendHeading,
} from '../../../../components/overview/overview-data';
import { formatLongDate, formatMonthYear } from '../../../../lib/local-date';

/**
 * The words and the destinations the period-in-review pages compute off a
 * response. `periodDestination` is here rather than in `link-destinations`
 * because a chart click is a `navigate` and there is no `Link` inside an SVG.
 */

describe('periodDestination', () => {
	it('opens each grain on its own page with the period written explicitly', () => {
		expect(periodDestination('day', '2026-09-21')).toEqual({
			to: '/today',
			search: { date: '2026-09-21' },
		});
		expect(periodDestination('month', '2025-07')).toEqual({
			to: '/monthly',
			search: { month: '2025-07' },
		});
	});

	// The router writes a string that reads as a number back as `%222026%22`,
	// so a year travels as a number and the codec reads it back as text.
	it('writes a year as a number, and the codec reads it back', () => {
		expect(periodDestination('year', '2023')).toEqual({ to: '/annual', search: { year: 2023 } });
		expect(periodSearchCodec('year').decode(2023)).toBe('2023');
		expect(periodSearchCodec('year').encode('2023')).toBe(2023);
	});
});

describe('periodSearchCodec', () => {
	it('reads a value of the grain’s shape and nothing else', () => {
		expect(periodSearchCodec('day').decode('2026-09-21')).toBe('2026-09-21');
		expect(periodSearchCodec('day').decode('2026-13-40')).toBe('2026-13-40');
		expect(periodSearchCodec('day').decode('2026-09')).toBeUndefined();
		expect(periodSearchCodec('day').decode('')).toBeUndefined();
		expect(periodSearchCodec('month').decode('2026-09')).toBe('2026-09');
		expect(periodSearchCodec('month').decode('2026-09-21')).toBeUndefined();
		expect(periodSearchCodec('year').decode('26')).toBeUndefined();
	});
});

describe('the words on the page', () => {
	it('names a period at each grain, short and long', () => {
		expect(periodTitle('day', '2026-09-21')).toBe('Sep 21, 2026');
		expect(periodTitle('month', '2026-09')).toBe('Sep 2026');
		expect(periodTitle('year', '2026')).toBe('2026');
		expect(formatLongDate('2026-09-21')).toBe('Monday, September 21, 2026');
		expect(formatMonthYear('2026-09')).toBe('September 2026');
	});

	it('heads a column off the response, the average by its years', () => {
		expect(columnHeader('day', { key: 'previous', from: '2026-09-20', to: '2026-09-20' })).toBe(
			'Sep 20, 2026',
		);
		expect(columnHeader('month', { key: 'lastYear', from: '2025-09-01', to: '2025-09-21' })).toBe(
			'Sep 2025',
		);
		expect(columnHeader('year', { key: 'average', years: { from: 2021, to: 2025 } })).toBe(
			'2021–2025 average',
		);
	});

	it('captions a partial month by the ordinal and a partial year by the date, and a day never', () => {
		expect(cutCaption('month', '2026-09-21')).toBe('Each period through the 21st');
		expect(cutCaption('month', '2026-09-02')).toBe('Each period through the 2nd');
		expect(cutCaption('month', '2026-09-13')).toBe('Each period through the 13th');
		expect(cutCaption('year', '2026-09-21')).toBe('Each period through Sep 21');
		expect(cutCaption('month', null)).toBeNull();
		expect(cutCaption('day', '2026-09-21')).toBeNull();
	});

	it('heads the trend section per grain', () => {
		expect(trendHeading('day', '2026-09-21')).toBe('2026 by day');
		expect(trendHeading('month', '2026-09')).toBe('2026 by month, beside 2025');
		expect(trendHeading('year', '2026')).toBe('By year');
	});

	it('formats a share to whole points, a rate to one decimal, and an average to one', () => {
		expect(formatRatio('positiveInspections', 0.3417)).toBe('34%');
		expect(formatRatio('mosquitoesPerCollection', 12.44)).toBe('12.4');
		expect(formatCell(3210)).toBe('3,210');
		expect(formatCell(104.44)).toBe('104.4');
	});
});

describe('columnLink', () => {
	it('spans the column’s whole period at the page’s grain, and links no average', () => {
		expect(
			columnLink('month', 'applications', { key: 'period', from: '2026-09-01', to: '2026-09-21' }),
		).toEqual({
			to: '/control-operations/chemical',
			search: { from: '2026-09-01', to: '2026-09-30' },
		});
		expect(
			columnLink('year', 'serviceRequests', {
				key: 'previous',
				from: '2025-01-01',
				to: '2025-09-21',
			}),
		).toEqual({
			to: '/public-engagement/service-requests',
			search: { status: 'all', from: '2025-01-01', to: '2025-12-31' },
		});
		expect(
			columnLink('day', 'inspections', { key: 'average', years: { from: 2021, to: 2025 } }),
		).toBeNull();
	});
});
