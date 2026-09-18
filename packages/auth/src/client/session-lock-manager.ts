/**
 * The Web Lock every tab of one origin takes before rotating the sealed
 * session. Per origin, so it covers several tabs of one app and not the console
 * and the workspace held at once (ADR 0011).
 */
export const SESSION_LOCK_NAME = 'simmer.session-rotation';

/**
 * The one method this package reads off the Web Locks API, written out because
 * it compiles without the DOM library.
 */
export interface SessionLockManager {
	request<T>(
		name: string,
		options: { readonly signal: AbortSignal },
		operation: () => Promise<T>,
	): Promise<T>;
}
