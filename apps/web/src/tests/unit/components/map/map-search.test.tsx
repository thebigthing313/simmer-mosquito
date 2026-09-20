/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapboxSearchResult } from '../../../../components/map/mapbox-search-client';

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

vi.mock('../../../../components/map/mapbox-search-client', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../components/map/mapbox-search-client')>()),
	suggestPlaces: (...args: unknown[]) => suggestPlaces(...(args as [])),
}));

vi.mock('../../../../components/map/map-styles', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../components/map/map-styles')>()),
	getMapboxToken: () => 'pk.test',
}));

const { MapSearch } = await import('../../../../components/map/map-search');

function place(id: string): MapboxSearchResult {
	return { id, label: `Place ${id}`, description: 'Somewhere' };
}

// jsdom draws nothing, so the scroll that keeps the highlight on screen has
// nothing to do here.
Element.prototype.scrollIntoView ??= () => {};

beforeEach(() => {
	suggestions = [];
	suggestPlaces.mockClear();
});

afterEach(cleanup);

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
		render(<MapSearch map={null} />);
		await typeAndSettle('north', [place('a'), place('b')]);

		fireEvent.keyDown(input(), { key: 'ArrowDown' });
		expect(input().getAttribute('aria-activedescendant')).not.toBeNull();
		expect(selectedOption()?.textContent).toContain('Place a');

		await typeAndSettle('north end', [place('c'), place('d'), place('e')]);
		expect(input().getAttribute('aria-activedescendant')).toBeNull();
		expect(selectedOption()).toBeUndefined();
	});

	it('follows the arrow keys through the set it was chosen from', async () => {
		render(<MapSearch map={null} />);
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
		render(<MapSearch map={null} />);
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
		render(<MapSearch map={null} />);
		await typeAndSettle('north', [place('a'), place('b')]);

		act(() => {
			fireEvent.keyDown(input(), { key: 'Escape' });
		});
		expect(screen.queryAllByRole('option')).toHaveLength(0);
		expect(input().getAttribute('aria-expanded')).toBe('false');
	});
});
