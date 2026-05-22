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
