/**
 * What a mutation hook dispatched, per write surface.
 *
 * Not a suite. The suites beside it are grouped by surface because `vi.mock`
 * hoists per file, so each one declares its own stub block: somewhere to record
 * what `mutateCollection` was handed, and an API that answers.
 *
 * ## Two seams, because there are two write paths
 *
 * `mutateCollection` dispatches to a collection and posts nothing, so it is
 * replaced outright and the assertion reads the object it was handed. That is
 * the intent, the changed columns, the location source, the context and the
 * acknowledgements, which is everything the hook decided.
 *
 * `commandTransaction` posts. Replacing it would assert the handoff and leave
 * the request untested, so it runs for real and `fetch` is stubbed instead: the
 * assertion reads the url, the method and the body that actually went out.
 * `writeThroughRest` and the hooks that call `sessionFetch` directly are the
 * same, since both go through the global.
 *
 * ## Where the collections come from
 *
 * `installMemoryCollections` in `tests/unit/lib/collections`, one call per
 * suite, which replaced a `vi.mock` block per table. They are ordinary TanStack
 * DB collections, because the transaction path only sends when the library
 * recorded a mutation: a collection stubbed as `{}` posts nothing, and every
 * assertion would then be about a request nobody made.
 */

import { renderHook } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { getServerUrl } from '../../../../auth';
import { useAcknowledgedWrite } from '../../../../components/acknowledged-write';

/** What a hook handed `mutateCollection`, and which collection it named. */
export interface DispatchedWrite {
	readonly collection: unknown;
	readonly write: Record<string, unknown>;
}

/** One request the stubbed API received. */
export interface SentRequest {
	readonly url: string;
	readonly method: string;
	readonly body: Record<string, unknown>;
}

const dispatched: DispatchedWrite[] = [];
const sent: SentRequest[] = [];

/**
 * Stand in for `mutateCollection`, recording the call.
 *
 * Returns the shape `settleWrite` awaits, already resolved: nothing under test
 * reads a result back, and a write that never settles would hang every test in
 * the file rather than fail one.
 */
export function recordDispatch(
	collection: unknown,
	write: unknown,
): { readonly isPersisted: { readonly promise: Promise<unknown> } } {
	dispatched.push({ collection, write: write as Record<string, unknown> });
	return { isPersisted: { promise: Promise.resolve() } };
}

/** Everything dispatched since the last {@link resetDispatches}, in order. */
export function dispatches(): readonly DispatchedWrite[] {
	return dispatched;
}

/** The most recent write, which is what a single-write test asserts on. */
export function lastWrite(): Record<string, unknown> {
	const write = dispatched.at(-1)?.write;
	expect(write, 'no write was dispatched').toBeDefined();
	return write as Record<string, unknown>;
}

/**
 * The commands the most recent write named, always as a list.
 *
 * `mutateCollection` takes one name or several and normalizes both to a list, so
 * a test should not have to know which spelling a hook happened to use.
 */
export function lastIntents(): readonly string[] {
	const intent = lastWrite().intent;
	return typeof intent === 'string' ? [intent] : (intent as readonly string[]);
}

/** The columns the most recent write moved. */
export function lastChanges(): Record<string, unknown> {
	return (lastWrite().changes ?? {}) as Record<string, unknown>;
}

/**
 * The row the most recent write carried.
 *
 * The insert half of {@link lastChanges}. A create states a whole row rather
 * than a patch, and that is where an optimistic centroid and the organization
 * id land.
 */
export function lastRow(): Record<string, unknown> {
	return (lastWrite().row ?? {}) as Record<string, unknown>;
}

/** Every request the stubbed API received since the last reset, in order. */
export function requests(): readonly SentRequest[] {
	return sent;
}

/** The most recent request, for the surfaces that post rather than dispatch. */
export function lastRequest(): SentRequest {
	const request = sent.at(-1);
	expect(request, 'no request was sent').toBeDefined();
	return request as SentRequest;
}

/** Where a command against `table` is posted, with the row in the path when it has one. */
export function commandUrl(table: string, key?: string): string {
	const endpoint = `${getServerUrl()}/commands/${table}`;
	return key === undefined ? endpoint : `${endpoint}/${key}`;
}

/**
 * Forget every write and request.
 *
 * Called from a `beforeEach`, so each test asserts on its own write and a test
 * that dispatched nothing fails rather than reading the previous one's.
 */
export function resetDispatches(): void {
	dispatched.length = 0;
	sent.length = 0;
}

/**
 * An API that accepts everything and records what it was asked.
 *
 * `txid` is what the command routes answer with, and the write paths read it to
 * decide whether anything committed. A response without one is treated as a
 * failure, so it is always sent.
 */
export function stubApi(txid = 4242): void {
	answerWith(200, { txid });
}

/**
 * An API that refuses, so a caller's reading of a refusal can be asserted.
 *
 * `body` is what the route answered with. A 2xx carrying no `txid` counts as a
 * refusal on the REST path, which is the case worth covering: the row moved on
 * screen and nowhere else.
 */
export function stubApiRefusal(status: number, body: Record<string, unknown> = {}): void {
	answerWith(status, body);
}

/** Record every request and answer each one the same way. */
function answerWith(status: number, body: Record<string, unknown>): void {
	vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
		sent.push({
			url: String(url),
			method: init.method ?? 'GET',
			body:
				init.body === undefined ? {} : (JSON.parse(String(init.body)) as Record<string, unknown>),
		});
		return Promise.resolve(new Response(JSON.stringify(body), { status }));
	});
}

/**
 * One attempt with nothing answered, which is what a page's first Save sends.
 *
 * `acknowledged()` on the server reads an absent flag as confirmed, so a guard
 * only fires for a client that sends `false` on purpose. A surface that opts in
 * with `ask: true` and then forgets a flag passes every guard and nobody finds
 * out, because the write succeeds. This is what each surface asserts against.
 */
export function firstAttempt(
	askable: Readonly<Record<string, string>>,
	write: (acknowledgements: Readonly<Record<string, boolean>>) => Promise<void>,
): Promise<void> {
	const { result } = renderHook(() => useAcknowledgedWrite({ askable, ask: true }));
	return result.current.run(write);
}
