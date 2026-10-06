/** @vitest-environment jsdom */

/**
 * The Habitats summary's four groupings, drawn and clicked.
 *
 * A group is a button that writes the filter it names through the route's
 * `setFilters`, and a group already in the filter is drawn pressed and widens
 * back out when clicked (#1244). The summary holds no filter state of its own,
 * so the whole assertion is the patch handed to `setFilters`.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExplorerSummary } from '../../../../../components/explorer/explorer-summary';
import { habitatSummaryGroupings } from '../../../../../components/larval-surveillance/habitats/habitat-summary';
import {
	HABITAT_FILTER_DEFAULTS,
	type HabitatFilters,
} from '../../../../../components/larval-surveillance/habitats/habitats-search';
import type { MapSummary } from '../../../../../hooks/explorer/use-explorer-summary';

afterEach(cleanup);

const TIRE = 'type-tire';
const DITCH = 'type-ditch';

const TYPE_NAMES = new Map([
	[TIRE, 'Tire'],
	[DITCH, 'Ditch'],
	['type-3', 'Pond'],
	['type-4', 'Catch basin'],
	['type-5', 'Pool'],
	['type-6', 'Marsh'],
	['type-7', 'Container'],
]);

const SUMMARY: MapSummary = {
	total: 3110,
	groups: {
		habitatTypeId: [
			{ value: TIRE, count: 2104 },
			{ value: DITCH, count: 500 },
			{ value: 'type-3', count: 200 },
			{ value: 'type-4', count: 150 },
			{ value: 'type-5', count: 100 },
			{ value: 'type-6', count: 40 },
			{ value: 'type-7', count: 16 },
		],
		isActive: [
			{ value: false, count: 312 },
			{ value: true, count: 2798 },
		],
		isInaccessible: [
			{ value: false, count: 3000 },
			{ value: true, count: 110 },
		],
		untreated: [
			{ value: false, count: 3080 },
			{ value: true, count: 30 },
		],
	},
};

function renderSummary(filters: Partial<HabitatFilters> = {}) {
	const setFilters = vi.fn();
	const groupings = habitatSummaryGroupings({
		summary: SUMMARY,
		filters: { ...HABITAT_FILTER_DEFAULTS, status: 'all', ...filters },
		setFilters,
		typeNameById: TYPE_NAMES,
	});
	render(
		<ExplorerSummary
			groupings={groupings}
			recordType="habitat"
			state={{ data: SUMMARY, isError: false, retry: () => undefined }}
		/>,
	);
	return setFilters;
}

function group(name: string): HTMLElement {
	return screen.getByRole('button', { name });
}

describe('the habitat summary', () => {
	it('names each group with its count', () => {
		renderSummary();

		expect(group('Tire, 2,104 habitats')).toBeTruthy();
		expect(group('Inactive, 312 habitats')).toBeTruthy();
		expect(group('Inaccessible, 110 habitats')).toBeTruthy();
		expect(group('Untreated, 30 habitats')).toBeTruthy();
	});

	it('shows the top five habitat types and counts the rest', () => {
		renderSummary();

		const types = screen.getByRole('region', { name: 'Habitat Type' });
		expect(within(types).getAllByRole('button')).toHaveLength(5);
		expect(within(types).queryByRole('button', { name: /^Marsh/ })).toBeNull();
		expect(within(types).getByText('2 more')).toBeTruthy();
	});

	it('draws Active before Inactive, and only the untreated side of untreated', () => {
		renderSummary();

		const status = screen.getByRole('region', { name: 'Status' });
		expect(
			within(status)
				.getAllByRole('button')
				.map((button) => button.textContent),
		).toEqual(['Active2,798', 'Inactive312']);
		const treatment = screen.getByRole('region', { name: 'Treatment' });
		expect(within(treatment).getAllByRole('button')).toHaveLength(1);
	});

	it('adds a habitat type to the filter', () => {
		const setFilters = renderSummary({ typeIds: new Set([DITCH]) });

		fireEvent.click(group('Tire, 2,104 habitats'));

		expect(setFilters).toHaveBeenCalledWith({ typeIds: new Set([DITCH, TIRE]) });
	});

	it('takes a selected habitat type back out of the filter', () => {
		const setFilters = renderSummary({ typeIds: new Set([DITCH, TIRE]) });

		expect(group('Tire, 2,104 habitats').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Tire, 2,104 habitats'));

		expect(setFilters).toHaveBeenCalledWith({ typeIds: new Set([DITCH]) });
	});

	it('sets status to the side clicked, and back to all from the selected side', () => {
		const setFilters = renderSummary({ status: 'active' });

		expect(group('Active, 2,798 habitats').getAttribute('aria-pressed')).toBe('true');
		expect(group('Inactive, 312 habitats').getAttribute('aria-pressed')).toBe('false');

		fireEvent.click(group('Inactive, 312 habitats'));
		expect(setFilters).toHaveBeenLastCalledWith({ status: 'inactive' });

		fireEvent.click(group('Active, 2,798 habitats'));
		expect(setFilters).toHaveBeenLastCalledWith({ status: 'all' });
	});

	it('sets access to the side clicked, and back to all from the selected side', () => {
		const setFilters = renderSummary({ access: 'inaccessible' });

		fireEvent.click(group('Accessible, 3,000 habitats'));
		expect(setFilters).toHaveBeenLastCalledWith({ access: 'accessible' });

		fireEvent.click(group('Inaccessible, 110 habitats'));
		expect(setFilters).toHaveBeenLastCalledWith({ access: 'all' });
	});

	it('turns untreated on, and off again once it is the filter', () => {
		const off = renderSummary();
		fireEvent.click(group('Untreated, 30 habitats'));
		expect(off).toHaveBeenLastCalledWith({ untreated: true });
		cleanup();

		const on = renderSummary({ untreated: true });
		expect(group('Untreated, 30 habitats').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Untreated, 30 habitats'));
		expect(on).toHaveBeenLastCalledWith({ untreated: false });
	});

	it('draws a habitat with no type as text, since no filter selects it', () => {
		const untyped: MapSummary = {
			total: 120,
			groups: { habitatTypeId: [{ value: null, count: 120 }] },
		};
		const groupings = habitatSummaryGroupings({
			summary: untyped,
			filters: HABITAT_FILTER_DEFAULTS,
			setFilters: vi.fn(),
			typeNameById: TYPE_NAMES,
		});
		render(
			<ExplorerSummary
				groupings={groupings}
				recordType="habitat"
				state={{ data: untyped, isError: false, retry: () => undefined }}
			/>,
		);

		const types = screen.getByRole('region', { name: 'Habitat Type' });
		expect(within(types).queryAllByRole('button')).toHaveLength(0);
		expect(within(types).getByText('No type')).toBeTruthy();
	});

	it('offers a retry when the summary request failed', () => {
		const retry = vi.fn();
		render(
			<ExplorerSummary
				groupings={[]}
				recordType="habitat"
				state={{ data: null, isError: true, retry }}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
		expect(retry).toHaveBeenCalledOnce();
	});
});
