import { describe, expect, it } from 'vitest';
import {
	deriveServiceRequestEvents,
	type FeedComment,
	type FeedRequest,
} from '../../../../hooks/queries/use-service-request-feed';

/**
 * The activity feed lists only what the schema records: a receipt, a close, and
 * a comment. Edits are not a kind; see the note on `useServiceRequestFeed` for
 * why inferring them from `updatedAt` was abandoned.
 *
 * What is left to get wrong is the fold itself: which side of the window an
 * event falls on, a comment the page cannot resolve to a request, and the order
 * the three kinds interleave in. Each is a way the feed could be wrong without
 * the screen showing it.
 *
 * A receipt is a day and the other two are instants. The day is the request
 * date, which `CONTEXT.md` names as the day a Service Request counts on; when
 * the row was written is not a domain date, and the fold never reads it (#1263).
 */
const SINCE = '2026-08-01';
const ZONE = 'UTC';

function request(overrides: Partial<FeedRequest> = {}): FeedRequest {
	return {
		id: 'request-1',
		requestDate: '2026-08-03',
		receivedByProfileId: 'profile-intake',
		closedAt: null,
		closedByProfileId: null,
		...overrides,
	};
}

function comment(overrides: Partial<FeedComment> = {}): FeedComment {
	return {
		id: 'comment-1',
		entityId: 'request-1',
		commentedAt: new Date('2026-08-06T08:15:00Z'),
		commentText: 'Called back; no standing water found.',
		commentedByProfileId: 'profile-tech',
		...overrides,
	};
}

/**
 * A request row as the overview actually holds it, with the profile that entered
 * it and the instant it was written. The fold's own type names neither, so these
 * cases prove it reads past both rather than that it cannot see them.
 */
function writtenRequest(
	createdAt: Date,
	overrides: Partial<FeedRequest> = {},
): FeedRequest & { readonly createdAt: Date; readonly createdByProfileId: string } {
	return { ...request(overrides), createdAt, createdByProfileId: 'profile-clerk' };
}

function kindsOf(events: readonly { readonly kind: string }[]): readonly string[] {
	return events.map((event) => event.kind);
}

describe('deriveServiceRequestEvents', () => {
	it('reads an open request as received once, on its request date', () => {
		const events = deriveServiceRequestEvents([request()], [], SINCE, ZONE);

		expect(kindsOf(events)).toEqual(['received']);
		expect(events[0]?.actorProfileId).toBe('profile-intake');
		expect(events[0]?.day).toBe('2026-08-03');
	});

	it('credits Received by rather than the profile that entered the row', () => {
		const events = deriveServiceRequestEvents(
			[writtenRequest(new Date('2026-08-03T14:00:00Z'))],
			[],
			SINCE,
			ZONE,
		);

		expect(events[0]?.actorProfileId).toBe('profile-intake');
	});

	it('leaves the actor empty when nobody is recorded as receiving the request', () => {
		const events = deriveServiceRequestEvents(
			[writtenRequest(new Date('2026-08-03T14:00:00Z'), { receivedByProfileId: null })],
			[],
			SINCE,
			ZONE,
		);

		expect(kindsOf(events)).toEqual(['received']);
		expect(events[0]?.actorProfileId).toBeNull();
	});

	it('keeps a request dated inside the window whose row was written before it', () => {
		const events = deriveServiceRequestEvents(
			[writtenRequest(new Date('2026-07-10T09:00:00Z'), { requestDate: '2026-08-01' })],
			[],
			SINCE,
			ZONE,
		);

		expect(kindsOf(events)).toEqual(['received']);
		expect(events[0]?.day).toBe('2026-08-01');
	});

	it('drops a request dated before the window whose row was written inside it', () => {
		const events = deriveServiceRequestEvents(
			[writtenRequest(new Date('2026-08-05T09:00:00Z'), { requestDate: '2026-07-31' })],
			[],
			SINCE,
			ZONE,
		);

		expect(events).toEqual([]);
	});

	it('reads the window in the Organization time zone', () => {
		// A close at 02:00 UTC on 1 August is still 31 July in Chicago, so a window
		// opening on 1 August there does not reach it, while the receipt dated the
		// first is inside. Comments are windowed by the query rather than the fold.
		const events = deriveServiceRequestEvents(
			[request({ requestDate: '2026-08-01', closedAt: new Date('2026-08-01T02:00:00Z') })],
			[],
			SINCE,
			'America/Chicago',
		);

		expect(kindsOf(events)).toEqual(['received']);
		expect(events[0]?.day).toBe('2026-08-01');
	});

	it('dates a comment by the day it fell on in the Organization time zone', () => {
		const events = deriveServiceRequestEvents(
			[request()],
			[comment({ commentedAt: new Date('2026-08-06T02:00:00Z') })],
			SINCE,
			'Pacific/Honolulu',
		);

		expect(events[0]?.kind).toBe('commented');
		expect(events[0]?.day).toBe('2026-08-05');
	});

	it('lists a close beside its receipt, attributed to whoever closed it', () => {
		const events = deriveServiceRequestEvents(
			[
				request({
					closedAt: new Date('2026-08-05T11:00:00Z'),
					closedByProfileId: 'profile-super',
				}),
			],
			[],
			SINCE,
			ZONE,
		);

		expect(kindsOf(events)).toEqual(['closed', 'received']);
		expect(events[0]?.actorProfileId).toBe('profile-super');
	});

	it('lists a back-dated close once, at the date it is recorded as having happened', () => {
		// The close command takes an operator-supplied closedAt, so a request closed
		// today can be recorded as closed last Tuesday. That instant is what the feed
		// carries, and it is the only row the close produces.
		const closedAt = new Date('2026-08-02T00:00:00Z');
		const events = deriveServiceRequestEvents([request({ closedAt })], [], SINCE, ZONE);

		expect(kindsOf(events)).toEqual(['received', 'closed']);
		expect(events[1]?.at.toISOString()).toBe(closedAt.toISOString());
	});

	it('carries a comment with its author and body', () => {
		const events = deriveServiceRequestEvents([request()], [comment()], SINCE, ZONE);

		expect(kindsOf(events)).toEqual(['commented', 'received']);
		expect(events[0]?.text).toBe('Called back; no standing water found.');
		expect(events[0]?.requestId).toBe('request-1');
	});

	it('drops a comment whose request is not in the loaded set', () => {
		// The comments subset is scoped by entity type, so it can carry a comment on
		// a request this page never loaded. Rendering it would name a request the
		// feed cannot resolve.
		const events = deriveServiceRequestEvents(
			[request()],
			[comment({ entityId: 'request-elsewhere', commentText: 'Orphaned.' })],
			SINCE,
			ZONE,
		);

		expect(kindsOf(events)).toEqual(['received']);
	});

	it('excludes events older than the window but keeps the rest of their request', () => {
		// A request received before the window and closed inside it belongs on the
		// feed as a close, not as nothing and not as a receipt too late to report.
		const events = deriveServiceRequestEvents(
			[
				request({
					requestDate: '2026-07-20',
					closedAt: new Date('2026-08-04T09:00:00Z'),
					closedByProfileId: 'profile-super',
				}),
			],
			[],
			SINCE,
			ZONE,
		);

		expect(kindsOf(events)).toEqual(['closed']);
	});

	it('keeps a close that lands exactly on the window boundary', () => {
		// `>=`, not `>`. The bound is the first instant of the day the window opens.
		const events = deriveServiceRequestEvents(
			[request({ requestDate: '2026-07-20', closedAt: new Date('2026-08-01T00:00:00Z') })],
			[],
			SINCE,
			ZONE,
		);

		expect(kindsOf(events)).toEqual(['closed']);
	});

	it('sorts a receipt below a close and a comment from the same day', () => {
		// A request date has no time of day, so the receipt sits at the start of it,
		// and a comment at that very instant still reads above it.
		const events = deriveServiceRequestEvents(
			[request({ requestDate: '2026-08-04', closedAt: new Date('2026-08-04T16:00:00Z') })],
			[comment({ commentedAt: new Date('2026-08-04T00:00:00Z') })],
			SINCE,
			ZONE,
		);

		expect(kindsOf(events)).toEqual(['closed', 'commented', 'received']);
		expect(events.map((event) => event.day)).toEqual(['2026-08-04', '2026-08-04', '2026-08-04']);
	});

	it('orders every kind together, newest first', () => {
		const events = deriveServiceRequestEvents(
			[
				request({ id: 'request-1', requestDate: '2026-08-02' }),
				request({
					id: 'request-2',
					requestDate: '2026-08-03',
					closedAt: new Date('2026-08-05T17:00:00Z'),
				}),
			],
			[comment({ entityId: 'request-1', commentText: 'Latest.' })],
			SINCE,
			ZONE,
		);

		expect(kindsOf(events)).toEqual(['commented', 'closed', 'received', 'received']);
		expect(events.map((event) => event.day)).toEqual([
			'2026-08-06',
			'2026-08-05',
			'2026-08-03',
			'2026-08-02',
		]);
	});
});
