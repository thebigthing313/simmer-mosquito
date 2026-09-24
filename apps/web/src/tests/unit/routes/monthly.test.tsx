/** @vitest-environment jsdom */

/**
 * The Monthly page rendered whole: the month the address names, the rewrite
 * of one it cannot show, the cut caption on a partial month, the legend on
 * the trend heading, and the picker's select and bounds. The server is a
 * `sessionFetch` the suite answers; the router is the stand-in beside the
 * route suites, so where each `Link` goes is asserted by href in
 * `link-destinations.test.tsx`.
 */

import type { OverviewResponse } from '@simmer-mosquito/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '../../../lib/collections/organizations';
import { monthOverview } from '../components/overview/overview-fixtures';
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

vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const { sessionFetchStandIn } = await import('./route-mock-stand-ins');
	return {
		...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
		sessionFetch: sessionFetchStandIn(harness.sent, (url) => harness.answer(url)),
	};
});

const { OverviewPage } = await import('../../../components/overview/overview-page');

/** Noon in New York on 2026-09-15. */
const NOW = new Date('2026-09-15T16:00:00Z');

function renderMonthly() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<Suspense fallback={<span>loading</span>}>
				<OverviewPage grain="month" />
			</Suspense>
		</QueryClientProvider>,
	);
}

function answerWith(response: OverviewResponse) {
	harness.answer = () => response;
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
	answerWith(monthOverview());
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function table() {
	return within(screen.getByRole('table'));
}

describe('the Monthly page', () => {
	it('reads the current month when the address names none, with the cut caption on it', async () => {
		renderMonthly();

		await waitFor(() => screen.getByRole('table'));

		expect(harness.sent.map((url) => `${url.pathname}${url.search}`)).toEqual([
			'/overview/month?month=2026-09',
		]);
		expect(screen.getByRole('heading', { name: 'Sep 2026' })).toBeTruthy();
		expect(screen.getByText('Each period through the 15th')).toBeTruthy();
		expect(
			table()
				.getAllByRole('columnheader')
				.map((cell) => cell.textContent),
		).toEqual(['Record type', 'Sep 2026', 'Aug 2026', 'Sep 2025', '2021–2025 average']);
		expect(table().getByRole('row', { name: /^Inspections/ }).textContent).toBe(
			'Inspections2,1403,9802,3102,266',
		);
	});

	it('heads the trend with both years and draws the legend once', async () => {
		renderMonthly();

		await waitFor(() => screen.getByRole('table'));

		expect(screen.getByRole('heading', { name: '2026 by month, beside 2025' })).toBeTruthy();
		const legend = screen.getByRole('list');
		expect(
			within(legend)
				.getAllByRole('listitem')
				.map((item) => item.textContent),
		).toEqual(['2026', '2025']);
		// The upward line names the month in full beside the select that does.
		expect(screen.getAllByText('September 2026')).toHaveLength(2);
	});

	it('draws no caption on a complete month and offers the way back to this month', async () => {
		harness.search = { month: '2026-06' };
		answerWith(
			monthOverview({
				period: '2026-06',
				cutThrough: null,
				columns: [
					{ key: 'period', from: '2026-06-01', to: '2026-06-30' },
					{ key: 'previous', from: '2026-05-01', to: '2026-05-31' },
					{ key: 'lastYear', from: '2025-06-01', to: '2025-06-30' },
					{ key: 'average', years: { from: 2021, to: 2025 } },
				],
			}),
		);
		renderMonthly();

		await waitFor(() => screen.getByRole('table'));

		expect(screen.queryByText(/^Each period through/)).toBeNull();
		expect(screen.getByRole('heading', { name: 'Jun 2026' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'This Month' })).toBeTruthy();
		expect(screen.getByRole('combobox', { name: 'Month shown' }).textContent).toBe('June 2026');
		expect(harness.navigate).not.toHaveBeenCalled();
	});

	it('rewrites a malformed or future month to this month', async () => {
		harness.search = { month: '2026-13' };
		renderMonthly();
		await waitFor(() => screen.getByRole('table'));
		expect(harness.navigate).toHaveBeenCalledWith({ to: '/monthly', search: {}, replace: true });
		expect(harness.sent[0]?.search).toBe('?month=2026-09');
		cleanup();

		harness.search = { month: '2026-10' };
		harness.navigate.mockClear();
		renderMonthly();
		await waitFor(() => screen.getByRole('table'));
		expect(harness.navigate).toHaveBeenCalledWith({ to: '/monthly', search: {}, replace: true });
	});

	it('lists a month before the earliest as the shown value, with no way further back', async () => {
		harness.search = { month: '2009-05' };
		answerWith(monthOverview({ period: '2009-05', cutThrough: null }));
		renderMonthly();

		await waitFor(() => screen.getByRole('table'));

		// The select draws nothing for a value it has no item for, so the trigger
		// reading the month is the extra item at the bottom of the list.
		expect(screen.getByRole('combobox', { name: 'Month shown' }).textContent).toBe('May 2009');
		expect(screen.getByRole('button', { name: 'Previous Month' })).toHaveProperty('disabled', true);
		expect(harness.navigate).not.toHaveBeenCalled();
	});

	it('disables next at this month and shows no way back while it is shown', async () => {
		renderMonthly();

		await waitFor(() => screen.getByRole('table'));

		expect(screen.getByRole('button', { name: 'Next Month' })).toHaveProperty('disabled', true);
		expect(screen.getByRole('button', { name: 'Previous Month' })).toHaveProperty(
			'disabled',
			false,
		);
		expect(screen.queryByRole('button', { name: 'This Month' })).toBeNull();
	});
});
