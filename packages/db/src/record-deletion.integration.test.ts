import { expect, it } from 'vitest';
import {
	applyRecordDeletion,
	type Kysely,
	RecordDeleteBlockedError,
	readDeleteImpact,
	type SimmerDatabase,
	sql,
} from './index.js';
import { describeDbIntegration, withTestDb } from './test-support/db-integration.js';

/**
 * The delete policy against real tables.
 *
 * The registry is data, so its shape proves nothing on its own — what matters
 * is that a habitat delete really does leave its inspections standing, that a
 * trap delete reaches its collections' species counts a generation down, and
 * that an address with a trap on it refuses. Each of those is a SQL question.
 */
describeDbIntegration('record deletion policy', () => {
	it('detaches a habitat’s inspections and takes its support rows', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'habitat_delete');
			const habitatId = await createHabitat(db, org);
			const inspectionId = await createInspection(db, org, habitatId);
			await createComment(db, org, 'habitat', habitatId);
			await createComment(db, org, 'inspection', inspectionId);

			const impact = await readDeleteImpact(db, {
				recordType: 'habitat',
				recordId: habitatId,
				organizationId: org,
			});
			expect(impact.found).toBe(true);
			expect(impact.blockers).toEqual([]);
			expect(entry(impact.cascades, 'habitatComments')).toBe(1);
			expect(entry(impact.detaches, 'habitatInspections')).toBe(1);

			await db.transaction().execute(async (trx) => {
				await applyRecordDeletion(trx, {
					recordType: 'habitat',
					recordId: habitatId,
					organizationId: org,
					actorProfileId: null,
				});
			});

			// The inspection survives with its habitat link cleared; its own comment
			// is untouched, while the habitat's direct comment is gone.
			const inspection = await db
				.selectFrom('inspections')
				.select(['habitat_id', 'deleted_at'])
				.where('id', '=', inspectionId)
				.executeTakeFirstOrThrow();
			expect(inspection.habitat_id).toBeNull();
			expect(inspection.deleted_at).toBeNull();

			expect(await liveCommentCount(db, 'habitat', habitatId)).toBe(0);
			expect(await liveCommentCount(db, 'inspection', inspectionId)).toBe(1);
		});
	});

	it('refuses an address while a trap still names it, and allows it once none do', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'address_block');
			const addressId = await createAddress(db, org);
			const trapId = await createTrap(db, org, addressId);

			const blocked = await readDeleteImpact(db, {
				recordType: 'address',
				recordId: addressId,
				organizationId: org,
			});
			expect(entry(blocked.blockers, 'addressTraps')).toBe(1);

			await expect(
				db.transaction().execute(async (trx) => {
					await applyRecordDeletion(trx, {
						recordType: 'address',
						recordId: addressId,
						organizationId: org,
						actorProfileId: null,
					});
				}),
			).rejects.toBeInstanceOf(RecordDeleteBlockedError);

			await db
				.updateTable('traps')
				.set({ deleted_at: sql`now()` })
				.where('id', '=', trapId)
				.execute();

			const clear = await readDeleteImpact(db, {
				recordType: 'address',
				recordId: addressId,
				organizationId: org,
			});
			expect(clear.blockers).toEqual([]);

			const applied = await db.transaction().execute(async (trx) =>
				applyRecordDeletion(trx, {
					recordType: 'address',
					recordId: addressId,
					organizationId: org,
					actorProfileId: null,
				}),
			);
			expect(applied).toBe(true);
		});
	});

	it('reaches a trap’s collections and their species counts', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'trap_cascade');
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, null, methodId);
			const collectionId = await createCollection(db, org, trapId, methodId);
			const speciesId = await createSpecies(db);
			await createCollectionSpecies(db, org, collectionId, speciesId);
			await createComment(db, org, 'collection', collectionId);

			const impact = await readDeleteImpact(db, {
				recordType: 'trap',
				recordId: trapId,
				organizationId: org,
			});
			expect(entry(impact.cascades, 'trapCollections')).toBe(1);
			expect(entry(impact.cascades, 'trapCollectionSpecies')).toBe(1);
			expect(entry(impact.cascades, 'trapCollectionComments')).toBe(1);

			await db.transaction().execute(async (trx) => {
				await applyRecordDeletion(trx, {
					recordType: 'trap',
					recordId: trapId,
					organizationId: org,
					actorProfileId: null,
				});
			});

			// The grandchildren go too: the species count and the collection's
			// comment are resolved from the live child set before the collections
			// themselves are soft-deleted.
			const collection = await db
				.selectFrom('collections')
				.select(['deleted_at'])
				.where('id', '=', collectionId)
				.executeTakeFirstOrThrow();
			expect(collection.deleted_at).not.toBeNull();

			const speciesRow = await db
				.selectFrom('collection_species')
				.select(['deleted_at'])
				.where('collection_id', '=', collectionId)
				.executeTakeFirstOrThrow();
			expect(speciesRow.deleted_at).not.toBeNull();

			expect(await liveCommentCount(db, 'collection', collectionId)).toBe(0);
		});
	});

	it('reports nothing for a record another agency owns', async () => {
		await withTestDb(async ({ db }) => {
			const owner = await createOrganization(db, 'impact_owner');
			const other = await createOrganization(db, 'impact_other');
			const habitatId = await createHabitat(db, owner);

			const impact = await readDeleteImpact(db, {
				recordType: 'habitat',
				recordId: habitatId,
				organizationId: other,
			});
			expect(impact.found).toBe(false);
			expect(impact.cascades).toEqual([]);

			const applied = await db.transaction().execute(async (trx) =>
				applyRecordDeletion(trx, {
					recordType: 'habitat',
					recordId: habitatId,
					organizationId: other,
					actorProfileId: null,
				}),
			);
			expect(applied).toBe(false);
		});
	});
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Db = Kysely<SimmerDatabase>;

function entry(
	entries: readonly { readonly key: string; readonly count: number }[],
	key: string,
): number {
	return entries.find((candidate) => candidate.key === key)?.count ?? 0;
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

async function createHabitat(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('habitats')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			habitat_name: 'Ditch',
			description: 'Roadside ditch',
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createInspection(
	db: Db,
	organizationId: string,
	habitatId: string,
): Promise<string> {
	const row = await db
		.insertInto('inspections')
		.values({
			organization_id: organizationId,
			habitat_id: habitatId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			inspection_date: sql`date '2026-08-01'`,
			is_wet: true,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createAddress(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('addresses')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			display_name: 'Depot',
			country: 'US',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createCollectionMethod(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('collection_methods')
		.values({ organization_id: organizationId, name: 'CDC light trap' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createTrap(
	db: Db,
	organizationId: string,
	addressId: string | null,
	collectionMethodId?: string,
): Promise<string> {
	const methodId = collectionMethodId ?? (await createCollectionMethod(db, organizationId));
	const row = await db
		.insertInto('traps')
		.values({
			organization_id: organizationId,
			collection_method_id: methodId,
			address_id: addressId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			trap_name: 'North gate',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createCollection(
	db: Db,
	organizationId: string,
	trapId: string,
	collectionMethodId: string,
): Promise<string> {
	const row = await db
		.insertInto('collections')
		.values({
			organization_id: organizationId,
			trap_id: trapId,
			collection_method_id: collectionMethodId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			// Exact timestamps, so the row satisfies `collections_timing_shape`
			// without needing a duration unit — the timing mode is incidental here.
			collection_timing_mode: 'exact_timestamps',
			started_at: sql`timestamptz '2026-08-01 06:00:00+00'`,
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createSpecies(db: Db): Promise<string> {
	const genus = await db
		.insertInto('genera')
		.values({ abbreviation: 'Cx', name: 'Culex' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('species')
		.values({ genus_id: genus.id, epithet: 'pipiens', display_name: 'Culex pipiens' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createCollectionSpecies(
	db: Db,
	organizationId: string,
	collectionId: string,
	speciesId: string,
): Promise<string> {
	const row = await db
		.insertInto('collection_species')
		.values({
			organization_id: organizationId,
			collection_id: collectionId,
			species_id: speciesId,
			count: 12,
			identified_date: sql`date '2026-08-02'`,
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
