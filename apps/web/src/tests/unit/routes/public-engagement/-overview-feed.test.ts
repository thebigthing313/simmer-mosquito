import { describe, expect, it } from 'vitest';
import { deriveServiceRequestEvents } from '../../../../routes/public-engagement/-overview-data';

/**
 * The activity feed's `edited` rows are inferred, not recorded — nothing in the
 * schema logs an edit, so the fold reads three timestamps and decides. Each rule
 * below is one way that inference can be wrong in a way the screen would not
 * show: a feed claiming an edit nobody made, or silently swallowing one.
 *
 * Timestamps are written the way Electric streams them, because the fold
 * compares them as strings.
 */
const SINCE = '2026-08-01 00:00:00+00';

function request(overrides: Partial<FeedRequestFixture> = {}): FeedRequestFixture {
	return {
		id: 'request-1',
		createdAt: '2026-08-03 09:00:00.100+00',
		updatedAt: '2026-08-03 09:00:00.100+00',
		closedAt: null,
		createdByProfileId: 'profile-intake',
		updatedByProfileId: 'profile-intake',
		closedByProfileId: null,
		...overrides,
	};
}

interface FeedRequestFixture {
	readonly id: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly closedAt: string | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly closedByProfileId: string | null;
}

function kindsOf(events: readonly { readonly kind: string }[]): readonly string[] {
	return events.map((event) => event.kind);
}

describe('deriveServiceRequestEvents', () => {
	it('reads an untouched request as opened once, not opened and edited', () => {
		// The insert stamps created_at and updated_at from one transaction clock, so
		// they are identical on a row nobody has written to since.
		const events = deriveServiceRequestEvents([request()], [], SINCE);

		expect(kindsOf(events)).toEqual(['created']);
	});

	it('reads a later write as an edit, attributed to whoever made it', () => {
		const events = deriveServiceRequestEvents(
			[request({ updatedAt: '2026-08-04 14:30:00.000+00', updatedByProfileId: 'profile-tech' })],
			[],
			SINCE,
		);

		expect(kindsOf(events)).toEqual(['edited', 'created']);
		expect(events[0]?.actorProfileId).toBe('profile-tech');
	});

	it('does not report a close as an edit as well', () => {
		const closedAt = '2026-08-05 11:00:00.000+00';
		const events = deriveServiceRequestEvents(
			[request({ closedAt, updatedAt: closedAt, closedByProfileId: 'profile-super' })],
			[],
			SINCE,
		);

		expect(kindsOf(events)).toEqual(['closed', 'created']);
	});

	it('still reads one close when the two clocks behind it disagree', () => {
		// This is the ordinary path, not an edge case: closing writes closedAt from
		// the browser and updatedAt from Postgres, so the two are never equal. An
		// exact comparison here would put a phantom edit beside every close.
		const events = deriveServiceRequestEvents(
			[
				request({
					closedAt: '2026-08-05T11:00:00.412Z',
					updatedAt: '2026-08-05 11:00:01.907+00',
					closedByProfileId: 'profile-super',
				}),
			],
			[],
			SINCE,
		);

		expect(kindsOf(events)).toEqual(['closed', 'created']);
	});

	it('reads a write well after a close as a real edit', () => {
		const events = deriveServiceRequestEvents(
			[
				request({
					closedAt: '2026-08-05 11:00:00.000+00',
					updatedAt: '2026-08-05 15:20:00.000+00',
					closedByProfileId: 'profile-super',
					updatedByProfileId: 'profile-tech',
				}),
			],
			[],
			SINCE,
		);

		expect(kindsOf(events)).toEqual(['edited', 'closed', 'created']);
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
		const events = deriveServiceRequestEvents(
			[
				request({
					createdAt: '2026-07-20 09:00:00.000+00',
					updatedAt: '2026-08-04 09:00:00.000+00',
				}),
			],
			[],
			SINCE,
		);

		expect(kindsOf(events)).toEqual(['edited']);
	});

	it('orders every kind together, newest first', () => {
		const events = deriveServiceRequestEvents(
			[
				request({
					id: 'request-1',
					createdAt: '2026-08-02 09:00:00.000+00',
					updatedAt: '2026-08-02 09:00:00.000+00',
				}),
				request({
					id: 'request-2',
					createdAt: '2026-08-03 09:00:00.000+00',
					updatedAt: '2026-08-03 09:00:00.000+00',
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

		expect(events.map((event) => event.at)).toEqual([
			'2026-08-06 08:15:00.000+00',
			'2026-08-03 09:00:00.000+00',
			'2026-08-02 09:00:00.000+00',
		]);
	});

	it('reads a back-dated close as both a close and an edit', () => {
		// Known limit, pinned so it is a decision rather than a surprise: the close
		// command accepts an operator-supplied closedAt, and a close recorded as
		// having happened days ago cannot be told from an edit made today. The
		// schema records no more than this.
		const events = deriveServiceRequestEvents(
			[
				request({
					closedAt: '2026-08-02 00:00:00.000+00',
					updatedAt: '2026-08-05 16:42:00.000+00',
				}),
			],
			[],
			SINCE,
		);

		expect(kindsOf(events)).toEqual(['edited', 'created', 'closed']);
	});
});
