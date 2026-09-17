/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// What a refused search says. The palette shows `error.message` and nothing
// else, so the sentence the server sent is the whole screen; #929 is why it is
// read through `refusalSentence` rather than through a fourth copy of the rule.

/** The next answer every read gets, so a case can set the refusal it is about. */
let answer: Response = new Response('{}', { status: 500 });

vi.mock('@simmer-mosquito/sync', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
	sessionFetch: () => Promise.resolve(answer),
}));

const { useGlobalSearch } = await import('../../../../components/search/use-global-search');

function wrapper({ children }: { readonly children: ReactNode }) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function messageFor(body: unknown, status: number): Promise<string> {
	answer = new Response(JSON.stringify(body), { status });
	const { result } = renderHook(() => useGlobalSearch({ query: 'aedes', limit: 10 }), { wrapper });
	await waitFor(() => expect(result.current.error).not.toBeNull());
	return result.current.error?.message ?? '';
}

describe('a refused search', () => {
	it("states the server's own sentence", async () => {
		expect(
			await messageFor({ error: 'invalid_query', reason: 'That query is too short.' }, 400),
		).toBe('That query is too short.');
	});

	it('states the status when the sentence is only whitespace', async () => {
		expect(await messageFor({ error: 'invalid_query', reason: '   ' }, 400)).toBe(
			'Search failed (400).',
		);
	});

	it('states the status when the body has nothing to say', async () => {
		expect(await messageFor({ error: 'invalid_query' }, 400)).toBe('Search failed (400).');
	});
});
