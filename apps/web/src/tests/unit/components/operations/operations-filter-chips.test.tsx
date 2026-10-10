/** @vitest-environment jsdom */

/**
 * The Missions, Assignments and Requests for Control chips against their count
 * (#1610). The three cards are not record sets, so `declared-filters.test.tsx`
 * does not reach them, and each wrote its chip list by hand until it drew from
 * declarations. The cases are that suite's: each filter alone, then every
 * filter at once, and the chips drawn match `activeCount`. The all-at-once
 * case also holds each card's chip labels and order to what the hand-written
 * lists drew.
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { biocontrolFilterDeclarations } from '../../../../components/control-operations/biocontrol/biocontrol-filters';
import { DeclaredFilterChips } from '../../../../components/explorer/declared-filters';
import type { RecordSet } from '../../../../components/explorer/record-set';
import { AssignmentFilterBar } from '../../../../components/operations/assignments/assignment-filter-bar';
import { MissionFilterBar } from '../../../../components/operations/missions/mission-filter-bar';
import { RequestControlFilters } from '../../../../components/operations/requests-for-control/request-control-filters';
import type { AssignmentFilters } from '../../../../hooks/operations/use-assignment-filter-state';
import type { MissionFilters } from '../../../../hooks/operations/use-mission-filter-state';
import {
	type RequestFilters,
	requestFilterDefaults,
} from '../../../../hooks/operations/use-request-for-control-filter-state';
import { datePresetRange, SCHEDULE_WINDOW } from '../../../../lib/date-presets';
import {
	countActiveFilters,
	DATE_RANGE_COUNTING,
	type FilterBinding,
} from '../../../../lib/search-filters';
import { recordSetBinding } from '../explorer/record-set-binding';

// Requested by reads the profiles catalog. With none loaded every id is one
// the catalog does not name, which is the unknown-name chip.
vi.mock('../../../../hooks/explorer/use-catalog-options', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useCatalogOptions: () => ({ options: [], nameById: new Map() }),
}));

afterEach(cleanup);

const TODAY = '2026-10-09';

const ASSIGNEES = [
	{ id: 'unassigned', label: 'Unassigned' },
	{ id: 'p1', label: 'Ada Reyes' },
];

function binding<TFilters extends { readonly from: string; readonly to: string }>(
	defaults: TFilters,
	patch: Partial<TFilters>,
): FilterBinding<TFilters> {
	const filters = { ...defaults, ...patch };
	return {
		filters,
		setFilters: vi.fn(),
		reset: vi.fn(),
		activeCount: countActiveFilters(defaults, filters, DATE_RANGE_COUNTING),
		defaults,
		today: TODAY,
	};
}

function chipNames(): readonly (string | null)[] {
	return screen
		.queryAllByRole('button', { name: /^Remove .* filter$/ })
		.map((button) => button.getAttribute('aria-label'));
}

interface Card<TFilters extends { readonly from: string; readonly to: string }> {
	readonly name: string;
	readonly defaults: TFilters;
	readonly render: (binding: FilterBinding<TFilters>) => ReactElement;
	/** One patch per filter, each moving only that filter off its default. */
	readonly moves: Readonly<Record<string, Partial<TFilters>>>;
	/** The chips every move together draws, in order. */
	readonly chips: readonly string[];
}

const scheduleWindow = datePresetRange(SCHEDULE_WINDOW, TODAY);

const MISSIONS: Card<MissionFilters> = {
	name: 'Missions',
	defaults: {
		...scheduleWindow,
		statuses: new Set(),
		types: new Set(),
		people: new Set(),
	},
	render: (b) => <MissionFilterBar assigneeOptions={ASSIGNEES} binding={b} />,
	moves: {
		dates: { from: '2026-01-01' },
		statuses: { statuses: new Set(['scheduled', 'completed'] as const) },
		types: { types: new Set(['outreach', 'application']) },
		people: { people: new Set(['p1', 'gone']) },
	},
	chips: [
		`Remove Dates: Jan 1–${scheduleWindowEnd()} filter`,
		'Remove Scheduled filter',
		'Remove Completed filter',
		'Remove Outreach filter',
		'Remove Application filter',
		'Remove Ada Reyes filter',
		'Remove Unknown profile filter',
	],
};

const ASSIGNMENTS: Card<AssignmentFilters> = {
	name: 'Assignments',
	defaults: { ...scheduleWindow, people: new Set(), statuses: new Set() },
	render: (b) => <AssignmentFilterBar assigneeOptions={ASSIGNEES} binding={b} />,
	moves: {
		dates: { from: '2026-01-01' },
		people: { people: new Set(['unassigned', 'gone']) },
		statuses: { statuses: new Set(['notStarted', 'cancelled'] as const) },
	},
	chips: [
		`Remove Dates: Jan 1–${scheduleWindowEnd()} filter`,
		'Remove Unassigned filter',
		'Remove Unknown profile filter',
		'Remove Not started filter',
		'Remove Cancelled filter',
	],
};

const REQUESTS: Card<RequestFilters> = {
	name: 'Requests for Control',
	defaults: requestFilterDefaults(TODAY),
	render: (b) => <RequestControlFilters binding={b} />,
	moves: {
		status: { status: 'resolved' },
		dates: { from: '2026-01-01' },
		types: { types: new Set(['biocontrol', 'source_reduction']) },
		people: { people: new Set(['gone']) },
		unassigned: { unassigned: true },
	},
	chips: [
		'Remove Status: Resolved filter',
		'Remove Dates: Jan 1–Oct 9 filter',
		'Remove Biocontrol filter',
		'Remove Source Reduction filter',
		'Remove Unknown person filter',
		'Remove Not yet assigned filter',
	],
};

/** The schedule window's end as the Dates chip writes it. */
function scheduleWindowEnd(): string {
	const end = new Date(`${datePresetRange(SCHEDULE_WINDOW, TODAY).to}T00:00:00`);
	return end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CARDS = [MISSIONS, ASSIGNMENTS, REQUESTS] as unknown as readonly Card<{
	readonly from: string;
	readonly to: string;
}>[];

describe.each(CARDS)('the $name chips', (card) => {
	it('draw nothing with every filter at its default', () => {
		const b = binding(card.defaults, {});
		render(card.render(b));

		expect(b.activeCount).toBe(0);
		expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
	});

	it.each(Object.entries(card.moves))('draw one chip per %s value the count counts', (_, move) => {
		const b = binding(card.defaults, move);
		render(card.render(b));

		expect(b.activeCount).toBeGreaterThan(0);
		expect(chipNames()).toHaveLength(b.activeCount);
	});

	it('draw every chip, in order, with every filter moved at once', () => {
		const b = binding(card.defaults, Object.assign({}, ...Object.values(card.moves)));
		render(card.render(b));

		expect(chipNames()).toHaveLength(b.activeCount);
		expect(chipNames()).toEqual(card.chips);
	});
});

describe('a profile the catalog does not hold', () => {
	it('reads the same on Requests for Control as on a record set Technician filter', () => {
		render(
			<RequestControlFilters binding={binding(REQUESTS.defaults, { people: new Set(['gone']) })} />,
		);
		const onRequests = chipNames();
		cleanup();

		const set = biocontrolFilterDeclarations.set as unknown as RecordSet<Record<string, unknown>>;
		render(
			<DeclaredFilterChips
				binding={recordSetBinding(set, 'map', { people: new Set(['gone']) })}
				declarations={biocontrolFilterDeclarations as never}
			/>,
		);

		expect(onRequests).toEqual(chipNames());
	});
});
