/** @vitest-environment jsdom */

/**
 * The zoom overlay over one trend chart: the button that opens it, the three
 * ways out, where focus lands after, and a bar click from inside it. jsdom
 * has no layout, so Recharts draws no bars; the chart is a stand-in that
 * reports the height it was asked for and has one button standing for a bar.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../components/overview/overview-chart', () => ({
	OverviewChart: ({
		height = 'panel',
		onOpenPeriod,
	}: {
		readonly height?: string;
		readonly onOpenPeriod: (period: string) => void;
	}) => (
		<div data-height={height} data-testid="chart">
			<button onClick={() => onOpenPeriod('2025-03')} type="button">
				Mar 2025 bar
			</button>
		</div>
	),
}));

const { OverviewChartZoom } = await import('../../../../components/overview/overview-chart-zoom');

afterEach(() => {
	cleanup();
});

function renderZoom(grain: 'day' | 'month' | 'year' = 'month') {
	const onOpenPeriod = vi.fn();
	render(
		<OverviewChartZoom
			grain={grain}
			onOpenPeriod={onOpenPeriod}
			period="2026-09"
			series={{ kind: 'count', points: [] }}
			title="Inspections"
		/>,
	);
	return { onOpenPeriod };
}

function zoomButton() {
	return screen.getByRole('button', { name: 'Zoom Inspections' });
}

function openZoom() {
	act(() => {
		zoomButton().focus();
	});
	fireEvent.click(zoomButton());
	return screen.getByRole('dialog', { name: 'Inspections' });
}

describe('OverviewChartZoom', () => {
	it('draws no overlay until the zoom button is pressed', () => {
		renderZoom();

		expect(zoomButton()).toBeTruthy();
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('opens the same chart filling the overlay, titled, with the legend on Monthly', () => {
		renderZoom('month');

		const dialog = openZoom();

		expect(within(dialog).getByRole('heading', { name: 'Inspections' })).toBeTruthy();
		expect(within(dialog).getByTestId('chart').dataset.height).toBe('fill');
		expect(
			within(within(dialog).getByRole('list'))
				.getAllByRole('listitem')
				.map((item) => item.textContent),
		).toEqual(['2026', '2025']);
	});

	it('draws no legend in the overlay on Today', () => {
		renderZoom('day');

		const dialog = openZoom();

		expect(within(dialog).queryByRole('list')).toBeNull();
	});

	it('closes on its exit button and gives focus back to the zoom button', async () => {
		renderZoom();
		const dialog = openZoom();

		fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(document.activeElement).toBe(zoomButton());
	});

	it('closes on Escape and gives focus back to the zoom button', async () => {
		renderZoom();
		const dialog = openZoom();

		fireEvent.keyDown(dialog, { key: 'Escape' });

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(document.activeElement).toBe(zoomButton());
	});

	it('closes on a click on the background and gives focus back to the zoom button', async () => {
		renderZoom();
		openZoom();
		const overlay = document.querySelector('[data-slot="dialog-overlay"]');
		if (overlay === null) {
			throw new Error('no overlay drawn');
		}

		// Radix listens for the outside press on the document a tick after opening.
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		fireEvent.pointerDown(overlay);
		fireEvent.click(overlay);

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(document.activeElement).toBe(zoomButton());
	});

	it('closes and opens the period under the pointer on a bar click inside it', async () => {
		const { onOpenPeriod } = renderZoom();
		const dialog = openZoom();

		fireEvent.click(within(dialog).getByRole('button', { name: 'Mar 2025 bar' }));

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(onOpenPeriod).toHaveBeenCalledExactlyOnceWith('2025-03');
	});
});
