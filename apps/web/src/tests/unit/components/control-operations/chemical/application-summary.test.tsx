/** @vitest-environment jsdom */

/**
 * The Chemical Applications summary's groupings and its amounts, drawn and
 * clicked.
 *
 * A group is a button that writes the filter it names through the route's
 * `setFilters`, and a group already in the filter is drawn pressed and widens
 * back out when clicked (#1374). The summary holds no filter state of its own,
 * so the whole assertion is what `setFilters` was handed. The amounts are text,
 * one per insecticide and unit, because an amount is never added across units.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applicationFilterDeclarations } from '../../../../../components/control-operations/chemical/application-filters';
import { applicationSummaryFigures } from '../../../../../components/control-operations/chemical/application-summary';
import {
	type ApplicationFilters,
	applicationFilterDefaults,
} from '../../../../../components/control-operations/chemical/applications-search';
import { DeclaredSummary } from '../../../../../components/explorer/declared-summary';
import type { MapSummary } from '../../../../../hooks/explorer/use-explorer-summary';

// Each id set's declaration names its source, which the summary reads for
// names. Method and Applicator are both catalogs, and the ids differ, so one
// lookup serves both.
vi.mock('../../../../../hooks/explorer/use-catalog-options', () => ({
	useCatalogOptions: () => ({
		options: [],
		nameById: new Map([...METHOD_NAMES, ...PERSON_NAMES]),
	}),
}));
vi.mock('../../../../../hooks/explorer/use-insecticide-options', () => ({
	useInsecticideOptions: () => ({ options: [], nameById: INSECTICIDE_NAMES }),
}));

afterEach(cleanup);

const BTI = 'insecticide-bti';
const PERMETHRIN = 'insecticide-permethrin';
const BACKPACK = 'method-backpack';
const TRUCK = 'method-truck';
const ANA = 'profile-ana';
const BEN = 'profile-ben';
const GALLON = 'unit-gallon';
const OUNCE = 'unit-ounce';

const INSECTICIDE_NAMES = new Map([
	[BTI, 'VectoBac 12AS'],
	[PERMETHRIN, 'Permanone'],
	['insecticide-3', 'Altosid'],
	['insecticide-4', 'Natular'],
	['insecticide-5', 'Duet'],
	['insecticide-6', 'Zenivex'],
]);
const METHOD_NAMES = new Map([
	[BACKPACK, 'Backpack'],
	[TRUCK, 'Truck ULV'],
]);
const PERSON_NAMES = new Map([
	[ANA, 'Ana Ortiz'],
	[BEN, 'Ben Hale'],
]);
const UNITS = new Map([
	[GALLON, { abbreviation: 'gal' }],
	[OUNCE, { abbreviation: 'fl oz' }],
]);

const SUMMARY: MapSummary = {
	total: 412,
	groups: {
		insecticideId: [
			{ value: BTI, count: 200 },
			{ value: PERMETHRIN, count: 120 },
			{ value: 'insecticide-3', count: 50 },
			{ value: 'insecticide-4', count: 25 },
			{ value: 'insecticide-5', count: 12 },
			{ value: 'insecticide-6', count: 5 },
		],
		applicationMethodId: [
			{ value: TRUCK, count: 300 },
			{ value: BACKPACK, count: 100 },
			{ value: null, count: 12 },
		],
		applicatorProfileId: [
			{ value: ANA, count: 250 },
			{ value: BEN, count: 150 },
			{ value: null, count: 12 },
		],
	},
	breakdowns: {
		amountApplied: [
			{ by: { insecticideId: BTI, unitId: GALLON }, count: 180, sum: 1240.5 },
			{ by: { insecticideId: PERMETHRIN, unitId: OUNCE }, count: 120, sum: 96 },
			{ by: { insecticideId: BTI, unitId: OUNCE }, count: 20, sum: 32.25 },
		],
	},
};

const DEFAULTS = applicationFilterDefaults('2026-09-28');

function renderSummary(filters: Partial<ApplicationFilters> = {}, summary = SUMMARY) {
	const setFilters = vi.fn<(patch: Partial<ApplicationFilters>) => void>();
	render(
		<DeclaredSummary
			binding={{ filters: { ...DEFAULTS, ...filters }, setFilters }}
			declarations={applicationFilterDeclarations}
			figures={(data) =>
				applicationSummaryFigures(data, {
					insecticideNameById: INSECTICIDE_NAMES,
					unitById: UNITS,
				})
			}
			order={['insecticides', 'methods', 'people']}
			recordType="application"
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

describe('the chemical application summary', () => {
	it('names each insecticide from the catalog, top five and the rest counted', () => {
		renderSummary();

		const insecticides = section('Insecticide');
		expect(buttonTexts(insecticides)).toEqual([
			'VectoBac 12AS200',
			'Permanone120',
			'Altosid50',
			'Natular25',
			'Duet12',
		]);
		expect(within(insecticides).getByText('1 more')).toBeTruthy();
	});

	it('adds an insecticide to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ insecticides: new Set([PERMETHRIN]) });

		fireEvent.click(group('VectoBac 12AS, 200 chemical applications'));
		expect(setFilters).toHaveBeenLastCalledWith({ insecticides: new Set([PERMETHRIN, BTI]) });

		expect(group('Permanone, 120 chemical applications').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Permanone, 120 chemical applications'));
		expect(setFilters).toHaveBeenLastCalledWith({ insecticides: new Set() });
	});

	it('adds an application method to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ methods: new Set([BACKPACK]) });

		// An application recorded with no method has no filter to set, so it is not drawn.
		expect(buttonTexts(section('Method'))).toEqual(['Truck ULV300', 'Backpack100']);
		fireEvent.click(group('Truck ULV, 300 chemical applications'));
		expect(setFilters).toHaveBeenLastCalledWith({ methods: new Set([BACKPACK, TRUCK]) });

		expect(group('Backpack, 100 chemical applications').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Backpack, 100 chemical applications'));
		expect(setFilters).toHaveBeenLastCalledWith({ methods: new Set() });
	});

	it('adds an applicator to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ people: new Set([BEN]) });

		expect(buttonTexts(section('Applicator'))).toEqual(['Ana Ortiz250', 'Ben Hale150']);
		fireEvent.click(group('Ana Ortiz, 250 chemical applications'));
		expect(setFilters).toHaveBeenLastCalledWith({ people: new Set([BEN, ANA]) });

		expect(group('Ben Hale, 150 chemical applications').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Ben Hale, 150 chemical applications'));
		expect(setFilters).toHaveBeenLastCalledWith({ people: new Set() });
	});

	it('draws the amount applied as text, one line per insecticide and unit', () => {
		renderSummary();

		const amounts = section('Amount Applied');
		expect(within(amounts).queryAllByRole('button')).toEqual([]);
		expect(amounts.textContent).toBe(
			'Amount AppliedVectoBac 12AS1240.50 galPermanone96 fl ozVectoBac 12AS32.25 fl oz',
		);
	});
});
