/** @vitest-environment jsdom */

/**
 * The Collections summary's groupings and figures, drawn and clicked.
 *
 * A group is a button that writes the filter it names through the route's
 * `setFilters`, and a group already in the filter is drawn pressed and widens
 * back out when clicked (#1373). The summary holds no filter state of its own,
 * so the whole assertion is what `setFilters` was handed. The two figures are
 * text, because no filter selects them.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectionFilterDeclarations } from '../../../../../components/adult-surveillance/collections/collection-filters';
import { collectionSummaryFigures } from '../../../../../components/adult-surveillance/collections/collection-summary';
import {
	type CollectionFilters,
	collectionFilterDefaults,
} from '../../../../../components/adult-surveillance/collections/collections-search';
import { DeclaredSummary } from '../../../../../components/explorer/declared-summary';
import type { MapSummary } from '../../../../../hooks/explorer/use-explorer-summary';

// The Method declaration names its catalog, which the summary reads for names.
vi.mock('../../../../../hooks/explorer/use-catalog-options', () => ({
	useCatalogOptions: () => ({ options: [], nameById: METHOD_NAMES }),
}));

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
		problem: [
			{ value: false, count: 380 },
			{ value: true, count: 32 },
		],
		awaiting: [
			{ value: false, count: 290 },
			{ value: true, count: 122 },
		],
		collectionMethodId: [
			{ value: GRAVID, count: 200 },
			{ value: LIGHT, count: 120 },
			{ value: 'method-3', count: 50 },
			{ value: 'method-4', count: 25 },
			{ value: 'method-5', count: 12 },
			{ value: 'method-6', count: 5 },
		],
	},
	figures: { zeroResult: 41, collected: 309 },
};

const DEFAULTS = collectionFilterDefaults('2026-09-28');

function renderSummary(filters: Partial<CollectionFilters> = {}, summary = SUMMARY) {
	const setFilters = vi.fn<(patch: Partial<CollectionFilters>) => void>();
	render(
		<DeclaredSummary
			binding={{ filters: { ...DEFAULTS, ...filters }, setFilters }}
			declarations={collectionFilterDeclarations}
			figures={collectionSummaryFigures}
			order={['problems', 'awaiting', 'methods']}
			recordType="collection"
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

describe('the collection summary', () => {
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

		fireEvent.click(group('Gravid, 200 collections'));
		expect(setFilters).toHaveBeenLastCalledWith({ methods: new Set([LIGHT, GRAVID]) });

		expect(group('CDC light, 120 collections').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('CDC light, 120 collections'));
		expect(setFilters).toHaveBeenLastCalledWith({ methods: new Set() });
	});

	it('sets Problems only from the problem group, and turns it off from the selected one', () => {
		const setFilters = renderSummary();

		expect(buttonTexts(section('Problems'))).toEqual(['Problem reported32']);
		fireEvent.click(group('Problem reported, 32 collections'));
		expect(setFilters).toHaveBeenLastCalledWith({ problems: true });

		cleanup();
		const selected = renderSummary({ problems: true });
		expect(group('Problem reported, 32 collections').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Problem reported, 32 collections'));
		expect(selected).toHaveBeenLastCalledWith({ problems: false });
	});

	it('sets Awaiting identification from its group, and turns it off from the selected one', () => {
		const setFilters = renderSummary();

		expect(buttonTexts(section('Identification'))).toEqual(['Awaiting identification122']);
		fireEvent.click(group('Awaiting identification, 122 collections'));
		expect(setFilters).toHaveBeenLastCalledWith({ awaiting: true });

		cleanup();
		const selected = renderSummary({ awaiting: true });
		expect(group('Awaiting identification, 122 collections').getAttribute('aria-pressed')).toBe(
			'true',
		);
		fireEvent.click(group('Awaiting identification, 122 collections'));
		expect(selected).toHaveBeenLastCalledWith({ awaiting: false });
	});

	it('draws the zero results and the collected as text, with nothing to click', () => {
		renderSummary();

		const status = section('Status');
		expect(within(status).queryAllByRole('button')).toEqual([]);
		expect(status.textContent).toBe('StatusZero result41Collected309');
	});

	it('draws no flag no collection in view carries', () => {
		renderSummary(
			{},
			{
				total: 150,
				groups: {
					problem: [{ value: false, count: 150 }],
					awaiting: [{ value: false, count: 150 }],
					collectionMethodId: [{ value: GRAVID, count: 150 }],
				},
				figures: { zeroResult: 0, collected: 150 },
			},
		);

		expect(screen.queryByRole('region', { name: 'Problems' })).toBeNull();
		expect(screen.queryByRole('region', { name: 'Identification' })).toBeNull();
		expect(section('Status').textContent).toBe('StatusZero result0Collected150');
	});
});
