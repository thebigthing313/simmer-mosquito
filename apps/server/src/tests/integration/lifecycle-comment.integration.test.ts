import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import { expect, it } from 'vitest';
import { insertLifecycleComment } from '../../lifecycle-comment.js';

/**
 * The comment four lifecycle commands are documented to record, against real
 * Postgres.
 *
 * A fake transaction would prove only that the helper was called with the object
 * it was called with. What is actually at stake here is what the database ends up
 * holding — a value written under the wrong `entity_type` is invisible to every
 * read that filters on the type, and looks identical to a comment that was never
 * written at all. Only a real insert and a real select can tell those apart.
 */
describeDbIntegration('lifecycle comments', () => {
	it('writes a service request comment under the snake_case entity type', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'resolution');
			const actor = await createProfile(db, org, 'Supervisor');
			const requestId = crypto.randomUUID();
			const commentId = crypto.randomUUID();

			await db.transaction().execute(async (trx) => {
				await insertLifecycleComment(trx, {
					commentId,
					organizationId: org,
					entityType: 'serviceRequest',
					entityId: requestId,
					commentText: 'No standing water found on site.',
					commentedAt: new Date('2026-08-04T15:30:00.000Z'),
					actorProfileId: actor,
				});
			});

			const row = await readComment(db, commentId);

			// The bridge is the whole point: the domain says `serviceRequest` and the
			// column holds `service_request`. Written the domain's way, the comment
			// exists but no reader filtering by type would ever see it.
			expect(row.entity_type).toBe('service_request');
			expect(row.entity_id).toBe(requestId);
			expect(row.comment_text).toBe('No standing water found on site.');
			expect(row.commented_at.toISOString()).toBe('2026-08-04T15:30:00.000Z');
			expect(row.is_pinned).toBe(false);
			expect(row.organization_id).toBe(org);
			expect(row.commented_by_profile_id).toBe(actor);
			expect(row.created_by_profile_id).toBe(actor);
		});
	});

	it('writes a mission comment, whose entity type the bridge leaves alone', async () => {
		// `mission` is identical on both sides of `toDbEntityType`, so it is the case
		// that stays green when the bridge is missing. Pinned beside the service
		// request so the pair is what proves the bridge, not either one alone.
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'cancellation');
			const actor = await createProfile(db, org, 'Manager');
			const missionId = crypto.randomUUID();
			const commentId = crypto.randomUUID();

			await db.transaction().execute(async (trx) => {
				await insertLifecycleComment(trx, {
					commentId,
					organizationId: org,
					entityType: 'mission',
					entityId: missionId,
					commentText: 'Truck down; rescheduling the block.',
					commentedAt: null,
					actorProfileId: actor,
				});
			});

			const row = await readComment(db, commentId);

			expect(row.entity_type).toBe('mission');
			expect(row.comment_text).toBe('Truck down; rescheduling the block.');
		});
	});

	it('takes the same clock as the lifecycle column it accompanies', async () => {
		// The claim the helper's docblock makes, and the one worth a database to
		// check. When the caller supplies no operational instant, the lifecycle write
		// stamps `now()` and the comment falls through to the column default — and
		// because Postgres `now()` is the transaction timestamp, not the statement's,
		// the two are equal to the microsecond rather than merely close.
		//
		// This is exactly what closing a service request could not do while
		// `closed_at` came from the browser: see issue #125, where telling a close
		// from an edit needed a two-minute tolerance because two clocks were involved.
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'oneclock');
			const actor = await createProfile(db, org, 'Supervisor');
			const commentId = crypto.randomUUID();

			const stamped = await db.transaction().execute(async (trx) => {
				await insertLifecycleComment(trx, {
					commentId,
					organizationId: org,
					entityType: 'serviceRequest',
					entityId: crypto.randomUUID(),
					commentText: 'Closed',
					commentedAt: null,
					actorProfileId: actor,
				});
				// Stands in for the `closed_at: sql`now()`` the close writes beside it.
				const row = await trx
					.selectNoFrom(sql<Date>`now()`.as('lifecycle_at'))
					.executeTakeFirstOrThrow();
				return row.lifecycle_at;
			});

			const row = await readComment(db, commentId);

			expect(row.commented_at.getTime()).toBe(stamped.getTime());
		});
	});

	it('refuses a second comment under an id already used', async () => {
		// The command carries a client-generated comment id, so a replayed offline
		// queue can present the same close twice. The primary key is what makes the
		// second one an error rather than a duplicate row on the feed.
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'replay');
			const actor = await createProfile(db, org, 'Supervisor');
			const commentId = crypto.randomUUID();
			const comment = {
				commentId,
				organizationId: org,
				entityType: 'serviceRequest' as const,
				entityId: crypto.randomUUID(),
				commentText: 'Closed',
				commentedAt: null,
				actorProfileId: actor,
			};

			await db.transaction().execute((trx) => insertLifecycleComment(trx, comment));

			await expect(
				db.transaction().execute((trx) => insertLifecycleComment(trx, comment)),
			).rejects.toThrow();
		});
	});
});

type Db = Kysely<SimmerDatabase>;

async function readComment(db: Db, commentId: string) {
	return db
		.selectFrom('comments')
		.select([
			'organization_id',
			'entity_type',
			'entity_id',
			'comment_text',
			'commented_at',
			'commented_by_profile_id',
			'is_pinned',
			'created_by_profile_id',
		])
		.where('id', '=', commentId)
		.executeTakeFirstOrThrow();
}

async function createOrganization(db: Db, slug: string): Promise<string> {
	const row = await db
		.insertInto('organizations')
		.values({ workos_organization_id: `workos_${slug}`, name: `${slug} District` })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createProfile(db: Db, organizationId: string, name: string): Promise<string> {
	const row = await db
		.insertInto('profiles')
		.values({ organization_id: organizationId, display_name: name })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
