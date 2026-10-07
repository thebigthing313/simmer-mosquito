/** @vitest-environment jsdom */

/**
 * The Outreach Actions summary's groupings and its total reach, drawn and
 * clicked.
 *
 * A group is a button that writes the filter it names through the route's
 * `setFilters`, and a group already in the filter is drawn pressed and widens
 * back out when clicked (#1377). The summary holds no filter state of its own,
 * so the whole assertion is what `setFilters` was handed. The total reach is
 * text, because no filter selects a figure.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExplorerSummary } from '../../../../../components/explorer/explorer-summary';
import {
	type OutreachFilters,
	outreachFilterDefaults,
} from '../../../../../components/public-engagement/outreach/outreach-actions-search';
import { outreachSummaryGroupings } from '../../../../../components/public-engagement/outreach/outreach-summary';
import type { MapSummary } from '../../../../../hooks/explorer/use-explorer-summary';

afterEach(cleanup);

const DOOR_HANGER = 'method-door-hanger';
const SCHOOL_TALK = 'method-school-talk';
const ANA = 'profile-ana';
const BEN = 'profile-ben';

const METHOD_NAMES = new Map([
	[DOOR_HANGER, 'Door hanger'],
	[SCHOOL_TALK, 'School talk'],
	['method-3', 'Health fair'],
	['method-4', 'Mailer'],
	['method-5', 'Radio spot'],
	['method-6', 'Social post'],
]);
const PERSON_NAMES = new Map([
	[ANA, 'Ana Ortiz'],
	[BEN, 'Ben Hale'],
	['profile-3', 'Cy Park'],
	['profile-4', 'Dee Lund'],
	['profile-5', 'Eli Moss'],
	['profile-6', 'Fay Reed'],
]);

const SUMMARY: MapSummary = {
	total: 412,
	groups: {
		outreachMethodId: [
			{ value: DOOR_HANGER, count: 200 },
			{ value: SCHOOL_TALK, count: 120 },
			{ value: 'method-3', count: 50 },
			{ value: 'method-4', count: 25 },
			{ value: 'method-5', count: 12 },
			{ value: 'method-6', count: 5 },
		],
		technicianProfileId: [
			{ value: ANA, count: 250 },
			{ value: BEN, count: 100 },
			{ value: 'profile-3', count: 30 },
			{ value: 'profile-4', count: 10 },
			{ value: 'profile-5', count: 6 },
			{ value: null, count: 12 },
			{ value: 'profile-6', count: 4 },
		],
	},
	figures: { reachTotal: 18_400 },
};

const DEFAULTS = outreachFilterDefaults('2026-09-28');

function renderSummary(filters: Partial<OutreachFilters> = {}, summary = SUMMARY) {
	const setFilters = vi.fn<(patch: Partial<OutreachFilters>) => void>();
	const groupings = outreachSummaryGroupings({
		summary,
		filters: { ...DEFAULTS, ...filters },
		setFilters,
		methodNameById: METHOD_NAMES,
		personNameById: PERSON_NAMES,
	});
	render(
		<ExplorerSummary
			groupings={groupings}
			recordType="outreachAction"
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

describe('the outreach action summary', () => {
	it('names each method from the catalog, top five and the rest counted', () => {
		renderSummary();

		const methods = section('Method');
		expect(buttonTexts(methods)).toEqual([
			'Door hanger200',
			'School talk120',
			'Health fair50',
			'Mailer25',
			'Radio spot12',
		]);
		expect(within(methods).getByText('1 more')).toBeTruthy();
	});

	it('adds a method to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ methods: new Set([SCHOOL_TALK]) });

		fireEvent.click(group('Door hanger, 200 outreach actions'));
		expect(setFilters).toHaveBeenLastCalledWith({ methods: new Set([SCHOOL_TALK, DOOR_HANGER]) });

		expect(group('School talk, 120 outreach actions').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('School talk, 120 outreach actions'));
		expect(setFilters).toHaveBeenLastCalledWith({ methods: new Set() });
	});

	it('adds a technician to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ people: new Set([BEN]) });

		// An outreach action recorded with no technician has no filter to set, so it is not drawn.
		const technicians = section('Technician');
		expect(buttonTexts(technicians)).toEqual([
			'Ana Ortiz250',
			'Ben Hale100',
			'Cy Park30',
			'Dee Lund10',
			'Eli Moss6',
		]);
		expect(within(technicians).getByText('1 more')).toBeTruthy();
		fireEvent.click(group('Ana Ortiz, 250 outreach actions'));
		expect(setFilters).toHaveBeenLastCalledWith({ people: new Set([BEN, ANA]) });

		expect(group('Ben Hale, 100 outreach actions').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Ben Hale, 100 outreach actions'));
		expect(setFilters).toHaveBeenLastCalledWith({ people: new Set() });
	});

	it('draws the total reach as text, with no filter behind it', () => {
		renderSummary();

		const totals = section('Totals');
		expect(within(totals).queryAllByRole('button')).toEqual([]);
		expect(totals.textContent).toBe('TotalsTotal reach18,400 people');
	});

	it('draws no total reach when the summary carries none', () => {
		const { figures: _figures, ...withoutFigures } = SUMMARY;
		renderSummary({}, withoutFigures);

		expect(screen.queryByRole('region', { name: 'Totals' })).toBeNull();
	});
});
