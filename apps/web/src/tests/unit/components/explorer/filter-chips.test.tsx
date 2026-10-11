/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActiveFilterBar, DateRangeChip, without } from '../../../../components/explorer';

afterEach(cleanup);

const DEFAULTS = { from: '2026-09-09', to: '2026-10-09' };

function renderChip(range: { from: string; to: string }) {
	const setRange = vi.fn();
	render(
		<ActiveFilterBar onClearAll={() => {}}>
			<DateRangeChip defaults={DEFAULTS} range={range} setRange={setRange} />
		</ActiveFilterBar>,
	);
	return setRange;
}

describe('DateRangeChip', () => {
	it('draws nothing while the window is at its default', () => {
		renderChip(DEFAULTS);
		expect(screen.queryByText(/^Dates:/)).toBeNull();
		expect(screen.queryAllByRole('button')).toHaveLength(1);
	});

	it('names a moved window with both bounds', () => {
		renderChip({ from: '2026-06-01', to: '2026-10-09' });
		expect(screen.getByText('Dates: Jun 1–Oct 9')).toBeTruthy();
	});

	it('names a window open at the end', () => {
		renderChip({ from: '2026-06-01', to: '' });
		expect(screen.getByText('Dates: From Jun 1')).toBeTruthy();
	});

	it('names a window open at the start', () => {
		renderChip({ from: '', to: '2026-10-09' });
		expect(screen.getByText('Dates: Until Oct 9')).toBeTruthy();
	});

	it('writes the default bounds back when removed', () => {
		const setRange = renderChip({ from: '2026-06-01', to: '' });
		fireEvent.click(screen.getByRole('button', { name: 'Remove Dates: From Jun 1 filter' }));
		expect(setRange).toHaveBeenCalledTimes(1);
		expect(setRange).toHaveBeenCalledWith({ from: '2026-09-09', to: '2026-10-09' });
	});
});

describe('without', () => {
	it('drops one value and leaves the set it was given alone', () => {
		const set = new Set(['a', 'b']);
		expect([...without(set, 'a')]).toEqual(['b']);
		expect([...set]).toEqual(['a', 'b']);
	});
});
