/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateRangeFilter } from '../../../components/date-range-filter';
import type { DateDirection } from '../../../lib/date-presets';

const TODAY = '2026-09-10';

function renderFilter(direction?: DateDirection) {
	render(
		<DateRangeFilter
			activePresetId={null}
			from="2026-09-01"
			onApplyPreset={vi.fn()}
			onFromChange={vi.fn()}
			onToChange={vi.fn()}
			to={TODAY}
			today={TODAY}
			{...(direction === undefined ? {} : { direction })}
		/>,
	);
}

function presetLabels(): readonly string[] {
	return screen
		.getAllByRole('button', { pressed: false })
		.map((button) => button.textContent ?? '');
}

/** Opens the End picker's month grid and says whether October can be picked. */
function octoberReachableFromEnd(): boolean {
	fireEvent.click(screen.getByRole('button', { name: 'End date' }));
	fireEvent.click(screen.getByRole('button', { name: 'Pick a month' }));
	const october = within(screen.getByRole('group')).getByText('Oct').closest('button');
	return october?.disabled === false;
}

/*
 * #1432: the Missions and Assignments pages drew the history control, so End
 * stopped at today and every preset ended today, and a reader who touched
 * either could not get back to next week's work.
 */
describe('DateRangeFilter', () => {
	beforeEach(() => {
		vi.setSystemTime(new Date(2026, 8, 10));
	});

	afterEach(() => {
		vi.useRealTimers();
		cleanup();
	});

	it('draws the history presets and stops End at today when no direction is given', () => {
		renderFilter();
		expect(presetLabels()).toEqual([
			'Last 7 Days',
			'Last 30 Days',
			'Last 90 Days',
			'This Year',
			'Last 12 Months',
			'All Time',
		]);
		expect(octoberReachableFromEnd()).toBe(false);
	});

	it('draws the schedule presets and lets End run past today under schedule', () => {
		renderFilter('schedule');
		expect(presetLabels()).toEqual([
			'Recent and Upcoming',
			'Next 7 Days',
			'Next 30 Days',
			'Last 7 Days',
			'All Time',
		]);
		expect(octoberReachableFromEnd()).toBe(true);
	});
});
