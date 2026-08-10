/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDateRangeFilters } from '../../../../components/explorer/use-date-range-filters';

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

	// An unbounded side is "All time", not a date to be compared against.
	it('never drags an unbounded side', () => {
		const { setFilters, result } = bind('', '');
		act(() => result.current.onFromChange('2026-07-10'));
		expect(setFilters).toHaveBeenCalledWith({ from: '2026-07-10' });
	});

	it('resolves a preset to a range ending today', () => {
		const { setFilters, result } = bind('2026-07-01', '2026-07-31');
		act(() => result.current.onApplyPreset({ id: '7d', label: 'Last 7 days', days: 7 }));
		expect(setFilters).toHaveBeenCalledWith({ from: '2026-08-04', to: TODAY });
	});

	it('highlights the preset the current range exactly matches', () => {
		expect(bind('2026-08-04', TODAY).result.current.activePresetId).toBe('7d');
		expect(bind('2026-08-03', TODAY).result.current.activePresetId).toBeNull();
		expect(bind('', '').result.current.activePresetId).toBe('all');
	});
});
