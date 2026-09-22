/** @vitest-environment jsdom */

/**
 * The Today page rendered whole, through its states and the rules the URL
 * carries: the period the address names, the rewrite of one it cannot show,
 * the hidden-type rule, the absence glyph over a zero denominator, and the
 * picker's bounds. The server is a `sessionFetch` the suite answers. The
 * router is the stand-in beside the route suites, so a `Link` is an anchor;
 * where each one goes is asserted by href in `link-destinations.test.tsx`.
 */

import type { OverviewResponse } from '@simmer-mosquito/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '../../../lib/collections/organizations';
import { dayOverview } from '../components/overview/overview-fixtures';
import { installMemoryCollections, seedRows } from '../lib/collections/memory-collections';

const harness = vi.hoisted(() => ({
	search: {} as Record<string, unknown>,
	sent: [] as URL[],
	answer: (() => ({})) as (url: URL) => unknown,
	navigate: vi.fn(async () => undefined),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('./route-mock-stand-ins');
	return {
		...routerStandIn(await importOriginal<object>(), () => harness.search),
		useNavigate: () => harness.navigate,
	};
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
	// The stand-in beside the route suites answers every read as a 200; this
	// page also has to meet the server's 400, so `answer` may hand back a
	// `Response` of its own.
	sessionFetch: (input: URL | string) => {
		const url = input instanceof URL ? input : new URL(input);
		harness.sent.push(url);
		const body = harness.answer(url);
		return Promise.resolve(
			body instanceof Response ? body : new Response(JSON.stringify(body), { status: 200 }),
		);
	},
}));

const { OverviewPage } = await import('../../../components/overview/overview-page');

/** Noon in New York on 2026-09-15, the Organization's default zone in a suite. */
const NOW = new Date('2026-09-15T16:00:00Z');

function renderToday() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<Suspense fallback={<span>loading</span>}>
				<OverviewPage grain="day" />
			</Suspense>
		</QueryClientProvider>,
	);
}

function answerWith(response: OverviewResponse | 'refuse') {
	harness.answer = () => {
		if (response === 'refuse') {
			throw new Error('refused');
		}
		return response;
	};
}

/** The server's 400 on a period in its future, which the client's clock did not see. */
function refusePeriod() {
	harness.answer = () =>
		new Response(JSON.stringify({ error: 'overview_period_invalid' }), { status: 400 });
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
	harness.search = {};
	harness.sent.length = 0;
	harness.navigate.mockClear();
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	// jsdom has no layout, so Recharts' responsive container watches nothing.
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	answerWith(dayOverview());
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function table() {
	return within(screen.getByRole('table'));
}

describe('the Today page', () => {
	it('reads the current day when the address names none, and draws the table off the response', async () => {
		renderToday();

		await waitFor(() => screen.getByRole('table'));

		expect(harness.sent.map((url) => `${url.pathname}${url.search}`)).toEqual([
			'/overview/day?date=2026-09-15',
		]);
		expect(screen.getByRole('heading', { name: 'Sep 15, 2026' })).toBeTruthy();
		expect(screen.getByText('Tuesday, September 15, 2026')).toBeTruthy();
		expect(
			table()
				.getAllByRole('columnheader')
				.map((cell) => cell.textContent),
		).toEqual(['Record type', 'Sep 15, 2026', 'Sep 14, 2026']);
		expect(table().getByRole('row', { name: /^Inspections/ }).textContent).toBe('Inspections12098');
	});

	it('hides a type the Organization has never recorded, and draws the rest', async () => {
		renderToday();

		await waitFor(() => screen.getByRole('table'));

		const rows = table()
			.getAllByRole('rowheader')
			.map((cell) => cell.textContent);
		expect(rows).toEqual([
			'Inspections',
			'Samples',
			'Collections',
			'Chemical Applications',
			'Source Reductions',
			'Service Requests received',
			'Positive inspections',
			'Mosquitoes per collection',
		]);
		// One chart panel per shown row, under the trend heading; the table's row
		// heads are row headers, so a panel title is the one heading a row has.
		expect(screen.getByRole('heading', { name: '2026 by day' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Inspections' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Mosquitoes per collection' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'Biocontrol Actions' })).toBeNull();
		expect(screen.queryByRole('heading', { name: 'Outreach Actions' })).toBeNull();
	});

	it('draws the absence glyph over a zero denominator, with the count beside it', async () => {
		renderToday();

		await waitFor(() => screen.getByRole('table'));

		const ratio = table().getByRole('row', { name: /^Mosquitoes per collection/ });
		expect(within(ratio).getAllByRole('img', { name: 'Not recorded' })).toHaveLength(1);
		expect(ratio.textContent).toBe('Mosquitoes per collection123.5(3,210)—(0)');
		const positive = table().getByRole('row', { name: /^Positive inspections/ });
		expect(positive.textContent).toBe('Positive inspections34%(41)31%(30)');
	});

	it('reads the day the address names and offers the way back to today', async () => {
		harness.search = { date: '2026-09-01' };
		renderToday();

		await waitFor(() => screen.getByRole('table'));

		expect(harness.sent[0]?.search).toBe('?date=2026-09-01');
		expect(screen.getByRole('heading', { name: 'Sep 1, 2026' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy();
		expect(harness.navigate).not.toHaveBeenCalled();
	});

	it('rewrites a malformed or future date to today, and leaves an early one alone', async () => {
		harness.search = { date: '2026-13-40' };
		renderToday();
		await waitFor(() => screen.getByRole('table'));
		expect(harness.navigate).toHaveBeenCalledWith({ to: '/today', search: {}, replace: true });
		expect(harness.sent[0]?.search).toBe('?date=2026-09-15');
		cleanup();

		harness.search = { date: '2026-09-16' };
		harness.navigate.mockClear();
		renderToday();
		await waitFor(() => screen.getByRole('table'));
		expect(harness.navigate).toHaveBeenCalledWith({ to: '/today', search: {}, replace: true });
		cleanup();

		harness.search = { date: '2001-01-01' };
		harness.navigate.mockClear();
		harness.sent.length = 0;
		renderToday();
		await waitFor(() => screen.getByRole('table'));
		expect(harness.navigate).not.toHaveBeenCalled();
		expect(harness.sent[0]?.search).toBe('?date=2001-01-01');
	});

	it('rewrites to today when the server refuses the period as future', async () => {
		harness.search = { date: '2026-09-15' };
		refusePeriod();
		renderToday();

		await waitFor(() => expect(harness.navigate).toHaveBeenCalled());

		expect(harness.navigate).toHaveBeenCalledWith({ to: '/today', search: {}, replace: true });
	});

	it('disables next at today and shows no way back while today is shown', async () => {
		renderToday();

		await waitFor(() => screen.getByRole('table'));

		expect(screen.getByRole('button', { name: 'Next day' })).toHaveProperty('disabled', true);
		expect(screen.getByRole('button', { name: 'Previous day' })).toHaveProperty('disabled', false);
		expect(screen.queryByRole('button', { name: 'Today' })).toBeNull();
	});

	it('draws one message in place of the table when nothing is recorded, and another when the read fails', async () => {
		answerWith(dayOverview({ earliest: null }));
		renderToday();
		await waitFor(() => screen.getByText('Nothing has been recorded yet.'));
		expect(screen.queryByRole('heading', { name: '2026 by day' })).toBeNull();
		cleanup();

		answerWith('refuse');
		renderToday();
		await waitFor(() => screen.getByText('This period is unavailable right now.'));
		expect(screen.queryByRole('heading', { name: '2026 by day' })).toBeNull();
	});
});
