/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// The read itself, not the arranging: whether changing the person or the window
// keeps the log that is already on screen. The person and both dates are in the
// query key, so without `keepPreviousData` react-query has no data for the new
// key and the panel reports itself empty for as long as the read takes — which
// is the one surface where a reader watched a full log blank under them.

/** Every pending read, so a test can answer them one at a time. */
const pending: ((items: readonly unknown[]) => void)[] = [];

vi.mock('@simmer-mosquito/sync', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
	sessionFetch: () =>
		new Promise((resolve) => {
			pending.push((items) =>
				resolve({
					ok: true,
					json: () => Promise.resolve({ items, total: items.length, truncated: false }),
				} as Response),
			);
		}),
}));

const { useProfileActivity } = await import('../../../routes/-activity-monitor-data');

function wrapper({ children }: { readonly children: ReactNode }) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProfileActivity', () => {
	it('keeps the log on screen while a new person or window loads', async () => {
		const { result, rerender } = renderHook(
			(input: { profileId: string; dateFrom: string; dateTo: string }) => useProfileActivity(input),
			{
				wrapper,
				initialProps: { profileId: 'p-1', dateFrom: '2026-08-01', dateTo: '2026-08-01' },
			},
		);

		pending.shift()?.([{ id: 'first-log' }]);
		await waitFor(() => expect(result.current.data?.items).toHaveLength(1));

		rerender({ profileId: 'p-2', dateFrom: '2026-08-01', dateTo: '2026-08-01' });
		await waitFor(() => expect(result.current.isFetching).toBe(true));

		// The second read is still out. The first person's log is what is on screen,
		// and `isLoading` is false, so nothing above this reports a first load.
		expect(result.current.data?.items).toHaveLength(1);
		expect(result.current.isLoading).toBe(false);

		pending.shift()?.([{ id: 'second-log' }, { id: 'and-another' }]);
		await waitFor(() => expect(result.current.data?.items).toHaveLength(2));
	});
});
