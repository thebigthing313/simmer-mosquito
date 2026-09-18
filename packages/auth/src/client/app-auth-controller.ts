import type { AuthMe } from './auth-me.js';

/**
 * The signed-in session as one value the router and the shell both read, so
 * `/auth/me` is fetched once per navigation rather than once per route guard.
 */
export interface AppAuthController {
	readonly snapshot: AuthMe | null;
	readonly load: () => Promise<AuthMe>;
	/** Ask now, unshared, for a caller that has just changed the session. */
	readonly refresh: () => Promise<AuthMe>;
	/** Ask, sharing one round trip with every other renewer in the same tick. */
	readonly renew: () => Promise<AuthMe>;
	/**
	 * Run a session-changing operation with no renewal overlapping it, since
	 * both spend the same single-use refresh token (#301). The operation must
	 * not call `renew`, `refresh` or anything that renews on a 401: the lock
	 * is not reentrant and the operation would wait on itself.
	 */
	readonly exchange: <T>(operation: () => Promise<T>) => Promise<T>;
	readonly subscribe: (listener: () => void) => () => void;
}
