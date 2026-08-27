import { describe, expect, it } from 'vitest';
import {
	deriveServiceRequestEvents,
	type FeedComment,
	type FeedRequest,
} from '../../../../hooks/queries/use-service-request-feed';

/**
 * The activity feed lists only what the schema records: an open, a close, and a
 * comment. Edits are not a kind — see the note on `useServiceRequestFeed` for
 * why inferring them from `updatedAt` was abandoned.
 *
 * What is left to get wrong is the fold itself: which side of the window an
 * event falls on, a comment the page cannot resolve to a request, and the order
 * the three kinds interleave in. Each is a way the feed could be wrong without
 * the screen showing it.
 *
 * Every timestamp is a `Date`, because that is what the row schema parses a
 * `timestamptz` into. The fold used to compare these as text against a
 * wire-format string, which is why the bound below is an instant too: a `Date`
 * compared with `>=` against `'2026-08-01 00:00:00+00'` stringifies to
 * `'Sat Aug 01 2026…'` and loses to it every time, which would empty the feed
 * without erroring.
 */
const SINCE = new Date('2026-08-01T00:00:00Z');

function request(overrides: Partial<FeedRequest> = {}): FeedRequest {
	return {
		id: 'request-1',
		createdAt: new Date('2026-08-03T09:00:00.100Z'),
		closedAt: null,
		createdByProfileId: 'profile-intake',
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

function kindsOf(events: readonly { readonly kind: string }[]): readonly string[] {
	return events.map((event) => event.kind);
}

describe('deriveServiceRequestEvents', () => {
	it('reads an open request as opened once, whatever else has been written to it', () => {
		const events = deriveServiceRequestEvents([request()], [], SINCE);

		expect(kindsOf(events)).toEqual(['created']);
		expect(events[0]?.actorProfileId).toBe('profile-intake');
	});

	it('lists a close beside its open, attributed to whoever closed it', () => {
		const events = deriveServiceRequestEvents(
			[
				request({
					closedAt: new Date('2026-08-05T11:00:00Z'),
					closedByProfileId: 'profile-super',
				}),
			],
			[],
			SINCE,
		);

		expect(kindsOf(events)).toEqual(['closed', 'created']);
		expect(events[0]?.actorProfileId).toBe('profile-super');
	});

	it('lists a back-dated close once, at the date it is recorded as having happened', () => {
		// The close command takes an operator-supplied closedAt, so a request closed
		// today can be recorded as closed last Tuesday. That instant is what the feed
		// carries, and it is the only row the close produces.
		const closedAt = new Date('2026-08-02T00:00:00Z');
		const events = deriveServiceRequestEvents([request({ closedAt })], [], SINCE);

		expect(kindsOf(events)).toEqual(['created', 'closed']);
		expect(events[1]?.at.toISOString()).toBe(closedAt.toISOString());
	});

	it('carries a comment with its author and body', () => {
		const events = deriveServiceRequestEvents([request()], [comment()], SINCE);

		expect(kindsOf(events)).toEqual(['commented', 'created']);
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
		);

		expect(kindsOf(events)).toEqual(['created']);
	});

	it('excludes events older than the window but keeps the rest of their request', () => {
		// A request opened before the window and closed inside it belongs on the feed
		// as a close, not as nothing and not as an open it is too late to report.
		const events = deriveServiceRequestEvents(
			[
				request({
					createdAt: new Date('2026-07-20T09:00:00Z'),
					closedAt: new Date('2026-08-04T09:00:00Z'),
					closedByProfileId: 'profile-super',
				}),
			],
			[],
			SINCE,
		);

		expect(kindsOf(events)).toEqual(['closed']);
	});

	it('keeps an event that lands exactly on the window boundary', () => {
		// `>=`, not `>`. The bound is the first instant of the day the window opens,
		// so a request opened at midnight belongs to it.
		const events = deriveServiceRequestEvents([request({ createdAt: SINCE })], [], SINCE);

		expect(kindsOf(events)).toEqual(['created']);
	});

	it('orders every kind together, newest first', () => {
		const events = deriveServiceRequestEvents(
			[
				request({ id: 'request-1', createdAt: new Date('2026-08-02T09:00:00Z') }),
				request({
					id: 'request-2',
					createdAt: new Date('2026-08-03T09:00:00Z'),
					closedAt: new Date('2026-08-05T17:00:00Z'),
				}),
			],
			[comment({ entityId: 'request-1', commentText: 'Latest.' })],
			SINCE,
		);

		expect(kindsOf(events)).toEqual(['commented', 'closed', 'created', 'created']);
		expect(events.map((event) => event.at.toISOString())).toEqual([
			'2026-08-06T08:15:00.000Z',
			'2026-08-05T17:00:00.000Z',
			'2026-08-03T09:00:00.000Z',
			'2026-08-02T09:00:00.000Z',
		]);
	});
});
