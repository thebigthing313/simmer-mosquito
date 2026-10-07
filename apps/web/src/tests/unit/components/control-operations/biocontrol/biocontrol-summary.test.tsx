/** @vitest-environment jsdom */

/**
 * The Biocontrol Actions summary's groupings and its amount released, drawn
 * and clicked.
 *
 * A group is a button that writes the filter it names through the route's
 * `setFilters`, and a group already in the filter is drawn pressed and widens
 * back out when clicked (#1376). The summary holds no filter state of its own,
 * so the whole assertion is what `setFilters` was handed. The amount released
 * is text, one line per unit, because an amount is never added across units.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	type BiocontrolFilters,
	biocontrolFilterDefaults,
} from '../../../../../components/control-operations/biocontrol/biocontrol-actions-search';
import { biocontrolSummaryGroupings } from '../../../../../components/control-operations/biocontrol/biocontrol-summary';
import { ExplorerSummary } from '../../../../../components/explorer/explorer-summary';
import type { MapSummary } from '../../../../../hooks/explorer/use-explorer-summary';

afterEach(cleanup);

const GAMBUSIA = 'method-gambusia';
const COPEPODS = 'method-copepods';
const ANA = 'profile-ana';
const BEN = 'profile-ben';
const FISH = 'unit-fish';
const GALLON = 'unit-gallon';

const METHOD_NAMES = new Map([
	[GAMBUSIA, 'Gambusia stocking'],
	[COPEPODS, 'Copepod release'],
	['method-3', 'Bti briquet'],
	['method-4', 'Guppy stocking'],
	['method-5', 'Dragonfly nymphs'],
	['method-6', 'Toxorhynchites'],
]);
const PERSON_NAMES = new Map([
	[ANA, 'Ana Ortiz'],
	[BEN, 'Ben Hale'],
]);
const UNITS = new Map([
	[FISH, { unitName: 'Fish', abbreviation: 'fish' }],
	[GALLON, { unitName: 'Gallon', abbreviation: 'gal' }],
]);

const SUMMARY: MapSummary = {
	total: 412,
	groups: {
		biocontrolMethodId: [
			{ value: GAMBUSIA, count: 200 },
			{ value: COPEPODS, count: 120 },
			{ value: 'method-3', count: 50 },
			{ value: 'method-4', count: 25 },
			{ value: 'method-5', count: 12 },
			{ value: 'method-6', count: 5 },
		],
		technicianProfileId: [
			{ value: ANA, count: 250 },
			{ value: BEN, count: 150 },
			{ value: null, count: 12 },
		],
		habitat: [
			{ value: false, count: 300 },
			{ value: true, count: 112 },
		],
	},
	breakdowns: {
		amountReleased: [
			{ by: { unitId: FISH }, count: 300, sum: 18400 },
			{ by: { unitId: GALLON }, count: 112, sum: 32.5 },
		],
	},
};

const DEFAULTS = biocontrolFilterDefaults('2026-09-28');

function renderSummary(filters: Partial<BiocontrolFilters> = {}, summary = SUMMARY) {
	const setFilters = vi.fn<(patch: Partial<BiocontrolFilters>) => void>();
	const groupings = biocontrolSummaryGroupings({
		summary,
		filters: { ...DEFAULTS, ...filters },
		setFilters,
		methodNameById: METHOD_NAMES,
		personNameById: PERSON_NAMES,
		unitById: UNITS,
	});
	render(
		<ExplorerSummary
			groupings={groupings}
			recordType="biocontrolAction"
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

describe('the biocontrol action summary', () => {
	it('names each method from the catalog, top five and the rest counted', () => {
		renderSummary();

		const methods = section('Method');
		expect(buttonTexts(methods)).toEqual([
			'Gambusia stocking200',
			'Copepod release120',
			'Bti briquet50',
			'Guppy stocking25',
			'Dragonfly nymphs12',
		]);
		expect(within(methods).getByText('1 more')).toBeTruthy();
	});

	it('adds a method to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ methods: new Set([COPEPODS]) });

		fireEvent.click(group('Gambusia stocking, 200 biocontrol actions'));
		expect(setFilters).toHaveBeenLastCalledWith({ methods: new Set([COPEPODS, GAMBUSIA]) });

		expect(group('Copepod release, 120 biocontrol actions').getAttribute('aria-pressed')).toBe(
			'true',
		);
		fireEvent.click(group('Copepod release, 120 biocontrol actions'));
		expect(setFilters).toHaveBeenLastCalledWith({ methods: new Set() });
	});

	it('adds a technician to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ people: new Set([BEN]) });

		// A biocontrol action recorded with no technician has no filter to set, so it is not drawn.
		expect(buttonTexts(section('Technician'))).toEqual(['Ana Ortiz250', 'Ben Hale150']);
		fireEvent.click(group('Ana Ortiz, 250 biocontrol actions'));
		expect(setFilters).toHaveBeenLastCalledWith({ people: new Set([BEN, ANA]) });

		expect(group('Ben Hale, 150 biocontrol actions').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Ben Hale, 150 biocontrol actions'));
		expect(setFilters).toHaveBeenLastCalledWith({ people: new Set() });
	});

	it('sets the habitat flag, and clears it on a second click', () => {
		const setFilters = renderSummary();

		// Only the linked side is drawn, since no filter selects its opposite.
		expect(buttonTexts(section('Habitat'))).toEqual(['Linked to a Habitat112']);
		fireEvent.click(group('Linked to a Habitat, 112 biocontrol actions'));
		expect(setFilters).toHaveBeenLastCalledWith({ habitat: true });

		cleanup();
		const narrowed = renderSummary({ habitat: true });
		const linked = group('Linked to a Habitat, 112 biocontrol actions');
		expect(linked.getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(linked);
		expect(narrowed).toHaveBeenLastCalledWith({ habitat: false });
	});

	it('draws no habitat grouping when no biocontrol action in view is linked to one', () => {
		renderSummary(
			{},
			{ ...SUMMARY, groups: { ...SUMMARY.groups, habitat: [{ value: false, count: 412 }] } },
		);

		expect(screen.queryByRole('region', { name: 'Habitat' })).toBeNull();
	});

	it('draws the amount released as text, one line per unit', () => {
		renderSummary();

		const released = section('Amount Released');
		expect(within(released).queryAllByRole('button')).toEqual([]);
		expect(released.textContent).toBe('Amount ReleasedFish18400 fishGallon32.50 gal');
	});
});
