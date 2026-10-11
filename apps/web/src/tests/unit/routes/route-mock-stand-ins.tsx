/**
 * What a route suite's `vi.mock` factories hand back for the router and the
 * transport, in a module that imports nothing of the app.
 *
 * That last clause is the reason this is not part of `explorer-route-harness.tsx`.
 * A mock factory runs while the module it replaces is being resolved, and the
 * harness imports `use-map-extent-fit`, which imports `@simmer-mosquito/sync`:
 * a `sync` factory that awaited the harness would wait on itself, and the file
 * would sit until the watchdog in `vitest.shared.ts` named it (#663). React is
 * a runtime import, for the anchor `Link` becomes, and so is Testing Library's
 * `act`, which a navigation that writes the search back notifies inside;
 * neither imports the app. `AuthenticatedMe` and `SimmerRole` are types and
 * are erased.
 */

import type { SimmerRole } from '@simmer-mosquito/domain';
import { act } from '@testing-library/react';
import { type ReactNode, useSyncExternalStore } from 'react';
import type { AuthenticatedMe } from '../../../auth';

const listeners = new Set<() => void>();

/**
 * A signed-in snapshot for the route context and the auth store, whose actor
 * Profile is there or is not. `organizationId` is what `useOrganizationWorkspace`
 * looks the Organization up by, so a suite seeds an organization row under it.
 */
export function signedInSnapshot(
	organizationId: string,
	profileId: string | null,
): AuthenticatedMe {
	return {
		authenticated: true,
		user: {
			workosUserId: 'workos-user-1',
			email: 'field@example.test',
			firstName: 'Field',
			lastName: 'Lead',
			displayName: 'Field Lead',
			emailVerified: true,
			profilePictureUrl: null,
		},
		workosOrganizationId: 'workos-organization-1',
		localIdentity: {
			userId: 'user-1',
			organizationId,
			organizationName: 'Test Mosquito Control',
			organizationSlug: 'test-mosquito-control',
			profileId,
			membershipId: 'membership-1',
			role: 'admin',
		},
	};
}

/**
 * {@link signedInSnapshot} with the Membership's role set, for a suite gating
 * on a role floor. The role is the domain's vocabulary rather than a string,
 * so a suite cannot sign in as a role the ladder does not have.
 */
export function signedInSnapshotAs(
	role: SimmerRole,
	organizationId = 'org-1',
	profileId: string | null = 'profile-1',
): AuthenticatedMe {
	return signedInSnapshotWith({ localIdentity: { role, organizationId, profileId } });
}

/**
 * What a suite may vary on the shared snapshot: any field of the Account or of
 * the local identity. Each is optional, so a call site names only what its
 * cases read and the rest is {@link signedInSnapshot}'s.
 */
export interface SnapshotOverrides {
	readonly user?: Partial<AuthenticatedMe['user']>;
	readonly localIdentity?: Partial<AuthenticatedMe['localIdentity']>;
}

/**
 * {@link signedInSnapshot} with the given fields written over it, for a suite
 * whose cases read a field the two builders above do not take: an email the
 * page draws, or a role the ladder has not got. The role is a string here on
 * purpose, because `readOrgRole`'s fallback is what a suite reaches for this
 * to test, and {@link signedInSnapshotAs} refuses a role outside the ladder.
 */
export function signedInSnapshotWith(overrides: SnapshotOverrides): AuthenticatedMe {
	const snapshot = signedInSnapshot('org-1', 'profile-1');
	return {
		...snapshot,
		user: { ...snapshot.user, ...overrides.user },
		localIdentity: { ...snapshot.localIdentity, ...overrides.localIdentity },
	};
}

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
 * What the stand-in `Link` reads off its props. `to` is a string here rather
 * than the router's path union, because the stand-in never checks it against
 * the tree; `tsc` does that at the call site, and `link-destinations.test.tsx`
 * checks that the path resolves.
 */
interface LinkStandInProps {
	readonly children?: ReactNode;
	readonly to?: string;
	readonly params?: Readonly<Record<string, string>>;
	readonly search?: unknown;
}

/**
 * The `to` template with each `$param` segment replaced by the param of that
 * name. A segment `params` does not name stays as written, so a suite that
 * forgot the id reads `$id` in its assertion rather than an empty segment.
 * `search` is not serialised: the real router's search, index and
 * trailing-slash rules are `link-destinations.test.tsx`'s, and a case that
 * needs any of them goes there.
 */
function substitutedHref(to: string, params: Readonly<Record<string, string>>): string {
	return to.replace(
		/\$([A-Za-z0-9_]+)/g,
		(segment: string, name: string) => params[name] ?? segment,
	);
}

/**
 * What a page hands the stand-in's navigation: the next search, as an updater
 * over the current one or as the whole object, and the router's own `to` and
 * `replace`, which the stand-in takes and does not read.
 */
interface NavigateStandInOptions {
	readonly search?:
		| Record<string, unknown>
		| ((previous: Record<string, unknown>) => Record<string, unknown>);
	readonly replace?: boolean;
	readonly to?: string;
}

/**
 * What a suite may ask of {@link routerStandIn} beyond the search and params.
 * `setSearch` is where a navigation writes the next search. Passing it is
 * what makes the navigation go somewhere: the suite stores the value where its
 * `search` getter reads it, and every mounted `useSearch` is told.
 */
interface RouterStandInOptions {
	readonly setSearch?: (next: Record<string, unknown>) => void;
}

/**
 * What {@link routerStandIn} writes over the real module, named so a suite of
 * the stand-in itself can reach `Link` and `useNavigate` without a cast.
 */
interface RouterStandIn {
	readonly createFileRoute: () => (options: Record<string, unknown>) => Record<string, unknown>;
	readonly useSearch: () => Record<string, unknown>;
	readonly useParams: () => Record<string, string>;
	readonly useNavigate: () => (options?: NavigateStandInOptions) => Promise<undefined>;
	readonly Link: (props: LinkStandInProps) => ReactNode;
}

/**
 * The search a navigation leads to: the updater applied to the current search,
 * the object as given, or the current search when the navigation names none.
 */
function nextSearch(
	current: Record<string, unknown>,
	search: NavigateStandInOptions['search'],
): Record<string, unknown> {
	if (typeof search === 'function') {
		return search(current);
	}
	return search ?? current;
}

/**
 * The router, reduced to what a route module needs to mount outside one: the
 * search and the path params a match would carry, a navigation, and a `Link`
 * that is an anchor whose `href` is `to` with the params written in (#1147),
 * so a route suite pins which id a link carries without importing the route
 * tree. `search` and `params` are read as a store snapshot, so each must
 * answer the same object until it changes, and a suite that changes one
 * calls {@link notifyRouterStandIn}. `params` defaults to none, which is
 * every route under a static path.
 *
 * The navigation goes nowhere unless `options.setSearch` is passed. With it,
 * a navigation hands `setSearch` the search it leads to and notifies the
 * mounted hooks inside `act`, so a page whose state lives in the URL reads its
 * own write back (#1482).
 */
export function routerStandIn<TActual extends object>(
	actual: TActual,
	search: () => Record<string, unknown>,
	params: () => Record<string, string> = () => ({}),
	options: RouterStandInOptions = {},
): TActual & RouterStandIn {
	const useSearch = () => useSyncExternalStore(subscribe, search);
	const useParams = () => useSyncExternalStore(subscribe, params);
	const { setSearch } = options;
	const navigate = async (navigation: NavigateStandInOptions = {}): Promise<undefined> => {
		if (setSearch) {
			setSearch(nextSearch(search(), navigation.search));
			act(() => notifyRouterStandIn());
		}
		return undefined;
	};
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
		useNavigate: () => navigate,
		Link: ({
			children,
			to = '',
			params: linkParams = {},
			search: _search,
			...rest
		}: LinkStandInProps) => (
			<a href={substitutedHref(to, linkParams)} {...rest}>
				{children}
			</a>
		),
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
