import { describe, expect, it } from 'vitest';
import {
	activeDatePresetId,
	DATE_PRESETS,
	DATE_PRESETS_BY_DIRECTION,
	type DatePreset,
	datePresetRange,
	SCHEDULE_DATE_PRESETS,
	SCHEDULE_WINDOW,
	startOfYear,
} from '../../../lib/date-presets';

const THIS_YEAR: DatePreset = { id: 'year', label: 'This Year', days: 'year' };

describe('the This year preset', () => {
	it('runs from the first of January through today', () => {
		expect(datePresetRange(THIS_YEAR, '2026-09-15')).toEqual({
			from: '2026-01-01',
			to: '2026-09-15',
		});
	});

	it('reads the year off today, so it turns over on the first of January', () => {
		expect(startOfYear('2026-12-31')).toBe('2026-01-01');
		expect(startOfYear('2027-01-01')).toBe('2027-01-01');
	});

	it('lights when the range is this year to date and not otherwise', () => {
		expect(activeDatePresetId('2026-01-01', '2026-09-15', '2026-09-15')).toBe('year');
		// Last year's whole window is a range the reader set, not this preset.
		expect(activeDatePresetId('2025-01-01', '2026-09-15', '2026-09-15')).toBeNull();
	});
});

describe('the schedule presets', () => {
	// Late September, so the forward windows cross a month end.
	const TODAY = '2026-09-25';

	const rangeOf = (id: string) => {
		const preset = SCHEDULE_DATE_PRESETS.find((candidate) => candidate.id === id);
		if (preset === undefined) {
			throw new Error(`no schedule preset ${id}`);
		}
		return datePresetRange(preset, TODAY);
	};

	it('opens on the default window, a week back through a fortnight ahead', () => {
		expect(SCHEDULE_DATE_PRESETS[0]).toBe(SCHEDULE_WINDOW);
		expect(datePresetRange(SCHEDULE_WINDOW, TODAY)).toEqual({
			from: '2026-09-18',
			to: '2026-10-09',
		});
	});

	it('resolves each preset to its window around today', () => {
		expect(SCHEDULE_DATE_PRESETS.map((preset) => preset.id)).toEqual([
			SCHEDULE_WINDOW.id,
			'next-7d',
			'next-30d',
			'7d',
			'all',
		]);
		expect(rangeOf('next-7d')).toEqual({ from: TODAY, to: '2026-10-01' });
		expect(rangeOf('next-30d')).toEqual({ from: TODAY, to: '2026-10-24' });
		expect(rangeOf('7d')).toEqual({ from: '2026-09-19', to: TODAY });
		expect(rangeOf('all')).toEqual({ from: '', to: '' });
	});

	it('lights the default window and a forward preset, and nothing for a hand-picked range', () => {
		expect(activeDatePresetId('2026-09-18', '2026-10-09', TODAY, SCHEDULE_DATE_PRESETS)).toBe(
			SCHEDULE_WINDOW.id,
		);
		expect(activeDatePresetId(TODAY, '2026-10-24', TODAY, SCHEDULE_DATE_PRESETS)).toBe('next-30d');
		expect(activeDatePresetId(TODAY, '2026-10-23', TODAY, SCHEDULE_DATE_PRESETS)).toBeNull();
	});

	it('leaves the history set as the default, where nothing forward lights', () => {
		expect(DATE_PRESETS_BY_DIRECTION.history).toBe(DATE_PRESETS);
		expect(DATE_PRESETS_BY_DIRECTION.schedule).toBe(SCHEDULE_DATE_PRESETS);
		expect(activeDatePresetId(TODAY, '2026-10-24', TODAY)).toBeNull();
	});
});
