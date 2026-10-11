/** @vitest-environment jsdom */

/**
 * The Service Requests summary's groupings and its figures, drawn and clicked.
 *
 * A group is a button that writes the filter it names through the route's
 * `setFilters`, and a group already in the filter is drawn pressed and widens
 * back out when clicked (#1371). The summary holds no filter state of its own,
 * so the whole assertion is what `setFilters` was handed.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeclaredSummary } from '../../../../../components/explorer/declared-summary';
import { serviceRequestFilterDeclarations } from '../../../../../components/public-engagement/service-requests/service-request-filters';
import { serviceRequestSummaryFigures } from '../../../../../components/public-engagement/service-requests/service-request-summary';
import type { ServiceRequestFilters } from '../../../../../components/public-engagement/service-requests/service-requests-search';
import type { MapSummary } from '../../../../../hooks/explorer/use-explorer-summary';

// The Tags declaration names the Tag catalog, which the summary reads for names.
vi.mock('../../../../../hooks/explorer/use-tag-options', () => ({
	useTagOptions: () => ({
		options: [],
		byId: new Map([...TAG_NAMES].map(([id, name]) => [id, { id, name, color: null }])),
	}),
}));

afterEach(cleanup);

const DRAINAGE = 'tag-drainage';
const NOISE = 'tag-noise';

const TAG_NAMES = new Map([
	[DRAINAGE, 'Drainage'],
	[NOISE, 'Noise'],
	['tag-3', 'Tires'],
	['tag-4', 'Pool'],
	['tag-5', 'Ditch'],
	['tag-6', 'Catch basin'],
]);

const SUMMARY: MapSummary = {
	total: 412,
	groups: {
		status: [
			{ value: 'closed', count: 300 },
			{ value: 'open', count: 112 },
		],
		tagId: [
			{ value: DRAINAGE, count: 160 },
			{ value: NOISE, count: 80 },
			{ value: 'tag-3', count: 40 },
			{ value: 'tag-4', count: 20 },
			{ value: 'tag-5', count: 10 },
			{ value: 'tag-6', count: 5 },
		],
		intakeType: [
			{ value: 'phone', count: 250 },
			{ value: 'online', count: 120 },
			{ value: 'walk-in', count: 30 },
			{ value: 'other', count: 12 },
		],
	},
	figures: { oldestOpenDays: 41 },
};

const DEFAULTS: ServiceRequestFilters = {
	status: 'all',
	search: '',
	tags: new Set(),
	regions: new Set(),
	from: '2026-01-01',
	to: '2026-10-06',
	overdue: false,
};

function renderSummary(filters: Partial<ServiceRequestFilters> = {}, summary = SUMMARY) {
	const setFilters = vi.fn<(patch: Partial<ServiceRequestFilters>) => void>();
	render(
		<DeclaredSummary
			binding={{ filters: { ...DEFAULTS, ...filters }, setFilters }}
			declarations={serviceRequestFilterDeclarations}
			figures={serviceRequestSummaryFigures}
			order={['status', 'tags']}
			recordType="serviceRequest"
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

describe('the service request summary', () => {
	it('draws Open before Closed whichever holds more, and sets the status clicked', () => {
		const setFilters = renderSummary();

		expect(buttonTexts(section('Status'))).toEqual(['Open112', 'Closed300']);

		fireEvent.click(group('Open, 112 service requests'));
		expect(setFilters).toHaveBeenLastCalledWith({ status: 'open' });
		fireEvent.click(group('Closed, 300 service requests'));
		expect(setFilters).toHaveBeenLastCalledWith({ status: 'closed' });
	});

	it('widens the status back to all from the selected one', () => {
		const setFilters = renderSummary({ status: 'open' });

		expect(group('Open, 112 service requests').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Open, 112 service requests'));

		expect(setFilters).toHaveBeenLastCalledWith({ status: 'all' });
	});

	it('draws no status that no request in view is in', () => {
		renderSummary({}, { total: 150, groups: { status: [{ value: 'open', count: 150 }] } });

		expect(buttonTexts(section('Status'))).toEqual(['Open150']);
	});

	it('names each Tag from the catalog, top five and the rest counted', () => {
		renderSummary();

		const tags = section('Tags');
		expect(buttonTexts(tags)).toEqual(['Drainage160', 'Noise80', 'Tires40', 'Pool20', 'Ditch10']);
		expect(within(tags).getByText('1 more')).toBeTruthy();
	});

	it('adds a Tag to the filter, and takes a selected one back out', () => {
		const setFilters = renderSummary({ tags: new Set([NOISE]) });

		fireEvent.click(group('Drainage, 160 service requests'));
		expect(setFilters).toHaveBeenLastCalledWith({ tags: new Set([NOISE, DRAINAGE]) });

		expect(group('Noise, 80 service requests').getAttribute('aria-pressed')).toBe('true');
		fireEvent.click(group('Noise, 80 service requests'));
		expect(setFilters).toHaveBeenLastCalledWith({ tags: new Set() });
	});

	it('draws the intake types as text, with no filter behind them', () => {
		renderSummary();

		const intake = section('Intake Type');
		expect(within(intake).queryByRole('button')).toBeNull();
		expect(within(intake).getByText('Phone')).toBeTruthy();
		expect(within(intake).getByText('Walk-in')).toBeTruthy();
		expect(intake.textContent).toContain('250');
	});

	it('draws the days the oldest open request has waited as text', () => {
		renderSummary();

		const waiting = section('Waiting');
		expect(within(waiting).queryByRole('button')).toBeNull();
		expect(waiting.textContent).toBe('WaitingDays the oldest open request has waited41');
	});

	it('draws no waiting figure when no open request is in view', () => {
		renderSummary({ status: 'closed' }, { total: 300, groups: {}, figures: {} });

		expect(screen.queryByRole('region', { name: 'Waiting' })).toBeNull();
	});
});
