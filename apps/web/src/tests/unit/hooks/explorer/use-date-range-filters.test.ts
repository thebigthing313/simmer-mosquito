/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDateRangeFilters } from '../../../../hooks/explorer/use-date-range-filters';
import {
	type DatePreset,
	datePresetRange,
	SCHEDULE_DATE_PRESETS,
	SCHEDULE_WINDOW,
} from '../../../../lib/date-presets';

afterEach(cleanup);

const TODAY = '2026-08-10';

function bind(from: string, to: string) {
	const setFilters = vi.fn();
	const { result } = renderHook(() => useDateRangeFilters({ from, to, today: TODAY, setFilters }));
	return { setFilters, result };
}

/**
 * Eight explorers wrote this wiring out by hand (#101). The rule worth pinning is
 * the one a copy could lose silently: a bound edited past the other drags the
 * other along, so the range never inverts into a window nothing can fall in.
 */
describe('useDateRangeFilters', () => {
	it('drags the end date forward when the start is set past it', () => {
		const { setFilters, result } = bind('2026-07-01', '2026-07-31');
		act(() => result.current.onFromChange('2026-08-05'));
		expect(setFilters).toHaveBeenCalledWith({ from: '2026-08-05', to: '2026-08-05' });
	});

	it('drags the start date back when the end is set before it', () => {
		const { setFilters, result } = bind('2026-07-01', '2026-07-31');
		act(() => result.current.onToChange('2026-06-15'));
		expect(setFilters).toHaveBeenCalledWith({ to: '2026-06-15', from: '2026-06-15' });
	});

	it('leaves the other bound alone when the range stays in order', () => {
		const { setFilters, result } = bind('2026-07-01', '2026-07-31');
		act(() => result.current.onFromChange('2026-07-10'));
		expect(setFilters).toHaveBeenCalledWith({ from: '2026-07-10' });
	});

	// An unbounded side is "All Time", not a date to be compared against.
	it('never drags an unbounded side', () => {
		const { setFilters, result } = bind('', '');
		act(() => result.current.onFromChange('2026-07-10'));
		expect(setFilters).toHaveBeenCalledWith({ from: '2026-07-10' });
	});

	it('resolves a preset to a range ending today', () => {
		const { setFilters, result } = bind('2026-07-01', '2026-07-31');
		act(() => result.current.onApplyPreset({ id: '7d', label: 'Last 7 Days', days: 7 }));
		expect(setFilters).toHaveBeenCalledWith({ from: '2026-08-04', to: TODAY });
	});

	it('highlights the preset the current range exactly matches', () => {
		expect(bind('2026-08-04', TODAY).result.current.activePresetId).toBe('7d');
		expect(bind('2026-08-03', TODAY).result.current.activePresetId).toBeNull();
		expect(bind('', '').result.current.activePresetId).toBe('all');
	});

	it('defaults to the history direction', () => {
		expect(bind('2026-07-01', '2026-07-31').result.current.direction).toBe('history');
	});

	// #1432: the Missions and Assignments pages could not reach a day after today
	// once a reader touched a preset, because every preset ended today.
	describe('under the schedule direction', () => {
		function bindSchedule(from: string, to: string) {
			const setFilters = vi.fn();
			const { result } = renderHook(() =>
				useDateRangeFilters({ from, to, today: TODAY, setFilters, direction: 'schedule' }),
			);
			return { setFilters, result };
		}

		it('lets a preset set the end after today', () => {
			const { setFilters, result } = bindSchedule('2026-08-03', '2026-08-24');
			const next30 = SCHEDULE_DATE_PRESETS.find((preset) => preset.id === 'next-30d');
			expect(next30).toBeDefined();
			act(() => result.current.onApplyPreset(next30 as DatePreset));
			expect(setFilters).toHaveBeenCalledWith({ from: TODAY, to: '2026-09-08' });
		});

		it('lights the default window, which a history binding does not', () => {
			const { from, to } = datePresetRange(SCHEDULE_WINDOW, TODAY);
			expect(bindSchedule(from, to).result.current.activePresetId).toBe(SCHEDULE_WINDOW.id);
			expect(bindSchedule(from, to).result.current.direction).toBe('schedule');
			expect(bind(from, to).result.current.activePresetId).toBeNull();
		});
	});
});
