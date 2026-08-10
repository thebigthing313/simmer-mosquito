import { describe, expect, it } from 'vitest';
import { deriveServiceRequestEvents } from '../../../../routes/public-engagement/-overview-data';

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
 * Timestamps are written the way Electric streams them, because the fold
 * compares them as strings.
 */
const SINCE = '2026-08-01 00:00:00+00';

function request(overrides: Partial<FeedRequestFixture> = {}): FeedRequestFixture {
	return {
		id: 'request-1',
		createdAt: '2026-08-03 09:00:00.100+00',
		closedAt: null,
		createdByProfileId: 'profile-intake',
		closedByProfileId: null,
		...overrides,
	};
}

interface FeedRequestFixture {
	readonly id: string;
	readonly createdAt: string;
	readonly closedAt: string | null;
	readonly createdByProfileId: string | null;
	readonly closedByProfileId: string | null;
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
					closedAt: '2026-08-05 11:00:00.000+00',
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
		const events = deriveServiceRequestEvents(
			[request({ closedAt: '2026-08-02 00:00:00.000+00' })],
			[],
			SINCE,
		);

		expect(kindsOf(events)).toEqual(['created', 'closed']);
		expect(events[1]?.at).toBe('2026-08-02 00:00:00.000+00');
	});

	it('carries a comment with its author and body', () => {
		const events = deriveServiceRequestEvents(
			[request()],
			[
				{
					id: 'comment-1',
					entityId: 'request-1',
					commentedAt: '2026-08-06 08:15:00.000+00',
					commentText: 'Called back; no standing water found.',
					commentedByProfileId: 'profile-tech',
				},
			],
			SINCE,
		);

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
			[
				{
					id: 'comment-1',
					entityId: 'request-elsewhere',
					commentedAt: '2026-08-06 08:15:00.000+00',
					commentText: 'Orphaned.',
					commentedByProfileId: null,
				},
			],
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
					createdAt: '2026-07-20 09:00:00.000+00',
					closedAt: '2026-08-04 09:00:00.000+00',
					closedByProfileId: 'profile-super',
				}),
			],
			[],
			SINCE,
		);

		expect(kindsOf(events)).toEqual(['closed']);
	});

	it('orders every kind together, newest first', () => {
		const events = deriveServiceRequestEvents(
			[
				request({ id: 'request-1', createdAt: '2026-08-02 09:00:00.000+00' }),
				request({
					id: 'request-2',
					createdAt: '2026-08-03 09:00:00.000+00',
					closedAt: '2026-08-05 17:00:00.000+00',
				}),
			],
			[
				{
					id: 'comment-1',
					entityId: 'request-1',
					commentedAt: '2026-08-06 08:15:00.000+00',
					commentText: 'Latest.',
					commentedByProfileId: null,
				},
			],
			SINCE,
		);

		expect(kindsOf(events)).toEqual(['commented', 'closed', 'created', 'created']);
		expect(events.map((event) => event.at)).toEqual([
			'2026-08-06 08:15:00.000+00',
			'2026-08-05 17:00:00.000+00',
			'2026-08-03 09:00:00.000+00',
			'2026-08-02 09:00:00.000+00',
		]);
	});
});
