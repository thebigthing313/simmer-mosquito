/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollectionFilterFields } from '../../../../../components/adult-surveillance/collections/collection-filters';
import {
	type CollectionFilters,
	collectionFilterDefaults,
} from '../../../../../components/adult-surveillance/collections/collections-search';
import {
	countActiveFilters,
	DATE_RANGE_COUNTING,
	type FilterBinding,
} from '../../../../../lib/search-filters';

// The option lists are catalog reads; the chips only need a name for each id.
vi.mock('../../../../../hooks/explorer/use-catalog-options', () => ({
	useCatalogOptions: () => ({ options: [], nameById: new Map() }),
}));
vi.mock('../../../../../hooks/explorer/use-region-options', () => ({
	useRegionOptions: () => ({
		options: [{ value: 'region-1', label: 'North Marsh' }],
		nameById: new Map([['region-1', 'North Marsh']]),
	}),
}));

afterEach(cleanup);

const TODAY = '2026-10-09';
const DEFAULTS = collectionFilterDefaults(TODAY);

function renderFields(patch: Partial<CollectionFilters>) {
	const filters = { ...DEFAULTS, ...patch };
	const setFilters = vi.fn();
	const binding: FilterBinding<CollectionFilters> = {
		filters,
		setFilters,
		reset: vi.fn(),
		activeCount: countActiveFilters(filters, DEFAULTS, DATE_RANGE_COUNTING),
		defaults: DEFAULTS,
		today: TODAY,
	};
	render(<CollectionFilterFields binding={binding} />);
	return setFilters;
}

/** The chip bar is the row holding "Clear all"; its other buttons each remove one chip. */
function chipBar(): HTMLElement {
	const clearAll = screen.getByRole('button', { name: 'Clear all' });
	const bar = clearAll.parentElement;
	if (bar === null) {
		throw new Error('Clear all has no bar around it');
	}
	return bar;
}

describe('CollectionFilterFields chips', () => {
	it('draws no chip bar with every filter at its default', () => {
		renderFields({});
		expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
	});

	it('draws the date chip, not a lone Clear all, when only the window moved', () => {
		renderFields({ from: '2026-06-01' });
		const removes = within(chipBar()).getAllByRole('button', { name: /^Remove / });
		expect(removes.map((button) => button.getAttribute('aria-label'))).toEqual([
			'Remove Dates: Jun 1–Oct 9 filter',
		]);
	});

	it('restores the default window and leaves a region in place', () => {
		const setFilters = renderFields({ from: '2026-06-01', regions: new Set(['region-1']) });
		expect(within(chipBar()).getByText('North Marsh')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Remove Dates: Jun 1–Oct 9 filter' }));
		expect(setFilters).toHaveBeenCalledTimes(1);
		expect(setFilters).toHaveBeenCalledWith({ from: DEFAULTS.from, to: DEFAULTS.to });
	});
});
