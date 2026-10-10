/** @vitest-environment jsdom */

/**
 * The Inspections summary's five groupings, drawn and clicked.
 *
 * A group is a button that writes the filter it names through the route's
 * `setFilters`, and a group already in the filter is drawn pressed and widens
 * back out when clicked (#1369). The summary holds no filter state of its own,
 * so the whole assertion is what `setFilters` was handed.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeclaredSummary } from '../../../../../components/explorer/declared-summary';
import { inspectionFilterDeclarations } from '../../../../../components/larval-surveillance/inspection-filters';
import type { InspectionFilters } from '../../../../../components/larval-surveillance/inspections-search';
import type { MapSummary } from '../../../../../hooks/explorer/use-explorer-summary';

// Habitat type and Inspector each name a catalog, which the summary reads for
// names. The ids differ, so one lookup serves both.
vi.mock('../../../../../hooks/explorer/use-catalog-options', () => ({
	useCatalogOptions: () => ({
		options: [],
		nameById: new Map([...TYPE_NAMES, ...INSPECTOR_NAMES]),
	}),
}));

afterEach(cleanup);

const DITCH = 'type-ditch';
const TIRE = 'type-tire';
const ADA = 'profile-ada';
const BEN = 'profile-ben';

const TYPE_NAMES = new Map([
	[DITCH, 'Ditch'],
	[TIRE, 'Tire'],
	['type-3', 'Pond'],
	['type-4', 'Catch basin'],
	['type-5', 'Pool'],
	['type-6', 'Marsh'],
]);

const INSPECTOR_NAMES = new Map([
	[ADA, 'Ada Park'],
	[BEN, 'Ben Ortiz'],
]);

const SUMMARY: MapSummary = {
	total: 420,
	groups: {
		isWet: [
			{ value: true, count: 300 },
			{ value: false, count: 120 },
		],
		density: [
			{ value: null, count: 120 },
			{ value: 'light', count: 150 },
			{ value: 'heavy', count: 90 },
			{ value: 'none', count: 60 },
		],
		positive: [
			{ value: false, count: 180 },
			{ value: true, count: 240 },
		],
		habitatTypeId: [
			{ value: DITCH, count: 200 },
			{ value: TIRE, count: 100 },
			{ value: 'type-3', count: 50 },
			{ value: 'type-4', count: 30 },
			{ value: 'type-5', count: 20 },
			{ value: 'type-6', count: 15 },
			{ value: null, count: 5 },
		],
		inspectedBy: [
			{ value: ADA, count: 260 },
			{ value: BEN, count: 140 },
			{ value: null, count: 20 },
		],
	},
};

const EMPTY_FILTERS: InspectionFilters = {
	from: '2026-09-06',
	to: '2026-10-06',
	water: 'all',
	density: new Set(),
	positive: false,
	types: new Set(),
	inspectors: new Set(),
	regions: new Set(),
};

function renderSummary(filters: Partial<InspectionFilters> = {}, summary = SUMMARY) {
	const setFilters = vi.fn<(patch: Partial<InspectionFilters>) => void>();
	render(
		<DeclaredSummary
			binding={{ filters: { ...EMPTY_FILTERS, ...filters }, setFilters }}
			declarations={inspectionFilterDeclarations}
			order={['water', 'density', 'positive', 'types', 'inspectors']}
			recordType="inspection"
			state={{ data: summary, isError: false, retry: () => undefined }}
		/>,
	);
	return setFilters;
}

function group(name: string): HTMLElement {
	return screen.getByRole('button', { name });
}

function section(name: string): HTMLElement {
	return screen.getByRole('region', { name });
}

describe('the inspection summary', () => {
	it('draws Wet before Dry, and sets the water filter to the side clicked', () => {
		const setFilters = renderSummary();

		expect(
			within(section('Water'))
				.getAllByRole('button')
				.map((button) => button.textContent),
		).toEqual(['Wet300', 'Dry120']);

		fireEvent.click(group('Dry, 120 inspections'));
		expect(setFilters).toHaveBeenLastCalledWith({ water: 'dry' });
		fireEvent.click(group('Wet, 300 inspections'));
		expect(setFilters).toHaveBeenLastCalledWith({ water: 'wet' });
	});

	it('widens the water filter back to all from the selected side', () => {
		const setFilters = renderSummary({ water: 'wet' });

		expect(group('Wet, 300 inspections').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Wet, 300 inspections'));

		expect(setFilters).toHaveBeenLastCalledWith({ water: 'all' });
	});

	it('draws the density bands in the scale order, with no density as text', () => {
		renderSummary();

		const densities = section('Density');
		expect(
			within(densities)
				.getAllByRole('button')
				.map((button) => button.textContent),
		).toEqual(['None60', 'Light150', 'Heavy90']);
		expect(within(densities).getByText('Not recorded')).toBeTruthy();
	});

	it('adds a density band to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ density: new Set(['light'] as const) });

		fireEvent.click(group('Heavy, 90 inspections'));
		expect(setFilters).toHaveBeenLastCalledWith({ density: new Set(['light', 'heavy']) });

		expect(group('Light, 150 inspections').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Light, 150 inspections'));
		expect(setFilters).toHaveBeenLastCalledWith({ density: new Set() });
	});

	it('draws only the larvae found side, which turns the filter on and off', () => {
		const off = renderSummary();
		expect(within(section('Larvae')).getAllByRole('button')).toHaveLength(1);
		fireEvent.click(group('Larvae found, 240 inspections'));
		expect(off).toHaveBeenLastCalledWith({ positive: true });
		cleanup();

		const on = renderSummary({ positive: true });
		expect(group('Larvae found, 240 inspections').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Larvae found, 240 inspections'));
		expect(on).toHaveBeenLastCalledWith({ positive: false });
	});

	it('shows the top five habitat types and counts the rest', () => {
		renderSummary();

		const types = section('Habitat Type');
		expect(within(types).getAllByRole('button')).toHaveLength(5);
		expect(within(types).queryByRole('button', { name: /^Marsh/ })).toBeNull();
		expect(within(types).getByText('2 more')).toBeTruthy();
	});

	it('adds a habitat type to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ types: new Set([TIRE]) });

		fireEvent.click(group('Ditch, 200 inspections'));
		expect(setFilters).toHaveBeenLastCalledWith({ types: new Set([TIRE, DITCH]) });

		expect(group('Tire, 100 inspections').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Tire, 100 inspections'));
		expect(setFilters).toHaveBeenLastCalledWith({ types: new Set() });
	});

	it('names each inspector from the personnel catalog, with no inspector as text', () => {
		renderSummary();

		const inspectors = section('Inspector');
		expect(within(inspectors).getAllByRole('button')).toHaveLength(2);
		expect(within(inspectors).getByText('No inspector')).toBeTruthy();
	});

	it('adds an inspector to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ inspectors: new Set([BEN]) });

		fireEvent.click(group('Ada Park, 260 inspections'));
		expect(setFilters).toHaveBeenLastCalledWith({ inspectors: new Set([BEN, ADA]) });

		expect(group('Ben Ortiz, 140 inspections').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Ben Ortiz, 140 inspections'));
		expect(setFilters).toHaveBeenLastCalledWith({ inspectors: new Set() });
	});

	it('shows the top five inspectors and counts the rest', () => {
		const many: MapSummary = {
			total: 700,
			groups: {
				inspectedBy: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, index) => ({
					value: `profile-${id}`,
					count: 100 - index,
				})),
			},
		};
		renderSummary({}, many);

		const inspectors = section('Inspector');
		expect(within(inspectors).getAllByRole('button')).toHaveLength(5);
		expect(within(inspectors).getByText('2 more')).toBeTruthy();
	});

	it('draws no side of a grouping that no inspection in view is on', () => {
		const allWet: MapSummary = {
			total: 150,
			groups: {
				isWet: [{ value: true, count: 150 }],
				positive: [{ value: false, count: 150 }],
			},
		};
		renderSummary({}, allWet);

		expect(within(section('Water')).getAllByRole('button')).toHaveLength(1);
		expect(screen.queryByRole('region', { name: 'Larvae' })).toBeNull();
	});
});
