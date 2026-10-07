/** @vitest-environment jsdom */

/**
 * The Source Reductions summary's groupings and its sources eliminated, drawn
 * and clicked.
 *
 * A group is a button that writes the filter it names through the route's
 * `setFilters`, and a group already in the filter is drawn pressed and widens
 * back out when clicked (#1375). The summary holds no filter state of its own,
 * so the whole assertion is what `setFilters` was handed. Sources eliminated are
 * text, one line per unit, because an amount is never added across units.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sourceReductionSummaryGroupings } from '../../../../../components/control-operations/source-reduction/source-reduction-summary';
import {
	type SourceReductionFilters,
	sourceReductionFilterDefaults,
} from '../../../../../components/control-operations/source-reduction/source-reductions-search';
import { ExplorerSummary } from '../../../../../components/explorer/explorer-summary';
import type { MapSummary } from '../../../../../hooks/explorer/use-explorer-summary';

afterEach(cleanup);

const CONTAINERS = 'method-containers';
const DRAINAGE = 'method-drainage';
const ANA = 'profile-ana';
const BEN = 'profile-ben';
const CONTAINER_UNIT = 'unit-container';
const ACRE = 'unit-acre';

const METHOD_NAMES = new Map([
	[CONTAINERS, 'Container removal'],
	[DRAINAGE, 'Drainage'],
	['method-3', 'Tire removal'],
	['method-4', 'Ditch cleaning'],
	['method-5', 'Filling'],
	['method-6', 'Grading'],
]);
const PERSON_NAMES = new Map([
	[ANA, 'Ana Ortiz'],
	[BEN, 'Ben Hale'],
]);
const UNITS = new Map([
	[CONTAINER_UNIT, { unitName: 'Container', abbreviation: 'ctr' }],
	[ACRE, { unitName: 'Acre', abbreviation: 'ac' }],
]);

const SUMMARY: MapSummary = {
	total: 412,
	groups: {
		sourceReductionMethodId: [
			{ value: CONTAINERS, count: 200 },
			{ value: DRAINAGE, count: 120 },
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
	},
	breakdowns: {
		sourcesEliminated: [
			{ by: { unitId: CONTAINER_UNIT }, count: 300, sum: 1840 },
			{ by: { unitId: ACRE }, count: 112, sum: 32.25 },
		],
	},
};

const DEFAULTS = sourceReductionFilterDefaults('2026-09-28');

function renderSummary(filters: Partial<SourceReductionFilters> = {}, summary = SUMMARY) {
	const setFilters = vi.fn<(patch: Partial<SourceReductionFilters>) => void>();
	const groupings = sourceReductionSummaryGroupings({
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
			recordType="sourceReduction"
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

describe('the source reduction summary', () => {
	it('names each method from the catalog, top five and the rest counted', () => {
		renderSummary();

		const methods = section('Method');
		expect(buttonTexts(methods)).toEqual([
			'Container removal200',
			'Drainage120',
			'Tire removal50',
			'Ditch cleaning25',
			'Filling12',
		]);
		expect(within(methods).getByText('1 more')).toBeTruthy();
	});

	it('adds a method to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ methods: new Set([DRAINAGE]) });

		fireEvent.click(group('Container removal, 200 source reductions'));
		expect(setFilters).toHaveBeenLastCalledWith({ methods: new Set([DRAINAGE, CONTAINERS]) });

		expect(group('Drainage, 120 source reductions').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Drainage, 120 source reductions'));
		expect(setFilters).toHaveBeenLastCalledWith({ methods: new Set() });
	});

	it('adds a technician to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ people: new Set([BEN]) });

		// A source reduction recorded with no technician has no filter to set, so it is not drawn.
		expect(buttonTexts(section('Technician'))).toEqual(['Ana Ortiz250', 'Ben Hale150']);
		fireEvent.click(group('Ana Ortiz, 250 source reductions'));
		expect(setFilters).toHaveBeenLastCalledWith({ people: new Set([BEN, ANA]) });

		expect(group('Ben Hale, 150 source reductions').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Ben Hale, 150 source reductions'));
		expect(setFilters).toHaveBeenLastCalledWith({ people: new Set() });
	});

	it('draws sources eliminated as text, one line per unit', () => {
		renderSummary();

		const eliminated = section('Sources Eliminated');
		expect(within(eliminated).queryAllByRole('button')).toEqual([]);
		expect(eliminated.textContent).toBe('Sources EliminatedContainer1840 ctrAcre32.25 ac');
	});
});
