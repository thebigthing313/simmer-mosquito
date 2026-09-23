/** @vitest-environment jsdom */

/**
 * The Annual page rendered whole: the year the address names, the rewrite of
 * one it cannot show, the cut caption on a partial year, three columns and no
 * upward line, the year select and its bounds, and the trend section not
 * drawn under three years. The server is a `sessionFetch` the suite answers;
 * the router is the stand-in beside the route suites, so where each `Link`
 * goes is asserted by href in `link-destinations.test.tsx`.
 */

import type { OverviewResponse } from '@simmer-mosquito/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '../../../lib/collections/organizations';
import { yearOverview } from '../components/overview/overview-fixtures';
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

function renderAnnual() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<Suspense fallback={<span>loading</span>}>
				<OverviewPage grain="year" />
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
	answerWith(yearOverview());
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function table() {
	return within(screen.getByRole('table'));
}

describe('the Annual page', () => {
	it('reads the current year when the address names none, with three columns and the cut caption', async () => {
		renderAnnual();

		await waitFor(() => screen.getByRole('table'));

		expect(harness.sent.map((url) => `${url.pathname}${url.search}`)).toEqual([
			'/overview/year?year=2026',
		]);
		expect(screen.getByRole('heading', { name: '2026' })).toBeTruthy();
		expect(screen.getByText('Each period through Sep 15')).toBeTruthy();
		expect(
			table()
				.getAllByRole('columnheader')
				.map((cell) => cell.textContent),
		).toEqual(['Record type', '2026', '2025', '2021–2025 average']);
		expect(table().getByRole('row', { name: /^Inspections/ }).textContent).toBe(
			'Inspections24,11037,31431,200.4',
		);
		// No coarser grain, so no upward line and no legend.
		expect(screen.queryByRole('link', { name: '2026' })).toBeNull();
		expect(screen.queryByRole('list')).toBeNull();
		expect(screen.getByRole('heading', { name: 'By year' })).toBeTruthy();
	});

	it('reads the year the address names and offers the way back to this year', async () => {
		harness.search = { year: 2023 };
		answerWith(
			yearOverview({
				period: '2023',
				cutThrough: null,
				columns: [
					{ key: 'period', from: '2023-01-01', to: '2023-12-31' },
					{ key: 'previous', from: '2022-01-01', to: '2022-12-31' },
					{ key: 'average', years: { from: 2018, to: 2022 } },
				],
			}),
		);
		renderAnnual();

		await waitFor(() => screen.getByRole('table'));

		expect(harness.sent[0]?.search).toBe('?year=2023');
		expect(screen.queryByText(/^Each period through/)).toBeNull();
		expect(screen.getByRole('combobox', { name: 'Year shown' }).textContent).toBe('2023');
		expect(screen.getByRole('button', { name: 'This year' })).toBeTruthy();
		expect(harness.navigate).not.toHaveBeenCalled();
	});

	it('rewrites a malformed or future year to this year', async () => {
		harness.search = { year: '26' };
		renderAnnual();
		await waitFor(() => screen.getByRole('table'));
		expect(harness.navigate).toHaveBeenCalledWith({ to: '/annual', search: {}, replace: true });
		expect(harness.sent[0]?.search).toBe('?year=2026');
		cleanup();

		harness.search = { year: 2031 };
		harness.navigate.mockClear();
		renderAnnual();
		await waitFor(() => screen.getByRole('table'));
		expect(harness.navigate).toHaveBeenCalledWith({ to: '/annual', search: {}, replace: true });
	});

	it('lists a year before the earliest as the shown value, with no way further back', async () => {
		harness.search = { year: 2005 };
		answerWith(yearOverview({ period: '2005', cutThrough: null }));
		renderAnnual();

		await waitFor(() => screen.getByRole('table'));

		expect(screen.getByRole('combobox', { name: 'Year shown' }).textContent).toBe('2005');
		expect(screen.getByRole('button', { name: 'Previous year' })).toHaveProperty('disabled', true);
		expect(screen.getByRole('button', { name: 'Next year' })).toHaveProperty('disabled', false);
	});

	it('draws no trend section under three years, and the table stands alone', async () => {
		answerWith(yearOverview({}, ['2025', '2026']));
		renderAnnual();

		await waitFor(() => screen.getByRole('table'));

		expect(screen.queryByRole('heading', { name: 'By year' })).toBeNull();
		expect(screen.queryByRole('heading', { name: 'Inspections' })).toBeNull();
	});
});
