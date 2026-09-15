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

import { type ReactNode, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/**
 * Tell every mounted `useSearch` and `useParams` that what they read has
 * changed, the way a navigation would.
 *
 * A suite that changes the search between renders and re-renders the root is
 * not enough on its own: the compiled route component hands its page the same
 * props, React skips the page, and the hook inside it is never called again.
 * The real router's hooks subscribe to its store, so this stand-in subscribes
 * to this, and a suite calls it inside `act` after changing what `search` or
 * `params` answers.
 */
export function notifyRouterStandIn(): void {
	for (const listener of listeners) {
		listener();
	}
}

/**
 * The router, reduced to what a route module needs to mount outside one: the
 * search and the path params a match would carry, a navigation that goes
 * nowhere, and a `Link` that is an anchor. `search` and `params` are read as a
 * store snapshot, so each must answer the same object until it changes, and a
 * suite that changes one calls {@link notifyRouterStandIn}. `params` defaults
 * to none, which is every route under a static path.
 */
export function routerStandIn<TActual extends object>(
	actual: TActual,
	search: () => Record<string, unknown>,
	params: () => Record<string, string> = () => ({}),
): TActual {
	const useSearch = () => useSyncExternalStore(subscribe, search);
	const useParams = () => useSyncExternalStore(subscribe, params);
	return {
		...actual,
		createFileRoute: () => (options: Record<string, unknown>) => ({
			...options,
			options,
			useSearch,
			useParams,
		}),
		useSearch,
		useParams,
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
