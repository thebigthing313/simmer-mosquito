/** @vitest-environment jsdom */

/**
 * The Samples summary's groupings and its figure, drawn and clicked.
 *
 * A group is a button that writes the filter it names through the route's
 * `setFilters`, and a group already in the filter is drawn pressed and widens
 * back out when clicked (#1370). The summary holds no filter state of its own,
 * so the whole assertion is what `setFilters` was handed.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExplorerSummary } from '../../../../../components/explorer/explorer-summary';
import { sampleSummaryGroupings } from '../../../../../components/larval-surveillance/samples/sample-summary';
import type { SampleFilters } from '../../../../../components/larval-surveillance/samples-search';
import type { MapSummary } from '../../../../../hooks/explorer/use-explorer-summary';

afterEach(cleanup);

const PIPIENS = 'species-pipiens';
const RESTUANS = 'species-restuans';

const SPECIES_NAMES = new Map([
	[PIPIENS, 'Culex pipiens'],
	[RESTUANS, 'Culex restuans'],
	['species-3', 'Aedes vexans'],
	['species-4', 'Aedes albopictus'],
	['species-5', 'Anopheles punctipennis'],
	['species-6', 'Culiseta melanura'],
]);

const SUMMARY: MapSummary = {
	total: 400,
	groups: {
		status: [
			{ value: 'identified', count: 220 },
			{ value: 'awaiting', count: 120 },
			{ value: 'unidentifiable', count: 40 },
			{ value: 'zero_larvae', count: 30 },
		],
		species: [
			{ value: PIPIENS, count: 180 },
			{ value: RESTUANS, count: 90 },
			{ value: 'species-3', count: 40 },
			{ value: 'species-4', count: 20 },
			{ value: 'species-5', count: 10 },
			{ value: 'species-6', count: 5 },
		],
		nonMosquito: [
			{ value: false, count: 370 },
			{ value: true, count: 30 },
		],
	},
	figures: { larvaeTotal: 12_480 },
};

const DEFAULTS: SampleFilters = {
	from: '2026-09-07',
	to: '2026-10-06',
	status: 'all',
	species: new Set(),
	nonMosquito: false,
	regions: new Set(),
};

function renderSummary(filters: Partial<SampleFilters> = {}, summary = SUMMARY) {
	const setFilters = vi.fn<(patch: Partial<SampleFilters>) => void>();
	const groupings = sampleSummaryGroupings({
		summary,
		filters: { ...DEFAULTS, ...filters },
		setFilters,
		speciesNameById: SPECIES_NAMES,
	});
	render(
		<ExplorerSummary
			groupings={groupings}
			recordType="sample"
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

describe('the sample summary', () => {
	it('draws the statuses in the filter order, and sets the status clicked', () => {
		const setFilters = renderSummary();

		expect(buttonTexts(section('Status'))).toEqual([
			'Awaiting ID120',
			'Identified220',
			'No larvae30',
			'Unidentifiable40',
		]);

		fireEvent.click(group('Awaiting ID, 120 samples'));
		expect(setFilters).toHaveBeenLastCalledWith({ status: 'awaiting' });
	});

	it('replaces the status there with the one clicked', () => {
		const setFilters = renderSummary({ status: 'identified' });

		fireEvent.click(group('No larvae, 30 samples'));

		expect(setFilters).toHaveBeenLastCalledWith({ status: 'zero_larvae' });
	});

	it('widens the status back to all from the selected one', () => {
		const setFilters = renderSummary({ status: 'identified' });

		expect(group('Identified, 220 samples').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Identified, 220 samples'));

		expect(setFilters).toHaveBeenLastCalledWith({ status: 'all' });
	});

	it('draws no status that no sample in view is in', () => {
		renderSummary({}, { total: 150, groups: { status: [{ value: 'awaiting', count: 150 }] } });

		expect(buttonTexts(section('Status'))).toEqual(['Awaiting ID150']);
	});

	it('names each species from the catalog, top five and the rest counted', () => {
		renderSummary();

		const species = section('Species');
		expect(buttonTexts(species)).toEqual([
			'Culex pipiens180',
			'Culex restuans90',
			'Aedes vexans40',
			'Aedes albopictus20',
			'Anopheles punctipennis10',
		]);
		expect(within(species).getByText('1 more')).toBeTruthy();
	});

	it('adds a species to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ species: new Set([RESTUANS]) });

		fireEvent.click(group('Culex pipiens, 180 samples'));
		expect(setFilters).toHaveBeenLastCalledWith({ species: new Set([RESTUANS, PIPIENS]) });

		expect(group('Culex restuans, 90 samples').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Culex restuans, 90 samples'));
		expect(setFilters).toHaveBeenLastCalledWith({ species: new Set() });
	});

	it('turns the non-mosquito filter on, and off again from the selected group', () => {
		const off = renderSummary();
		expect(buttonTexts(section('Material'))).toEqual(['Non-mosquito material30']);
		fireEvent.click(group('Non-mosquito material, 30 samples'));
		expect(off).toHaveBeenLastCalledWith({ nonMosquito: true });
		cleanup();

		const on = renderSummary({ nonMosquito: true });
		expect(group('Non-mosquito material, 30 samples').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Non-mosquito material, 30 samples'));
		expect(on).toHaveBeenLastCalledWith({ nonMosquito: false });
	});

	it('draws no material grouping when no sample in view carries non-mosquito material', () => {
		renderSummary({}, { total: 150, groups: { nonMosquito: [{ value: false, count: 150 }] } });

		expect(screen.queryByRole('region', { name: 'Material' })).toBeNull();
	});

	it('draws the larvae identified as text, with no filter behind it', () => {
		renderSummary();

		const larvae = section('Totals');
		expect(within(larvae).queryByRole('button')).toBeNull();
		expect(larvae.textContent).toContain('Larvae identified');
		expect(larvae.textContent).toContain('12,480');
	});

	it('draws no larvae figure when the summary carries none', () => {
		renderSummary({}, { total: 150, groups: {} });

		expect(screen.queryByRole('region', { name: 'Totals' })).toBeNull();
	});
});
