/**
 * Every request this package makes: what carries its credential, and what it
 * does when the server refuses.
 *
 * **Both are the app's, and neither is this package's.** Shape streams and
 * command writes are every read and every write a client makes, and how a
 * credential travels on them is a fact about the host rather than about the
 * table. The two browser apps hold the sealed session in an httpOnly cookie;
 * `apps/mobile` holds the same session in the device keystore, sends it as a
 * bearer, and reads each rotation back out of a response header (ADR 0016).
 * Writing either one here as a literal is what would keep the other out.
 *
 * Since #298 the routes behind those requests verify the session rather than
 * renewing it — a WorkOS refresh token is single use, and the browser runs too
 * many requests at once to let any of them spend it — so an access token that
 * ages out mid-session reaches this package as a 401. That is routine, and the
 * cure is to renew once through `/auth/me` and ask again. The renewal is the
 * app's too: only the app has an auth controller, and only the app knows where
 * to send a reader whose session is really gone.
 *
 * So an app installs one {@link SessionFetcher} and one {@link SessionRecovery}
 * here at startup, and every request in this package is sent and recovered the
 * same way.
 *
 * Installed functions rather than per-collection options, because neither is a
 * property of a collection. Fifty-four collections and every write would each be
 * carrying the same two values, and the write paths would each have to thread
 * them down from wherever they were called.
 */

/**
 * Renew the session, and say whether there is one to go on with.
 *
 * `true` means a live session is in place and the refused request is worth
 * asking again. `false` means it is gone and the app has taken over.
 */
export type SessionRecovery = () => Promise<boolean>;

/**
 * Send a request with this app's credential on it.
 *
 * `fetch`'s own shape, so an app installs whichever of the two transports it
 * has: a cookie one from `@simmer-mosquito/auth/browser`, or the `fetch` member
 * of a token client, which attaches the bearer and keeps every rotation.
 */
export type SessionFetcher = typeof fetch;

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
 * One per app, for the same reason the recovery above is, and installed in the
 * same place.
 */
let sendWithSession: SessionFetcher | null = null;

/**
 * Install this app's transport, once, before any collection is used.
 *
 * An app that installs none is refused rather than defaulted (#694). Until #695
 * the fallback was bare `fetch` and thirty call sites carried a
 * `credentials: 'include'` of their own through it, so a host that forgot this
 * still authenticated. Those are gone, so the fallback now omits the cookie
 * cross-origin on every read and every write, and an app whose requests are all
 * refused draws as empty rather than as broken. There is no credential this
 * package could guess in its place: a browser holds a cookie and `apps/mobile`
 * holds a bearer, and picking either would be wrong for the other host.
 *
 * The unreachable half of the same rule is `pnpm check:session-fetcher`, which
 * refuses an app that imports the collection barrel and calls this nowhere.
 * This one catches an installer that exists and has not run yet; that one
 * catches an app with none to run.
 */
export function setSessionFetcher(fetcher: SessionFetcher | null): void {
	sendWithSession = fetcher;
}

/**
 * What a request does when no app installed a transport: nothing, loudly.
 *
 * Thrown at the send rather than checked at import, because there is no moment
 * in this package that is startup. An app loads the module, installs its
 * transport, and only then builds a collection, so the first request is the
 * earliest point at which "none was installed" is an answer rather than a race.
 */
const refuseWithoutFetcher: SessionFetcher = () => {
	throw new Error(
		'No session fetcher installed. Every shape stream and every command write in ' +
			'@simmer-mosquito/sync carries the host session through the transport an app installs ' +
			'with setSessionFetcher, and this app installed none. Install one at module scope, ' +
			'before any collection is used: cookieFetch from @simmer-mosquito/auth/browser for a ' +
			'browser app, or the fetch member of the token client for a device holding the session ' +
			'in a keystore.',
	);
};

/**
 * The app's transport, with one renewal and one retry on a refusal.
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
 *
 * **Both attempts go through the installed fetcher**, and there is nothing else
 * for either to go through. A send with no transport installed throws here
 * rather than falling back to bare `fetch`, which would carry no credential at
 * all: on the first attempt that is an app reading as empty, and on a retry it
 * is a renewal that looks like it worked over a request that never had a
 * chance.
 *
 * **A caller passes no `credentials`.** The installed fetcher answers that, and
 * a call site restating it is either inert or wrong: `cookieFetch` forces
 * `credentials: 'include'` over whatever `init` said, and a token host has no
 * cookie to include at all. Thirty call sites wrote it anyway and were swept
 * (#695). The one that stays is `use-mapbox-map.ts`, because Mapbox GL fetches
 * its own tiles and never reaches this function.
 */
export const sessionFetch: typeof fetch = async (request, init) => {
	const send = sendWithSession ?? refuseWithoutFetcher;

	// Cloned before the first attempt, because a `Request` body can only be read
	// once and subset requests are POSTs carrying one. Retrying the spent object
	// throws rather than asking again, and a joined query would go quietly empty.
	const retryable = request instanceof Request ? request.clone() : request;

	const response = await send(request, init);
	if (recoverSession === null || response.status !== 401) {
		return response;
	}

	const recovered = await recoverSession();
	if (!recovered) {
		return response;
	}

	return send(retryable, init);
};
