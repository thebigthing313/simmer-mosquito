import { type AuthMe, getAuthMe } from './api';

/**
 * The operator session, as one module-level value the router and the shell both
 * read.
 *
 * Same shape as `apps/web`'s controller and for the same reason: `/auth/me` is a
 * network round trip, route `beforeLoad` guards run before any component does,
 * and several of them run per navigation. A shared snapshot with a single
 * in-flight promise means the session is fetched once, not once per guard.
 */
export interface AppAuthController {
	readonly snapshot: AuthMe | null;
	readonly load: () => Promise<AuthMe>;
	readonly refresh: () => Promise<AuthMe>;
	readonly subscribe: (listener: () => void) => () => void;
}

let snapshot: AuthMe | null = null;
let pending: Promise<AuthMe> | null = null;
const listeners = new Set<() => void>();

export const appAuthController: AppAuthController = {
	get snapshot() {
		return snapshot;
	},
	load,
	refresh,
	subscribe(listener) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
};

function load(): Promise<AuthMe> {
	if (snapshot !== null) {
		return Promise.resolve(snapshot);
	}

	if (pending === null) {
		pending = refresh();
	}

	return pending;
}

async function refresh(): Promise<AuthMe> {
	try {
		const nextSnapshot = await getAuthMe().catch(
			(error): AuthMe => ({
				authenticated: false,
				reason: error instanceof Error ? error.message : 'Unable to load auth state.',
			}),
		);
		snapshot = nextSnapshot;
		return nextSnapshot;
	} finally {
		pending = null;
		emit();
	}
}

function emit(): void {
	for (const listener of listeners) {
		listener();
	}
}
