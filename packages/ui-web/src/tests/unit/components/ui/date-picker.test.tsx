// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatePicker } from '../../../../components/ui/date-picker';

/**
 * The three screens the popover holds, and what a bound puts out of reach.
 *
 * The picker used to page a month at a time with the caption above the arrows
 * inert, so a day three years back was 36 presses of one control. The cases
 * here are the ones that failure turns on: that each half of the caption opens
 * a grid, that a grid hands the calendar back on the month or year it was
 * given, and that `min`/`max` reach the months and years rather than stopping
 * at the days.
 */

// Radix's popper measures on open, and jsdom ships neither observer.
class NoopResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;
// `scrollIntoView` is what `Calendar` calls on the focused day.
Element.prototype.scrollIntoView ??= () => {};

/** A day in the middle of a decade, so a page boundary is never what a case is measuring. */
const SEPTEMBER_10_2026 = new Date(2026, 8, 10);

function openPicker(props: Partial<Parameters<typeof DatePicker>[0]> = {}) {
	const onChange = vi.fn();
	render(<DatePicker onChange={onChange} value={SEPTEMBER_10_2026} {...props} />);
	fireEvent.click(screen.getByRole('button', { name: /Sep 10, 2026/ }));
	return { onChange };
}

/**
 * Whichever grid is in front.
 *
 * Scoped, because the day grid stays in the flow behind it holding the height
 * open. It is `inert`, so a screen reader is not offered its controls and a
 * keyboard cannot reach them, but jsdom's queries walk the DOM rather than the
 * accessibility tree and would find the caption twice.
 */
function frontScreen() {
	return within(screen.getByRole('group'));
}

/** The text of every cell in the front grid, arrows excluded. */
function gridCells(): readonly string[] {
	const cells = screen.getByRole('group').querySelectorAll('.grid button');
	return [...cells].map((button) => button.textContent ?? '');
}

describe('DatePicker', () => {
	beforeEach(() => {
		vi.setSystemTime(SEPTEMBER_10_2026);
	});

	afterEach(() => {
		vi.useRealTimers();
		cleanup();
	});

	it('opens on the day grid, with each half of the caption its own control', () => {
		openPicker();

		expect(screen.getByRole('button', { name: 'Pick a month' }).textContent).toContain('September');
		expect(screen.getByRole('button', { name: 'Pick a year' }).textContent).toContain('2026');
		expect(screen.queryByRole('group')).toBeNull();
	});

	it('hands the calendar back on the month picked from the month grid', () => {
		openPicker();

		fireEvent.click(screen.getByRole('button', { name: 'Pick a month' }));
		expect(gridCells()).toContain('Mar');

		fireEvent.click(frontScreen().getByText('Mar'));
		expect(screen.queryByRole('group')).toBeNull();
		expect(screen.getByRole('button', { name: 'Pick a month' }).textContent).toContain('March');
	});

	/*
	 * A decade with the year either side of it, rather than a page aligned to
	 * twelve. Twelve-aligned pages read "2016 to 2027", which is a window nobody
	 * has in mind on a screen whose whole job is aiming at a year.
	 */
	it('opens the year grid on the decade the current year is in', () => {
		openPicker();

		fireEvent.click(screen.getByRole('button', { name: 'Pick a year' }));

		expect(screen.getByText('2019–2030')).toBeTruthy();
		expect(gridCells()).toEqual([
			'2019',
			'2020',
			'2021',
			'2022',
			'2023',
			'2024',
			'2025',
			'2026',
			'2027',
			'2028',
			'2029',
			'2030',
		]);
	});

	it('steps the year grid a decade at a time and drops back through the months', () => {
		openPicker();

		fireEvent.click(screen.getByRole('button', { name: 'Pick a year' }));
		fireEvent.click(screen.getByRole('button', { name: 'Previous decade' }));
		expect(screen.getByText('2009–2020')).toBeTruthy();

		fireEvent.click(frontScreen().getByText('2012'));
		// The year grid hands over to the months, not straight to the days: the
		// reader who came here to reach 2012 still has to say which month of it.
		expect(screen.getByRole('group').getAttribute('aria-label')).toBe('Pick a month');

		fireEvent.click(frontScreen().getByText('Jul'));
		expect(screen.getByRole('button', { name: 'Pick a year' }).textContent).toContain('2012');
		expect(screen.getByRole('button', { name: 'Pick a month' }).textContent).toContain('July');
	});

	it('selects today and closes', () => {
		const { onChange } = openPicker();

		fireEvent.click(screen.getByRole('button', { name: 'Today' }));

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange.mock.calls[0]?.[0]).toEqual(new Date(2026, 8, 10));
		expect(screen.queryByRole('button', { name: 'Pick a month' })).toBeNull();
	});

	/*
	 * The half a day-level bound used to miss. `max` reached the day cells and
	 * nothing else, so a reader could walk the month grid into a year that had
	 * no selectable day in it and meet a calendar of greyed numbers with nothing
	 * saying why.
	 */
	it('greys out the months and years a max puts out of reach', () => {
		openPicker({ max: SEPTEMBER_10_2026 });

		fireEvent.click(screen.getByRole('button', { name: 'Pick a month' }));
		expect(frontScreen().getByText('Sep').closest('button')?.disabled).toBe(false);
		expect(frontScreen().getByText('Oct').closest('button')?.disabled).toBe(true);

		fireEvent.click(frontScreen().getByRole('button', { name: 'Pick a year' }));
		expect(frontScreen().getByText('2026').closest('button')?.disabled).toBe(false);
		expect(frontScreen().getByText('2027').closest('button')?.disabled).toBe(true);
		expect(
			frontScreen().getByRole<HTMLButtonElement>('button', { name: 'Next decade' }).disabled,
		).toBe(true);
	});

	/*
	 * The month a bound falls inside stays open. A `min` of the 15th leaves the
	 * second half of that month selectable, so disabling the whole month would
	 * put a reachable day behind a control that refuses to open on it.
	 */
	it('keeps the month a bound falls inside selectable', () => {
		openPicker({ min: new Date(2026, 8, 15) });

		fireEvent.click(screen.getByRole('button', { name: 'Pick a month' }));

		expect(frontScreen().getByText('Sep').closest('button')?.disabled).toBe(false);
		expect(frontScreen().getByText('Aug').closest('button')?.disabled).toBe(true);
	});

	it('offers no Today where today is out of range', () => {
		openPicker({ max: new Date(2026, 7, 31) });

		expect(screen.getByRole('button', { name: 'Today' }).getAttribute('disabled')).not.toBeNull();
	});

	/*
	 * A reader who drilled to the year grid and pressed Escape must not reopen on
	 * a wall of years. The panel is keyed on the popover's open flag for this.
	 */
	it('reopens on the day grid', () => {
		openPicker();

		fireEvent.click(screen.getByRole('button', { name: 'Pick a year' }));
		expect(screen.getByRole('group')).toBeTruthy();

		fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		fireEvent.click(screen.getByRole('button', { name: /Sep 10, 2026/ }));

		expect(screen.queryByRole('group')).toBeNull();
	});
});
