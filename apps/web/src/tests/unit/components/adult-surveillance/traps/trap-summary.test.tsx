/** @vitest-environment jsdom */

/**
 * The Traps summary's two groupings, drawn and clicked.
 *
 * A group is a button that writes the filter it names through the route's
 * `setFilters`, and a group already in the filter is drawn pressed and widens
 * back out when clicked (#1372). The summary holds no filter state of its own,
 * so the whole assertion is what `setFilters` was handed.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trapSummaryGroupings } from '../../../../../components/adult-surveillance/traps/trap-summary';
import {
	TRAP_FILTER_DEFAULTS,
	type TrapFilters,
} from '../../../../../components/adult-surveillance/traps/traps-search';
import { ExplorerSummary } from '../../../../../components/explorer/explorer-summary';
import type { MapSummary } from '../../../../../hooks/explorer/use-explorer-summary';

afterEach(cleanup);

const GRAVID = 'method-gravid';
const LIGHT = 'method-light';

const METHOD_NAMES = new Map([
	[GRAVID, 'Gravid'],
	[LIGHT, 'CDC light'],
	['method-3', 'BG-Sentinel'],
	['method-4', 'Resting box'],
	['method-5', 'Landing count'],
	['method-6', 'Aspirator'],
]);

const SUMMARY: MapSummary = {
	total: 412,
	groups: {
		collectionMethodId: [
			{ value: GRAVID, count: 200 },
			{ value: LIGHT, count: 120 },
			{ value: 'method-3', count: 50 },
			{ value: 'method-4', count: 25 },
			{ value: 'method-5', count: 12 },
			{ value: 'method-6', count: 5 },
		],
		isActive: [
			{ value: false, count: 300 },
			{ value: true, count: 112 },
		],
	},
};

function renderSummary(filters: Partial<TrapFilters> = {}, summary = SUMMARY) {
	const setFilters = vi.fn<(patch: Partial<TrapFilters>) => void>();
	const groupings = trapSummaryGroupings({
		summary,
		filters: { ...TRAP_FILTER_DEFAULTS, status: 'all', ...filters },
		setFilters,
		methodNameById: METHOD_NAMES,
	});
	render(
		<ExplorerSummary
			groupings={groupings}
			recordType="trap"
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

function buttonTexts(region: HTMLElement): readonly (string | null)[] {
	return within(region)
		.getAllByRole('button')
		.map((button) => button.textContent);
}

describe('the trap summary', () => {
	it('names each collection method from the catalog, top five and the rest counted', () => {
		renderSummary();

		const methods = section('Collection Method');
		expect(buttonTexts(methods)).toEqual([
			'Gravid200',
			'CDC light120',
			'BG-Sentinel50',
			'Resting box25',
			'Landing count12',
		]);
		expect(within(methods).getByText('1 more')).toBeTruthy();
	});

	it('adds a collection method to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ methods: new Set([LIGHT]) });

		fireEvent.click(group('Gravid, 200 traps'));
		expect(setFilters).toHaveBeenLastCalledWith({ methods: new Set([LIGHT, GRAVID]) });

		expect(group('CDC light, 120 traps').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('CDC light, 120 traps'));
		expect(setFilters).toHaveBeenLastCalledWith({ methods: new Set() });
	});

	it('draws Active before Inactive whichever holds more, and sets the status clicked', () => {
		const setFilters = renderSummary();

		expect(buttonTexts(section('Status'))).toEqual(['Active112', 'Inactive300']);

		fireEvent.click(group('Active, 112 traps'));
		expect(setFilters).toHaveBeenLastCalledWith({ status: 'active' });
		fireEvent.click(group('Inactive, 300 traps'));
		expect(setFilters).toHaveBeenLastCalledWith({ status: 'inactive' });
	});

	it('widens the status back to all from the selected one', () => {
		const setFilters = renderSummary({ status: 'inactive' });

		expect(group('Inactive, 300 traps').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Inactive, 300 traps'));

		expect(setFilters).toHaveBeenLastCalledWith({ status: 'all' });
	});

	// The map opens on `status=active`, so the server answers active traps
	// alone and the grouping draws Active by itself, already selected.
	it('opens on Active alone and selected, as the default status reads', () => {
		const setFilters = renderSummary(
			{ status: TRAP_FILTER_DEFAULTS.status },
			{
				total: 150,
				groups: {
					collectionMethodId: [{ value: GRAVID, count: 150 }],
					isActive: [{ value: true, count: 150 }],
				},
			},
		);

		expect(buttonTexts(section('Status'))).toEqual(['Active150']);
		expect(group('Active, 150 traps').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Active, 150 traps'));
		expect(setFilters).toHaveBeenLastCalledWith({ status: 'all' });
	});
});
