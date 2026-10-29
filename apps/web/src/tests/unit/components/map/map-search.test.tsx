/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapboxSearchResult } from '../../../../components/map/mapbox-search-client';
import { scrollBodyCap } from '../../scroll-body-cap';
import { cleanupRenderedHooks, createFakeMap } from './fake-map';

/**
 * The place search's two resets, which used to be effects and are now read off
 * the state they key on: the arrow-key highlight is dropped when a new set of
 * suggestions lands, and the suggestions are dropped when the box goes idle.
 * Each is asserted on the DOM the reader meets, because the reset is what stops
 * Enter flying the map somewhere the reader never saw.
 */

/** What the next suggest call answers, so a case can hand the box its results. */
let suggestions: readonly MapboxSearchResult[] = [];
const suggestPlaces = vi.fn(() => Promise.resolve(suggestions));
const retrievePlace = vi.fn(() =>
	Promise.resolve({ center: [-74.25, 40.5] as [number, number], bbox: null }),
);

vi.mock('../../../../components/map/mapbox-search-client', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../components/map/mapbox-search-client')>()),
	suggestPlaces: (...args: unknown[]) => suggestPlaces(...(args as [])),
	retrievePlace: (...args: unknown[]) => retrievePlace(...(args as [])),
}));

vi.mock('../../../../components/map/map-styles', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../components/map/map-styles')>()),
	getMapboxToken: () => 'pk.test',
}));

const { MapSearch } = await import('../../../../components/map/map-search');

/** A pin for the cases that never choose a result. */
const idlePin = { drop: () => {}, clear: () => {} };

function place(id: string): MapboxSearchResult {
	return { id, label: `Place ${id}`, description: 'Somewhere' };
}

beforeEach(() => {
	suggestions = [];
	suggestPlaces.mockClear();
});

afterEach(() => {
	cleanup();
	cleanupRenderedHooks();
});

function isSelected(option: HTMLElement): boolean {
	return option.getAttribute('aria-selected') === 'true';
}

function selectedOption(): HTMLElement | undefined {
	return screen.getAllByRole('option').find(isSelected);
}

function input(): HTMLInputElement {
	return screen.getByRole('combobox', { name: 'Search for a location' });
}

async function typeAndSettle(query: string, answer: readonly MapboxSearchResult[]) {
	suggestions = answer;
	fireEvent.change(input(), { target: { value: query } });
	await waitFor(() => {
		expect(screen.getAllByRole('option')).toHaveLength(answer.length);
	});
}

describe('the highlighted suggestion', () => {
	it('is dropped when a new set of suggestions lands', async () => {
		render(<MapSearch map={null} pin={idlePin} />);
		await typeAndSettle('north', [place('a'), place('b')]);

		fireEvent.keyDown(input(), { key: 'ArrowDown' });
		expect(input().getAttribute('aria-activedescendant')).not.toBeNull();
		expect(selectedOption()?.textContent).toContain('Place a');

		await typeAndSettle('north end', [place('c'), place('d'), place('e')]);
		expect(input().getAttribute('aria-activedescendant')).toBeNull();
		expect(selectedOption()).toBeUndefined();
	});

	it('follows the arrow keys through the set it was chosen from', async () => {
		render(<MapSearch map={null} pin={idlePin} />);
		await typeAndSettle('north', [place('a'), place('b')]);

		fireEvent.keyDown(input(), { key: 'ArrowDown' });
		fireEvent.keyDown(input(), { key: 'ArrowDown' });
		expect(selectedOption()?.textContent).toContain('Place b');
		fireEvent.keyDown(input(), { key: 'ArrowDown' });
		expect(selectedOption()?.textContent).toContain('Place a');
	});
});

describe('the suggestions', () => {
	it('are dropped when the query falls under the minimum, with nothing drawn in between', async () => {
		render(<MapSearch map={null} pin={idlePin} />);
		await typeAndSettle('north', [place('a'), place('b')]);

		act(() => {
			fireEvent.change(input(), { target: { value: 'no' } });
		});
		expect(screen.queryAllByRole('option')).toHaveLength(0);
		expect(screen.getByText('Type at least 3 characters')).toBeDefined();

		// Typing back up to the minimum asks again rather than showing the old rows.
		suggestions = [place('z')];
		act(() => {
			fireEvent.change(input(), { target: { value: 'nor' } });
		});
		expect(screen.queryAllByRole('option')).toHaveLength(0);
		await waitFor(() => {
			expect(screen.getAllByRole('option')).toHaveLength(1);
		});
	});

	it('are dropped when Escape closes the panel', async () => {
		render(<MapSearch map={null} pin={idlePin} />);
		await typeAndSettle('north', [place('a'), place('b')]);

		act(() => {
			fireEvent.keyDown(input(), { key: 'Escape' });
		});
		expect(screen.queryAllByRole('option')).toHaveLength(0);
		expect(input().getAttribute('aria-expanded')).toBe('false');
	});
});

describe('the results list', () => {
	it('scrolls inside the styled viewport, capped there rather than on the root', async () => {
		render(<MapSearch map={null} pin={idlePin} />);
		await typeAndSettle('north', [place('a'), place('b')]);

		const listbox = screen.getByRole('listbox', { name: 'Search results' });
		const viewport = listbox.closest('[data-slot="scroll-area-viewport"]');
		expect(viewport).not.toBeNull();
		expect(scrollBodyCap(viewport)).toBe('18rem');
		expect(listbox.className).not.toContain('overflow-y-auto');
	});

	it('brings the highlighted option into view as the arrow keys move', async () => {
		const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
		try {
			render(<MapSearch map={null} pin={idlePin} />);
			await typeAndSettle('north', [place('a'), place('b')]);

			fireEvent.keyDown(input(), { key: 'ArrowDown' });
			fireEvent.keyDown(input(), { key: 'ArrowDown' });

			const option = selectedOption();
			expect(option?.textContent).toContain('Place b');
			expect(scrolled.mock.contexts.at(-1)).toBe(option);
			expect(scrolled).toHaveBeenLastCalledWith({ block: 'nearest' });
		} finally {
			scrolled.mockRestore();
		}
	});
});

describe('the landing pin', () => {
	it('drops on the chosen result once the map has moved there', async () => {
		const fake = createFakeMap();
		const pin = { drop: vi.fn(), clear: vi.fn() };
		render(<MapSearch map={fake.map} pin={pin} />);
		await typeAndSettle('newark', [place('a')]);

		fireEvent.click(screen.getByRole('option'));

		await waitFor(() => {
			expect(pin.drop).toHaveBeenCalledExactlyOnceWith(
				{ lng: -74.25, lat: 40.5 },
				'Search result Place a',
			);
		});
		expect(fake.cameraCalls.map((call) => call.center)).toEqual([[-74.25, 40.5]]);
	});

	it('is cleared with the search box', async () => {
		const pin = { drop: vi.fn(), clear: vi.fn() };
		render(<MapSearch map={null} pin={pin} />);
		fireEvent.change(input(), { target: { value: 'newark' } });

		fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

		expect(pin.clear).toHaveBeenCalledOnce();
	});
});
