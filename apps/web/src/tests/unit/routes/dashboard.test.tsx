/** @vitest-environment jsdom */

/**
 * The Dashboard rendered whole, through its four states: loading, loaded,
 * empty and the server half failing.
 *
 * The strip and the four Electric queues come off memory collections and the server half
 * off a `sessionFetch` the suite answers, so what is on screen is what the
 * hooks and the query really produced rather than a fixture handed to a
 * component. The router is the stand-in beside the route suites, because a
 * `Link` here only needs to be an anchor; where each one goes is asserted by
 * href in `link-destinations.test.tsx`, the one file for that.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardResponse } from '../../../components/dashboard/dashboard-data';
import { assignment_items } from '../../../lib/collections/assignment_items';
import { collections } from '../../../lib/collections/collections';
import { habitats } from '../../../lib/collections/habitats';
import { inspections } from '../../../lib/collections/inspections';
import { missions } from '../../../lib/collections/missions';
import { organizations } from '../../../lib/collections/organizations';
import { profiles } from '../../../lib/collections/profiles';
import { samples } from '../../../lib/collections/samples';
import { service_requests } from '../../../lib/collections/service_requests';
import { installMemoryCollections, seedRows } from '../lib/collections/memory-collections';

const harness = vi.hoisted(() => ({
	/** Every pending `/dashboard` read, so a case can answer or refuse it. */
	pending: [] as ((response: Response) => void)[],
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('./route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
	sessionFetch: () =>
		new Promise<Response>((resolve) => {
			harness.pending.push(resolve);
		}),
}));

const { DashboardPage } = await import('../../../components/dashboard/dashboard-page');

/** Noon in New York on 2026-09-15, so `today` is fixed for every age below. */
const NOW = new Date('2026-09-15T16:00:00Z');

function answer(body: DashboardResponse): void {
	const resolve = harness.pending.shift();
	if (resolve === undefined) {
		throw new Error('No dashboard read is pending.');
	}
	resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function refuse(): void {
	harness.pending.shift()?.(new Response('{}', { status: 500 }));
}

function renderDashboard() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<Suspense fallback={<span>loading</span>}>
				<DashboardPage />
			</Suspense>
		</QueryClientProvider>,
	);
}

const SERVER: DashboardResponse = {
	today: '2026-09-15',
	queues: {
		samplesAwaiting: { count: 23, oldest: '2026-08-27' },
		collectionsAwaiting: { count: 41, oldest: '2026-09-03' },
		requestsUnassigned: { count: 6, oldest: '2026-09-11' },
	},
};

const EMPTY: DashboardResponse = {
	today: '2026-09-15',
	queues: {
		samplesAwaiting: { count: 0, oldest: null },
		collectionsAwaiting: { count: 0, oldest: null },
		requestsUnassigned: { count: 0, oldest: null },
	},
};

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
	harness.pending.length = 0;
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	seedRows(profiles, [
		{ id: 'p-dana', display_name: 'Dana Okafor' },
		{ id: 'p-miguel', display_name: 'Miguel Herrera' },
	]);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

/** The panel whose heading reads `title`, so an assertion is scoped to it. */
function panel(title: string) {
	const heading = screen.getByRole('heading', { name: title });
	const card = heading.closest('[data-slot="card"]') ?? heading.parentElement?.parentElement;
	if (card === null || card === undefined) {
		throw new Error(`No panel around the heading ${title}.`);
	}
	return within(card as HTMLElement);
}

/**
 * The queue line whose link reads `label`. By text rather than by role: the
 * router stand-in's `Link` is an anchor with no `href`, which has no link role.
 */
function queueLine(label: string): HTMLElement {
	const line = screen.getByText(label).closest('li');
	if (line === null) {
		throw new Error(`No queue line for ${label}.`);
	}
	return line;
}

/**
 * A strip cell's drawn text, found by its label. The cell also holds a
 * screen-reader sentence in place of what it draws, which `spoken` reads.
 */
function stripCell(label: string): { readonly textContent: string; readonly spoken: string } {
	const cell = screen.getByText(label).parentElement;
	if (cell === null || cell === undefined) {
		throw new Error(`No strip cell labelled ${label}.`);
	}
	const drawn = [...cell.children].filter((child) => !child.classList.contains('sr-only'));
	return {
		textContent: drawn.map((child) => child.textContent).join(''),
		spoken: cell.querySelector('.sr-only')?.textContent ?? '',
	};
}

describe('the Dashboard', () => {
	it('draws skeletons until the server answers', async () => {
		renderDashboard();

		await waitFor(() => expect(harness.pending).toHaveLength(1));
		expect(screen.getByRole('heading', { name: 'Surveillance backlog' })).toBeTruthy();
		expect(screen.queryByText(/awaiting identification/)).toBeNull();
		// Every section that waits on the server holds a skeleton, and no count pill.
		expect(document.querySelectorAll('[aria-hidden="true"] .animate-pulse').length).toBeGreaterThan(
			0,
		);
	});

	it('draws every section from the hooks and the server read', async () => {
		seedRows(collections, [
			{
				id: 'c-problem',
				trap_id: 't1',
				collection_method_id: 'm1',
				collected_at: null,
				collection_date: '2026-09-06',
				collection_timing_mode: 'collection_date_duration',
				has_problem: true,
				is_zero_result: false,
				has_bycatch: false,
			},
			{
				id: 'c-window',
				trap_id: 't1',
				collection_method_id: 'm1',
				// 2am on the 16th UTC is 10pm on the 15th in New York: inside the
				// window by the Organization's clock, past it by UTC.
				collected_at: new Date('2026-09-16T02:00:00Z'),
				collected_by_profile_id: 'p-miguel',
				collection_date: null,
				collection_timing_mode: 'exact_timestamps',
				has_problem: false,
				is_zero_result: false,
				has_bycatch: false,
			},
		]);
		// Three inspections in the window and one the week before, the samples
		// counted on their parent's date: three under the newest, one under the old.
		// The newest is today's and Dana's, which is one of her two records in the
		// field today; the habitat she created this morning is the other.
		seedRows(inspections, [
			{
				id: 'i-1',
				habitat_id: 'h1',
				inspection_date: '2026-09-15',
				inspected_by_profile_id: 'p-dana',
				created_at: new Date('2026-09-15T18:52:00Z'),
			},
			{ id: 'i-2', habitat_id: 'h1', inspection_date: '2026-09-10' },
			{ id: 'i-3', habitat_id: 'h1', inspection_date: '2026-09-09' },
			{ id: 'i-prior', habitat_id: 'h1', inspection_date: '2026-09-02' },
			{ id: 'i-out', habitat_id: 'h1', inspection_date: '2026-09-01' },
		]);
		seedRows(habitats, [
			{
				id: 'h1',
				habitat_name: 'Culvert 12',
				created_by_profile_id: 'p-dana',
				created_at: new Date('2026-09-15T16:30:00Z'),
			},
		]);
		seedRows(samples, [
			{ id: 's-1', inspection_id: 'i-1' },
			{ id: 's-2', inspection_id: 'i-1' },
			{ id: 's-3', inspection_id: 'i-1' },
			{ id: 's-prior', inspection_id: 'i-prior' },
			{ id: 's-out', inspection_id: 'i-out' },
		]);
		seedRows(service_requests, [
			{ id: 'sr-1', request_date: '2026-05-26', closed_at: null },
			{ id: 'sr-2', request_date: '2026-09-10', closed_at: null },
			{ id: 'sr-3', request_date: '2026-09-12', closed_at: null },
		]);
		seedRows(assignment_items, [
			{ id: 'stop-1', assignment_id: 'a1', entity_type: 'service_request', entity_id: 'sr-3' },
		]);
		seedRows(missions, [
			{
				id: 'm-overdue',
				mission_name: 'Levee run',
				control_type: 'larvicide',
				scheduled_start_at: new Date('2026-09-14T13:00:00Z'),
				started_at: null,
				completed_at: null,
				cancelled_at: null,
			},
		]);
		renderDashboard();
		await waitFor(() => expect(harness.pending).toHaveLength(1));
		answer(SERVER);

		await waitFor(() => expect(screen.getByText('Samples awaiting identification')));

		// Surveillance backlog: two server rows and one Electric row, the pill their sum.
		expect(queueLine('Samples awaiting identification').textContent).toContain('19 days');
		expect(queueLine('Samples awaiting identification').textContent).toContain('23');
		expect(queueLine('Collections awaiting identification').textContent).toContain('12 days');
		expect(queueLine('Collections with a problem').textContent).toContain('last 14 days');
		expect(queueLine('Collections with a problem').textContent).toContain('9 days');
		expect(panel('Surveillance backlog').getByText('65')).toBeTruthy();

		// Operations backlog: the split, the unassigned count, an empty row, an overdue mission.
		expect(queueLine('Open service requests').textContent).toContain('2 new · 1 in progress');
		expect(queueLine('Open service requests').textContent).toContain('112 days');
		expect(queueLine('Requests for Control not yet assigned').textContent).toContain('4 days');
		expect(queueLine('Assignments started and not finished').className).toContain(
			'text-muted-foreground',
		);
		expect(queueLine('Missions due today or overdue').textContent).toContain('1 day');
		expect(panel('Operations backlog').getByText('10')).toBeTruthy();

		// The strip: every type a cell, counted off the synced rows on its own date.
		expect(screen.getByText('Sep 9 to Sep 15, change vs previous 7 days')).toBeTruthy();
		expect(stripCell('Inspections').textContent).toBe('3+2Inspections');
		expect(stripCell('Inspections').spoken).toBe('3 inspections, up 2 vs previous 7 days');
		expect(stripCell('Samples').textContent).toBe('3+2Samples');
		// One in each window, the exact-timestamp one placed by the Organization's zone.
		expect(stripCell('Collections').textContent).toBe('10Collections');
		expect(stripCell('Collections').spoken).toContain('no change');
		expect(stripCell('Service Requests received').textContent).toBe('2+2Service Requests received');
		// A type with no row is a cell at zero.
		expect(stripCell('Biocontrol Actions').textContent).toBe('00Biocontrol Actions');

		// The toggle restates every change as a percentage; a rise from nothing has no base.
		fireEvent.click(screen.getByRole('radio', { name: 'Change as a percentage' }));
		expect(stripCell('Inspections').textContent).toBe('3+200%Inspections');
		expect(stripCell('Collections').textContent).toBe('10%Collections');
		expect(stripCell('Service Requests received').textContent).toBe(
			'2from 0Service Requests received',
		);

		// The people table: names off the profiles, most records first, the time
		// in the Organization's zone. Miguel's collect is 10pm New York, which is
		// tomorrow in UTC and today here.
		const people = panel('In the field today');
		const rows = people.getAllByRole('row').slice(1);
		expect(rows.map((row) => row.textContent)).toEqual([
			'Dana Okafor22:52 PM',
			'Miguel Herrera110:00 PM',
		]);
	});

	it('draws the empty states without hiding the check that ran', async () => {
		renderDashboard();
		await waitFor(() => expect(harness.pending).toHaveLength(1));
		answer(EMPTY);

		await waitFor(() => expect(screen.getByText('Samples awaiting identification')));

		const samples = queueLine('Samples awaiting identification');
		expect(samples.className).toContain('text-muted-foreground');
		expect(samples.textContent).not.toContain('day');
		// Eight cells, each at zero with no chevron.
		expect(stripCell('Inspections').textContent).toBe('00Inspections');
		expect(stripCell('Samples').textContent).toBe('00Samples');
		expect(screen.queryByLabelText(/^(Up|Down)$/)).toBeNull();
		expect(screen.getByText('Nothing logged yet today.')).toBeTruthy();
	});

	it('says which sections are unavailable when the server read fails', async () => {
		renderDashboard();
		await waitFor(() => expect(harness.pending).toHaveLength(1));
		refuse();

		await waitFor(() =>
			expect(screen.getAllByText('Pending work is unavailable right now.')).toHaveLength(2),
		);
		// The strip and the people table read Electric and are unaffected.
		expect(screen.queryByText('Activity is unavailable right now.')).toBeNull();
		expect(screen.getByText('Inspections')).toBeTruthy();
		expect(screen.getByText('Nothing logged yet today.')).toBeTruthy();
	});
});
