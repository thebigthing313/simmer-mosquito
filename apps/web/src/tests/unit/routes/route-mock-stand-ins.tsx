/**
 * What a route suite's `vi.mock` factories hand back for the router and the
 * transport, in a module that imports nothing of the app.
 *
 * That last clause is the reason this is not part of `explorer-route-harness.tsx`.
 * A mock factory runs while the module it replaces is being resolved, and the
 * harness imports `use-map-extent-fit`, which imports `@simmer-mosquito/sync`:
 * a `sync` factory that awaited the harness would wait on itself, and the file
 * would sit until the watchdog in `vitest.shared.ts` named it (#663). React is
 * the one import, for the anchor `Link` becomes.
 */

import type { ReactNode } from 'react';

/**
 * The router, reduced to what a route module needs to mount outside one: the
 * search a match would carry, a navigation that goes nowhere, and a `Link` that
 * is an anchor. `search` is read on every call, so a suite may change it
 * between renders.
 */
export function routerStandIn<TActual extends object>(
	actual: TActual,
	search: () => Record<string, unknown>,
): TActual {
	return {
		...actual,
		createFileRoute: () => (options: Record<string, unknown>) => ({
			...options,
			options,
			useSearch: search,
		}),
		useSearch: search,
		useNavigate: () => async () => undefined,
		Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
	};
}

/**
 * A `sessionFetch` that records every URL it is handed and answers each with
 * the body `answer` builds for it, as a 200. The server under a route suite is
 * this function, so what a rail lists is what `answer` says the box holds.
 */
export function sessionFetchStandIn(
	sent: URL[],
	answer: (url: URL) => unknown,
): (input: URL | string) => Promise<Response> {
	return (input) => {
		const url = input instanceof URL ? input : new URL(input);
		sent.push(url);
		const body = answer(url);
		return Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve(body),
		} as Response);
	};
}
