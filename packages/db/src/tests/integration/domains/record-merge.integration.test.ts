import { expect, it } from 'vitest';
import {
	applyRecordMerge,
	type Kysely,
	RecordMergeRefusedError,
	type SimmerDatabase,
	sql,
} from '../../../index.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';

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
			const org = await createOrganization(db, 'address_merge');
			const target = await createAddress(db, org, 'Depot');
			const source = await createAddress(db, org, 'Depot (dup)');
			const trapId = await createTrap(db, org, source);
			const habitatId = await createHabitat(db, org, source, 'Ditch');
			await createComment(db, org, 'address', source);

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
			const org = await createOrganization(db, 'habitat_tag_merge');
			const target = await createHabitat(db, org, null, 'Keep');
			const source = await createHabitat(db, org, null, 'Fold');
			const shared = await createTag(db, org, 'Standing water');
			const sourceOnly = await createTag(db, org, 'Roadside');

			const targetTag = await createTagItem(db, org, shared, 'habitat', target);
			await createTagItem(db, org, shared, 'habitat', source);
			const movingTag = await createTagItem(db, org, sourceOnly, 'habitat', source);

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
			const org = await createOrganization(db, 'habitat_two_sources');
			const target = await createHabitat(db, org, null, 'Keep');
			const first = await createHabitat(db, org, null, 'Fold A');
			const second = await createHabitat(db, org, null, 'Fold B');
			const shared = await createTag(db, org, 'Standing water');

			await createTagItem(db, org, shared, 'habitat', first);
			await createTagItem(db, org, shared, 'habitat', second);

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
			const org = await createOrganization(db, 'habitat_route_merge');
			const target = await createHabitat(db, org, null, 'Keep');
			const source = await createHabitat(db, org, null, 'Fold');
			const shared = await createRoute(db, org, 'Monday north');
			const sourceOnly = await createRoute(db, org, 'Tuesday south');

			const targetStop = await createRouteItem(db, org, shared, target, 1, 'Left at the mill');
			const duplicate = await createRouteItem(db, org, shared, source, 7, 'Nowhere');
			const movingStop = await createRouteItem(db, org, sourceOnly, source, 3, 'Past the bridge');

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
			const org = await createOrganization(db, 'contact_merge');
			const target = await createContact(db, org, 'Sam Rivera');
			const source = await createContact(db, org, 'S. Rivera');
			const addressId = await createAddress(db, org, 'Depot');
			const requestId = await createServiceRequest(db, org, source, addressId);
			const registrationId = await createNotificationRegistration(db, org, source);
			const notificationId = await createMissionNotification(db, org, source, registrationId);
			await createComment(db, org, 'contact', source);

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

	it('refuses a source that belongs to another agency, without saying so', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'merge_owner');
			const other = await createOrganization(db, 'merge_other');
			const target = await createAddress(db, org, 'Depot');
			const foreign = await createAddress(db, other, 'Their depot');

			// Reported as missing rather than forbidden: a distinct answer would let
			// one agency probe for another agency's ids.
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
			const org = await createOrganization(db, 'merge_inactive');
			const target = await createHabitat(db, org, null, 'Retired');
			const source = await createHabitat(db, org, null, 'Fold');
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

	it('leaves identical rows in a neighbouring agency untouched', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'merge_scope');
			const other = await createOrganization(db, 'merge_scope_other');
			const target = await createAddress(db, org, 'Depot');
			const source = await createAddress(db, org, 'Depot (dup)');
			const theirAddress = await createAddress(db, other, 'Depot');
			const theirTrap = await createTrap(db, other, theirAddress);

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

async function createOrganization(db: Db, slug: string): Promise<string> {
	const row = await db
		.insertInto('organizations')
		.values({ workos_organization_id: `workos_${slug}`, name: `${slug} District` })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createAddress(db: Db, organizationId: string, displayName: string): Promise<string> {
	const row = await db
		.insertInto('addresses')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			display_name: displayName,
			country: 'US',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createHabitat(
	db: Db,
	organizationId: string,
	addressId: string | null,
	habitatName: string,
): Promise<string> {
	const row = await db
		.insertInto('habitats')
		.values({
			organization_id: organizationId,
			address_id: addressId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			habitat_name: habitatName,
			description: 'Roadside ditch',
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createTrap(db: Db, organizationId: string, addressId: string): Promise<string> {
	const method = await db
		.insertInto('collection_methods')
		.values({ organization_id: organizationId, name: 'CDC light trap' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('traps')
		.values({
			organization_id: organizationId,
			collection_method_id: method.id,
			address_id: addressId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			trap_name: 'North gate',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createComment(
	db: Db,
	organizationId: string,
	entityType: string,
	entityId: string,
): Promise<string> {
	const row = await db
		.insertInto('comments')
		.values({
			organization_id: organizationId,
			entity_type: entityType,
			entity_id: entityId,
			comment_text: 'Note',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createTag(db: Db, organizationId: string, tagName: string): Promise<string> {
	const row = await db
		.insertInto('tags')
		.values({ organization_id: organizationId, tag_name: tagName })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createTagItem(
	db: Db,
	organizationId: string,
	tagId: string,
	entityType: string,
	entityId: string,
): Promise<string> {
	const row = await db
		.insertInto('tag_items')
		.values({
			organization_id: organizationId,
			tag_id: tagId,
			entity_type: entityType,
			entity_id: entityId,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createRoute(db: Db, organizationId: string, routeName: string): Promise<string> {
	const row = await db
		.insertInto('routes')
		.values({ organization_id: organizationId, route_name: routeName, route_type: 'habitat' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createRouteItem(
	db: Db,
	organizationId: string,
	routeId: string,
	habitatId: string,
	position: number,
	directions: string,
): Promise<string> {
	const row = await db
		.insertInto('route_items')
		.values({
			organization_id: organizationId,
			route_id: routeId,
			entity_type: 'habitat',
			entity_id: habitatId,
			position,
			directions_to_next_item: directions,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createContact(db: Db, organizationId: string, contactName: string): Promise<string> {
	const row = await db
		.insertInto('contacts')
		.values({ organization_id: organizationId, contact_name: contactName })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createServiceRequest(
	db: Db,
	organizationId: string,
	contactId: string,
	addressId: string,
): Promise<string> {
	const row = await db
		.insertInto('service_requests')
		.values({
			organization_id: organizationId,
			contact_id: contactId,
			address_id: addressId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			request_date: sql`date '2026-08-01'`,
			intake_type: 'phone',
			details: 'Standing water behind the depot.',
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createNotificationRegistration(
	db: Db,
	organizationId: string,
	contactId: string,
): Promise<string> {
	const row = await db
		.insertInto('notification_registrations')
		.values({
			organization_id: organizationId,
			contact_id: contactId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createMissionNotification(
	db: Db,
	organizationId: string,
	contactId: string,
	registrationId: string,
): Promise<string> {
	const notificationType = await db
		.insertInto('notification_types')
		.values({ organization_id: organizationId, name: 'Adulticiding' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const mission = await db
		.insertInto('missions')
		.values({
			organization_id: organizationId,
			control_type: 'application',
			scheduled_start_at: sql`now() + interval '1 day'`,
			notification_type_id: notificationType.id,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('mission_notifications')
		.values({
			organization_id: organizationId,
			mission_id: mission.id,
			notification_registration_id: registrationId,
			contact_id: contactId,
			notification_type_id: notificationType.id,
			channel: 'email',
			destination: 'sam@example.test',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
