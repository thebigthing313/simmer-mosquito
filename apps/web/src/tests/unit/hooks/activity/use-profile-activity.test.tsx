/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// The read itself, not the arranging: whether moving the day keeps the log that
// is already on screen. The person and the day are both in the query key, so
// without `keepPreviousData` react-query has no data for the new key and the
// panel reports itself empty for as long as the read takes, which is how a
// reader watched a full log blank under them.

/** Every pending read, so a test can answer them one at a time. */
const pending: ((response: Response) => void)[] = [];

vi.mock('@simmer-mosquito/sync', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
	sessionFetch: () =>
		new Promise((resolve) => {
			pending.push(resolve);
		}),
}));

/** Answer the oldest pending read with a log. */
function answer(items: readonly unknown[]): void {
	pending.shift()?.({
		ok: true,
		json: () => Promise.resolve({ items, total: items.length, truncated: false }),
	} as Response);
}

/** Answer the oldest pending read with a refusal, body and all. */
function refuse(status: number, body: unknown): void {
	pending.shift()?.(new Response(JSON.stringify(body), { status }));
}

const { useProfileActivity } = await import('../../../../hooks/activity/use-profile-activity');

function wrapper({ children }: { readonly children: ReactNode }) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProfileActivity', () => {
	it('keeps the log on screen while a new day loads', async () => {
		const { result, rerender } = renderHook(
			(input: { profileId: string; dateFrom: string; dateTo: string }) => useProfileActivity(input),
			{
				wrapper,
				initialProps: { profileId: 'p-1', dateFrom: '2026-08-01', dateTo: '2026-08-01' },
			},
		);

		answer([{ id: 'first-log' }]);
		await waitFor(() => expect(result.current.data?.items).toHaveLength(1));

		rerender({ profileId: 'p-1', dateFrom: '2026-08-02', dateTo: '2026-08-02' });
		await waitFor(() => expect(result.current.isFetching).toBe(true));

		// The second read is still out. The first day's log is what is on screen,
		// and `isLoading` is false, so nothing above this reports a first load.
		expect(result.current.data?.items).toHaveLength(1);
		expect(result.current.isLoading).toBe(false);

		answer([{ id: 'second-log' }, { id: 'and-another' }]);
		await waitFor(() => expect(result.current.data?.items).toHaveLength(2));
	});
});

/**
 * What a refused read says. The panel shows `error.message`, so the sentence
 * the server sent is the whole screen, and #929 is why it is read through
 * `refusalSentence` rather than through a copy of the rule sitting beside a
 * byte-for-byte twin in the search hook.
 */
describe('a refused activity read', () => {
	async function messageFor(status: number, body: unknown): Promise<string> {
		const { result } = renderHook(
			() => useProfileActivity({ profileId: 'p-1', dateFrom: '2026-08-01', dateTo: '2026-08-01' }),
			{ wrapper },
		);

		await waitFor(() => expect(pending).toHaveLength(1));
		refuse(status, body);
		await waitFor(() => expect(result.current.error).not.toBeNull());
		return result.current.error?.message ?? '';
	}

	it("states the server's own sentence", async () => {
		expect(
			await messageFor(400, { error: 'invalid_range', reason: 'That range is too wide.' }),
		).toBe('That range is too wide.');
	});

	it('states the status when the sentence is only whitespace', async () => {
		expect(await messageFor(400, { error: 'invalid_range', reason: '   ' })).toBe(
			'Activity request failed (400).',
		);
	});

	it('states the status when the body has nothing to say', async () => {
		expect(await messageFor(400, { error: 'invalid_range' })).toBe(
			'Activity request failed (400).',
		);
	});
});
