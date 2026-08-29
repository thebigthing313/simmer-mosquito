/**
 * Every request this package makes, and what it does when the server refuses.
 *
 * Shape streams and command writes both carry the session cookie and nothing
 * else. Since #298 the routes behind them verify the session rather than
 * renewing it — a WorkOS refresh token is single use, and the browser runs too
 * many requests at once to let any of them spend it — so an access token that
 * ages out mid-session reaches this package as a 401. That is routine, and the
 * cure is to renew once through `/auth/me` and ask again.
 *
 * The renewal itself is the app's: only the app has an auth controller, and only
 * the app knows where to send a reader whose session is really gone. So an app
 * installs one {@link SessionRecovery} here at startup and every request in this
 * package answers a refusal the same way.
 *
 * One installed function rather than a per-collection option, because a session
 * is not a property of a collection. Fifty-four collections and every write
 * would each be carrying the same value, and the write paths would each have to
 * thread it down from wherever they were called.
 */

/**
 * Renew the session, and say whether there is one to go on with.
 *
 * `true` means a live session is in place and the refused request is worth
 * asking again. `false` means it is gone and the app has taken over.
 */
export type SessionRecovery = () => Promise<boolean>;

/**
 * One per app, and it has to stay one.
 *
 * Both front ends reach this module by two specifiers: the `./session-fetch`
 * subpath, where the recovery is installed, and the package barrel, which every
 * collection and most of the app's own fetches import `sessionFetch` from. Two
 * module instances would leave the barrel's copy at `null` and silently put the
 * bug back, with nothing failing.
 *
 * They resolve to one file, and both production builds were checked for it:
 * exactly one copy of this module per app, with the collection barrel still in
 * its own lazy chunk in `apps/admin`.
 *
 * To re-check after a bundler or package change, build an app and look for the
 * retry in the output: the pair `clone()` and a `status !== 401` test, in one
 * chunk only. Match on the pair rather than the status alone, because mapbox-gl
 * carries its own unrelated 401 check and will answer a looser search.
 */
let recoverSession: SessionRecovery | null = null;

/**
 * Install this app's renewal, once, before any collection is used.
 *
 * An app that installs none keeps the behaviour every client had before #298: a
 * refusal is handed back as it arrived, and a refused shape errors its
 * collection.
 */
export function setSessionRecovery(recovery: SessionRecovery | null): void {
	recoverSession = recovery;
}

/**
 * `fetch`, with one renewal and one retry on a refusal.
 *
 * **Once.** A second refusal is not an expiry, it is this caller being refused
 * this route, and asking again would be a loop against a server that has already
 * answered. The installed recovery is shared, so a screenful of collections
 * meeting the same expiry renew once between them rather than once each.
 *
 * **401 only.** A 403 is a decided answer about what this caller may do, and the
 * console's refusals are exactly that: `operator_required` and
 * `operator_not_configured` come back 403 from `/admin/*` and have their own
 * screens. Renewing on those would ask `/auth/me`, get the same refusal, read it
 * as a dead session, and bounce an operator to sign-in instead of explaining
 * what is wrong. An ended membership is a 403 too, and the route guard already
 * sends that reader to the front door on the next navigation.
 */
export const sessionFetch: typeof fetch = async (request, init) => {
	// Cloned before the first attempt, because a `Request` body can only be read
	// once and subset requests are POSTs carrying one. Retrying the spent object
	// throws rather than asking again, and a joined query would go quietly empty.
	const retryable = request instanceof Request ? request.clone() : request;

	const response = await fetch(request, init);
	if (recoverSession === null || response.status !== 401) {
		return response;
	}

	const recovered = await recoverSession();
	if (!recovered) {
		return response;
	}

	return fetch(retryable, init);
};
