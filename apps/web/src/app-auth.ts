import { type AuthMe, getAuthMe } from './auth';

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
		const answer = await getAuthMe();
		snapshot = answer;
		return answer;
	} catch (error) {
		/*
		 * Could not ask, which is not the same as being told no.
		 *
		 * `getAuthMe` already draws that line — a 401 carries
		 * `authenticated: false` and is returned, and only an unreadable response
		 * throws — so reaching here means the round trip broke, not that the
		 * session did. Caching a refusal for it *latched*: `load()` short-circuits
		 * on any non-null snapshot, so one failed request signed the user out for
		 * the life of the page while every later `/auth/me` answered 200 and went
		 * unread.
		 *
		 * So leave the snapshot alone. A known session survives a blip and the
		 * next guard retries; with nothing known yet, answer "no" for this caller
		 * without recording it.
		 */
		return (
			snapshot ?? {
				authenticated: false,
				reason: error instanceof Error ? error.message : 'Unable to load auth state.',
			}
		);
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
