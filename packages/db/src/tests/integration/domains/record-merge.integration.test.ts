import { expect, it } from 'vitest';
import {
	applyRecordMerge,
	type Kysely,
	RecordMergeRefusedError,
	type SimmerDatabase,
	sql,
} from '../../../index.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';
import {
	createAddress,
	createCollectionMethod,
	createComment,
	createContact,
	createHabitat,
	createMission,
	createNotificationRegistration,
	createNotificationType,
	createOrganization,
	createRoute,
	createRouteItem,
	createServiceRequest,
	createTag,
	createTagItem,
	createTrap,
	createMissionNotification as insertMissionNotification,
} from '../../../test-support/row-fixtures.js';

/**
 * The merge policy against real tables.
 *
 * The unit test holds the registry against the delete registry, which catches a
 * missing table. It cannot catch a rule that names the right table and writes
 * the wrong thing, and it cannot catch the dedupe at all. That one is a window
 * function over a partial unique index, and either it keeps exactly one row per
 * key or the merge dies on a constraint violation halfway through.
 *
 * So these are the SQL questions: does a re-pointed row keep everything except
 * the reference, does a duplicated association collapse to the target's copy,
 * and does the merge refuse a set of rows it should not touch.
 */
describeDbIntegration('record merge policy', () => {
	it('re-points every reference to an address and leaves the rows otherwise alone', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const target = await createAddress(db, org, { display_name: 'Depot' });
			const source = await createAddress(db, org, { display_name: 'Depot (dup)' });
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId, { address_id: source });
			const habitatId = await createHabitat(db, org, { address_id: source, habitat_name: 'Ditch' });
			await createComment(db, org, { entityType: 'address', entityId: source });

			const before = await db
				.selectFrom('traps')
				.select(['trap_name', 'collection_method_id'])
				.where('id', '=', trapId)
				.executeTakeFirstOrThrow();

			const impact = await db.transaction().execute((trx) =>
				applyRecordMerge(trx, {
					recordType: 'address',
					targetId: target,
					sourceIds: [source],
					organizationId: org,
					actorProfileId: null,
				}),
			);

			// What the write says it did, which is the only report of it now that the
			// separate count is gone. A rule that names the right table and moves
			// nothing reads as a merge that worked.
			expect(entry(impact.moves, 'addressTraps')).toBe(1);
			expect(entry(impact.moves, 'addressHabitats')).toBe(1);
			expect(entry(impact.moves, 'addressComments')).toBe(1);

			// The reference moved and nothing else did. An operational row keeps its
			// own name, its method and, the one the domain doc is explicit about, its
			// own geometry, because the address it was standing at is a label rather
			// than the place the work happened.
			const trap = await db
				.selectFrom('traps')
				.select(['address_id', 'trap_name', 'collection_method_id', 'deleted_at'])
				.where('id', '=', trapId)
				.executeTakeFirstOrThrow();
			expect(trap.address_id).toBe(target);
			expect(trap.trap_name).toBe(before.trap_name);
			expect(trap.collection_method_id).toBe(before.collection_method_id);
			expect(trap.deleted_at).toBeNull();

			const habitat = await db
				.selectFrom('habitats')
				.select(['address_id'])
				.where('id', '=', habitatId)
				.executeTakeFirstOrThrow();
			expect(habitat.address_id).toBe(target);

			expect(await liveCommentCount(db, 'address', source)).toBe(0);
			expect(await liveCommentCount(db, 'address', target)).toBe(1);
		});
	});

	/**
	 * The dedupe, which is the half no type checks.
	 *
	 * `tag_items_tag_entity_unique` is `(tag_id, entity_type, entity_id) where
	 * deleted_at is null`. A merge rewrites `entity_id` to one value, so two
	 * habitats carrying the same tag collide on it. Without the dedupe the whole
	 * transaction dies on a constraint violation partway through a merge somebody
	 * was waiting on.
	 */
	it('collapses a tag both habitats carried, and keeps the one already on the target', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const target = await createHabitat(db, org, { habitat_name: 'Keep' });
			const source = await createHabitat(db, org, { habitat_name: 'Fold' });
			const shared = await createTag(db, org, { tag_name: 'Standing water' });
			const sourceOnly = await createTag(db, org, { tag_name: 'Roadside' });

			const targetTag = await createTagItem(db, org, {
				tagId: shared,
				entityType: 'habitat',
				entityId: target,
			});
			await createTagItem(db, org, { tagId: shared, entityType: 'habitat', entityId: source });
			const movingTag = await createTagItem(db, org, {
				tagId: sourceOnly,
				entityType: 'habitat',
				entityId: source,
			});

			await db.transaction().execute(async (trx) => {
				await applyRecordMerge(trx, {
					recordType: 'habitat',
					targetId: target,
					sourceIds: [source],
					organizationId: org,
					actorProfileId: null,
				});
			});

			// One live row per tag on the target, and the shared one is the row that
			// was already there rather than the source's copy.
			const live = await db
				.selectFrom('tag_items')
				.select(['id', 'tag_id'])
				.where('entity_type', '=', 'habitat')
				.where('entity_id', '=', target)
				.where('deleted_at', 'is', null)
				.execute();
			expect(live).toHaveLength(2);
			expect(live.map((row) => row.id).sort()).toEqual([targetTag, movingTag].sort());
			expect(new Set(live.map((row) => row.tag_id))).toEqual(new Set([shared, sourceOnly]));
		});
	});

	/**
	 * Two sources carrying the same tag the target does not have.
	 *
	 * The `exists`-against-the-target reading of this problem gets it wrong:
	 * neither source duplicates the target, so both move, and the target ends up
	 * with the tag twice. The rule has to rank across the target *and* every
	 * source at once, which is why it is a window function rather than a subquery.
	 */
	it('collapses a tag two sources shared when the target had none', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const target = await createHabitat(db, org, { habitat_name: 'Keep' });
			const first = await createHabitat(db, org, { habitat_name: 'Fold A' });
			const second = await createHabitat(db, org, { habitat_name: 'Fold B' });
			const shared = await createTag(db, org, { tag_name: 'Standing water' });

			await createTagItem(db, org, { tagId: shared, entityType: 'habitat', entityId: first });
			await createTagItem(db, org, { tagId: shared, entityType: 'habitat', entityId: second });

			await db.transaction().execute(async (trx) => {
				await applyRecordMerge(trx, {
					recordType: 'habitat',
					targetId: target,
					sourceIds: [first, second],
					organizationId: org,
					actorProfileId: null,
				});
			});

			const live = await db
				.selectFrom('tag_items')
				.select(['id'])
				.where('entity_type', '=', 'habitat')
				.where('entity_id', '=', target)
				.where('deleted_at', 'is', null)
				.execute();
			expect(live).toHaveLength(1);
		});
	});

	/**
	 * Route stops, where the surviving row is load-bearing beyond the reference.
	 *
	 * `docs/larval-surveillance-domain.md`: keep the existing target item, preserve
	 * its position, soft-delete the duplicate source item. Position and directions
	 * are what a crew actually drives, so keeping the source's row instead would
	 * silently reorder somebody's morning.
	 */
	it('keeps the route stop the target already had, with its position and directions', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const target = await createHabitat(db, org, { habitat_name: 'Keep' });
			const source = await createHabitat(db, org, { habitat_name: 'Fold' });
			const shared = await createRoute(db, org, { route_name: 'Monday north' });
			const sourceOnly = await createRoute(db, org, { route_name: 'Tuesday south' });

			const targetStop = await createRouteItem(
				db,
				org,
				{ routeId: shared, entityType: 'habitat', entityId: target },
				{ position: 1, directions_to_next_item: 'Left at the mill' },
			);
			const duplicate = await createRouteItem(
				db,
				org,
				{ routeId: shared, entityType: 'habitat', entityId: source },
				{ position: 7, directions_to_next_item: 'Nowhere' },
			);
			const movingStop = await createRouteItem(
				db,
				org,
				{ routeId: sourceOnly, entityType: 'habitat', entityId: source },
				{ position: 3, directions_to_next_item: 'Past the bridge' },
			);

			await db.transaction().execute(async (trx) => {
				await applyRecordMerge(trx, {
					recordType: 'habitat',
					targetId: target,
					sourceIds: [source],
					organizationId: org,
					actorProfileId: null,
				});
			});

			const kept = await db
				.selectFrom('route_items')
				.select(['position', 'directions_to_next_item', 'deleted_at'])
				.where('id', '=', targetStop)
				.executeTakeFirstOrThrow();
			expect(kept.deleted_at).toBeNull();
			expect(kept.position).toBe(1);
			expect(kept.directions_to_next_item).toBe('Left at the mill');

			const retired = await db
				.selectFrom('route_items')
				.select(['deleted_at'])
				.where('id', '=', duplicate)
				.executeTakeFirstOrThrow();
			expect(retired.deleted_at).not.toBeNull();

			// The stop on the route the target was not on moves across, keeping its
			// own position and directions.
			const moved = await db
				.selectFrom('route_items')
				.select(['entity_id', 'position', 'directions_to_next_item', 'deleted_at'])
				.where('id', '=', movingStop)
				.executeTakeFirstOrThrow();
			expect(moved.entity_id).toBe(target);
			expect(moved.position).toBe(3);
			expect(moved.directions_to_next_item).toBe('Past the bridge');
			expect(moved.deleted_at).toBeNull();
		});
	});

	/**
	 * The regression this engine was written for.
	 *
	 * `publicEngagement.mergeContacts` shipped as the soft deletes alone. It
	 * retired the source contacts and re-pointed nothing, so every service request
	 * and notification registration that named one was left pointing at a row that
	 * resolves nowhere: no error, no constraint, the contact simply gone from every
	 * surface that filters `deleted_at`.
	 *
	 * The `mission_notifications` half is the other direction. Those rows record
	 * who was told about a mission and how they were reached, so a merge leaves
	 * them exactly as they were sent.
	 */
	it('re-points requests and registrations, and never the notifications already sent', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const target = await createContact(db, org, { contact_name: 'Sam Rivera' });
			const source = await createContact(db, org, { contact_name: 'S. Rivera' });
			const addressId = await createAddress(db, org, { display_name: 'Depot' });
			const requestId = await createServiceRequest(db, org, { addressId, contactId: source });
			const registrationId = await createNotificationRegistration(db, org, source);
			const notificationId = await createMissionNotification(db, org, source, registrationId);
			await createComment(db, org, { entityType: 'contact', entityId: source });

			await db.transaction().execute(async (trx) => {
				await applyRecordMerge(trx, {
					recordType: 'contact',
					targetId: target,
					sourceIds: [source],
					organizationId: org,
					actorProfileId: null,
				});
			});

			const request = await db
				.selectFrom('service_requests')
				.select(['contact_id'])
				.where('id', '=', requestId)
				.executeTakeFirstOrThrow();
			expect(request.contact_id).toBe(target);

			const registration = await db
				.selectFrom('notification_registrations')
				.select(['contact_id'])
				.where('id', '=', registrationId)
				.executeTakeFirstOrThrow();
			expect(registration.contact_id).toBe(target);

			expect(await liveCommentCount(db, 'contact', source)).toBe(0);
			expect(await liveCommentCount(db, 'contact', target)).toBe(1);

			// Still the contact it was sent to.
			const notification = await db
				.selectFrom('mission_notifications')
				.select(['contact_id'])
				.where('id', '=', notificationId)
				.executeTakeFirstOrThrow();
			expect(notification.contact_id).toBe(source);
		});
	});

	it('refuses a source that belongs to another organization, without saying so', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const other = await createOrganization(db);
			const target = await createAddress(db, org, { display_name: 'Depot' });
			const foreign = await createAddress(db, other, { display_name: 'Their depot' });

			// Reported as missing rather than forbidden: a distinct answer would let
			// one organization probe for another organization's ids.
			await expect(
				db.transaction().execute(async (trx) =>
					applyRecordMerge(trx, {
						recordType: 'address',
						targetId: target,
						sourceIds: [foreign],
						organizationId: org,
						actorProfileId: null,
					}),
				),
			).rejects.toMatchObject({
				name: 'RecordMergeRefusedError',
				reason: 'source_not_found',
			});
		});
	});

	it('refuses to merge into a retired habitat', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const target = await createHabitat(db, org, { habitat_name: 'Retired' });
			const source = await createHabitat(db, org, { habitat_name: 'Fold' });
			await db.updateTable('habitats').set({ is_active: false }).where('id', '=', target).execute();

			await expect(
				db.transaction().execute(async (trx) =>
					applyRecordMerge(trx, {
						recordType: 'habitat',
						targetId: target,
						sourceIds: [source],
						organizationId: org,
						actorProfileId: null,
					}),
				),
			).rejects.toBeInstanceOf(RecordMergeRefusedError);
		});
	});

	it('leaves identical rows in a neighbouring organization untouched', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const other = await createOrganization(db);
			const target = await createAddress(db, org, { display_name: 'Depot' });
			const source = await createAddress(db, org, { display_name: 'Depot (dup)' });
			const theirAddress = await createAddress(db, other, { display_name: 'Depot' });
			const theirMethodId = await createCollectionMethod(db, other);
			const theirTrap = await createTrap(db, other, theirMethodId, {
				address_id: theirAddress,
			});

			await db.transaction().execute(async (trx) => {
				await applyRecordMerge(trx, {
					recordType: 'address',
					targetId: target,
					sourceIds: [source],
					organizationId: org,
					actorProfileId: null,
				});
			});

			const trap = await db
				.selectFrom('traps')
				.select(['address_id'])
				.where('id', '=', theirTrap)
				.executeTakeFirstOrThrow();
			expect(trap.address_id).toBe(theirAddress);
		});
	});
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Db = Kysely<SimmerDatabase>;

function entry(
	entries: readonly { readonly key: string; readonly moved: number }[],
	key: string,
): number {
	return entries.find((candidate) => candidate.key === key)?.moved ?? 0;
}

async function liveCommentCount(db: Db, entityType: string, entityId: string): Promise<number> {
	const rows = await db
		.selectFrom('comments')
		.select(['id'])
		.where('entity_type', '=', entityType)
		.where('entity_id', '=', entityId)
		.where('deleted_at', 'is', null)
		.execute();
	return rows.length;
}

/**
 * A mission notification, with the mission and the type it needs.
 *
 * The two parents are here rather than at the call site because the merge cases
 * care only that a notification points at the source contact.
 */
async function createMissionNotification(
	db: Db,
	organizationId: string,
	contactId: string,
	registrationId: string,
): Promise<string> {
	const notificationTypeId = await createNotificationType(db, organizationId);
	const missionId = await createMission(db, organizationId, {
		scheduled_start_at: sql`now() + interval '1 day'`,
		notification_type_id: notificationTypeId,
	});
	return insertMissionNotification(
		db,
		organizationId,
		{ missionId, registrationId, contactId, notificationTypeId },
		{ destination: 'sam@example.test' },
	);
}
