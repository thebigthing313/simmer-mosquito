import { expect, it } from 'vitest';
import {
	applyRecordDeletion,
	assertRecordDeletable,
	type DeleteAcknowledgement,
	DeleteAcknowledgementRequiredError,
	type Kysely,
	RecordDeleteBlockedError,
	readDeleteImpact,
	type SimmerDatabase,
	sql,
} from '../../../index.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';

/**
 * Every confirmation given, for the cases that are about what a delete does
 * rather than about what it asks. Typed as a total record so a new flag has to
 * be added here rather than silently defaulting to withheld and turning an
 * unrelated case red.
 */
const CONFIRMED: Record<DeleteAcknowledgement, boolean> = {
	acknowledgedActionDetach: true,
	acknowledgedActualActionDetach: true,
	acknowledgedAssignmentItemDeletion: true,
	acknowledgedAssociatedRecordsDeletion: true,
	acknowledgedBatchDeletion: true,
	acknowledgedCascadeDelete: true,
	acknowledgedCrossDomainDetach: true,
	acknowledgedInspectionDetach: true,
	acknowledgedMissionDetach: true,
	acknowledgedMissionItemDeletion: true,
	acknowledgedNotificationDeletion: true,
	acknowledgedRouteItemDeletion: true,
	acknowledgedSpeciesCountDeletion: true,
	acknowledgedSupportRecordDeletion: true,
};

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
					acknowledged: CONFIRMED,
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

	it('refuses a habitat delete that withheld the inspection detach, and writes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'habitat_withheld');
			const habitatId = await createHabitat(db, org);
			const inspectionId = await createInspection(db, org, habitatId);

			const refusal = await db
				.transaction()
				.execute(async (trx) =>
					applyRecordDeletion(trx, {
						recordType: 'habitat',
						recordId: habitatId,
						organizationId: org,
						actorProfileId: null,
						acknowledged: { ...CONFIRMED, acknowledgedInspectionDetach: false },
					}),
				)
				.catch((error: unknown) => error);

			expect(refusal).toBeInstanceOf(DeleteAcknowledgementRequiredError);
			const error = refusal as DeleteAcknowledgementRequiredError;
			expect(error.acknowledgement).toBe('acknowledgedInspectionDetach');
			expect(entry(error.consequences, 'habitatInspections')).toBe(1);

			// The refusal runs before the first cascade, so the inspection still has
			// its habitat. A guard that answered after the writes would leave the
			// caller a record that is half deleted and a message saying it is not.
			const inspection = await db
				.selectFrom('inspections')
				.select(['habitat_id', 'deleted_at'])
				.where('id', '=', inspectionId)
				.executeTakeFirstOrThrow();
			expect(inspection.habitat_id).toBe(habitatId);
			expect(inspection.deleted_at).toBeNull();
		});
	});

	it('asks nothing of a habitat that has nothing hanging off it', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'habitat_bare');
			const habitatId = await createHabitat(db, org);

			// Every flag withheld, and it still goes through: the guard counts rows
			// rather than reading the flag, so a delete with no consequences never
			// asks a question the user would not understand.
			const applied = await db.transaction().execute(async (trx) =>
				applyRecordDeletion(trx, {
					recordType: 'habitat',
					recordId: habitatId,
					organizationId: org,
					actorProfileId: null,
					acknowledged: {},
				}),
			);

			expect(applied).toBe(true);
		});
	});

	it('names one withheld confirmation at a time', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'habitat_two_questions');
			const unit = await createUnit(db);
			const habitatId = await createHabitat(db, org);
			await createInspection(db, org, habitatId);
			await createApplication(db, org, unit, { habitatId });

			const first = await habitatRefusal(db, org, habitatId, {});
			expect(first.acknowledgement).toBe('acknowledgedInspectionDetach');

			// Confirming the first surfaces the second rather than letting the
			// delete through: the client answers one question per attempt.
			const second = await habitatRefusal(db, org, habitatId, {
				acknowledgedInspectionDetach: true,
			});
			expect(second.acknowledgement).toBe('acknowledgedCrossDomainDetach');
			expect(entry(second.consequences, 'habitatApplications')).toBe(1);
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
						acknowledged: CONFIRMED,
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
					acknowledged: CONFIRMED,
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
					acknowledged: CONFIRMED,
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

	// `mission` carries the registry's longest chain: four `detachesUnderChild`
	// rules that reach performed actions *through* `mission_items`, plus two
	// cascades and a support cascade. It has no detail page, so nothing exercises
	// it by hand either — if `orderRules` regressed, this is where it would show
	// first and be noticed last.
	it('reaches a mission’s performed actions through its stops without deleting them', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'mission_reach');
			const unit = await createUnit(db);
			const missionId = await createMission(db, org);
			const itemId = await createMissionItem(db, org, missionId);
			const otherMissionItem = await createMissionItem(db, org, await createMission(db, org));

			const applicationId = await createApplication(db, org, unit, { missionItemId: itemId });
			const sourceReductionId = await createSourceReduction(db, org, unit, {
				missionItemId: itemId,
			});
			const outreachId = await createOutreachAction(db, org, unit, { missionItemId: itemId });
			const biocontrolId = await createBiocontrolAction(db, org, unit, { missionItemId: itemId });
			// A neighbour on a different mission, to catch a rule that resolved its
			// child set too widely.
			const untouchedApplication = await createApplication(db, org, unit, {
				missionItemId: otherMissionItem,
			});
			await createComment(db, org, 'mission', missionId);

			const impact = await readDeleteImpact(db, {
				recordType: 'mission',
				recordId: missionId,
				organizationId: org,
			});
			expect(impact.found).toBe(true);
			expect(impact.blockers).toEqual([]);
			expect(entry(impact.cascades, 'missionItems')).toBe(1);
			expect(entry(impact.cascades, 'missionComments')).toBe(1);
			expect(entry(impact.detaches, 'missionItemApplications')).toBe(1);
			expect(entry(impact.detaches, 'missionItemSourceReductions')).toBe(1);
			expect(entry(impact.detaches, 'missionItemOutreachActions')).toBe(1);
			expect(entry(impact.detaches, 'missionItemBiocontrolActions')).toBe(1);

			await db.transaction().execute(async (trx) => {
				await applyRecordDeletion(trx, {
					recordType: 'mission',
					recordId: missionId,
					organizationId: org,
					actorProfileId: null,
					acknowledged: CONFIRMED,
				});
			});

			// The point of `detachesUnderChild`: the work that was done survives with
			// its link to a deleted stop cleared. Losing it would erase a record of
			// pesticide actually applied.
			for (const [table, id] of [
				['applications', applicationId],
				['source_reductions', sourceReductionId],
				['outreach_actions', outreachId],
				['biocontrol_actions', biocontrolId],
			] as const) {
				const row = await db
					.selectFrom(table)
					.select(['mission_item_id', 'deleted_at'])
					.where('id', '=', id)
					.executeTakeFirstOrThrow();
				expect(row.deleted_at).toBeNull();
				expect(row.mission_item_id).toBeNull();
			}

			// The other mission's stop is untouched on both counts.
			const neighbour = await db
				.selectFrom('applications')
				.select(['mission_item_id', 'deleted_at'])
				.where('id', '=', untouchedApplication)
				.executeTakeFirstOrThrow();
			expect(neighbour.deleted_at).toBeNull();
			expect(neighbour.mission_item_id).toBe(otherMissionItem);

			const item = await db
				.selectFrom('mission_items')
				.select(['deleted_at'])
				.where('id', '=', itemId)
				.executeTakeFirstOrThrow();
			expect(item.deleted_at).not.toBeNull();
			expect(await liveCommentCount(db, 'mission', missionId)).toBe(0);
		});
	});

	it('clears every reference to a deleted control request and keeps the work', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'request_reach');
			const unit = await createUnit(db);
			const requestId = await createRequestedControlAction(db, org);

			const applicationId = await createApplication(db, org, unit, { requestId });
			const sourceReductionId = await createSourceReduction(db, org, unit, { requestId });
			const outreachId = await createOutreachAction(db, org, unit, { requestId });
			const biocontrolId = await createBiocontrolAction(db, org, unit, { requestId });
			const missionItemId = await createMissionItem(db, org, await createMission(db, org), {
				requestId,
			});
			await createComment(db, org, 'requested_control_action', requestId);

			const impact = await readDeleteImpact(db, {
				recordType: 'requestedControlAction',
				recordId: requestId,
				organizationId: org,
			});
			expect(impact.found).toBe(true);
			expect(impact.blockers).toEqual([]);
			expect(entry(impact.detaches, 'controlRequestApplications')).toBe(1);
			expect(entry(impact.detaches, 'controlRequestMissionItems')).toBe(1);
			expect(entry(impact.cascades, 'controlRequestComments')).toBe(1);

			await db.transaction().execute(async (trx) => {
				await applyRecordDeletion(trx, {
					recordType: 'requestedControlAction',
					recordId: requestId,
					organizationId: org,
					actorProfileId: null,
					acknowledged: CONFIRMED,
				});
			});

			for (const [table, id] of [
				['applications', applicationId],
				['source_reductions', sourceReductionId],
				['outreach_actions', outreachId],
				['biocontrol_actions', biocontrolId],
			] as const) {
				const row = await db
					.selectFrom(table)
					.select(['requested_control_action_id', 'deleted_at'])
					.where('id', '=', id)
					.executeTakeFirstOrThrow();
				expect(row.deleted_at).toBeNull();
				expect(row.requested_control_action_id).toBeNull();
			}

			const missionItem = await db
				.selectFrom('mission_items')
				.select(['requested_control_action_id', 'deleted_at'])
				.where('id', '=', missionItemId)
				.executeTakeFirstOrThrow();
			expect(missionItem.deleted_at).toBeNull();
			expect(missionItem.requested_control_action_id).toBeNull();

			expect(await liveCommentCount(db, 'requested_control_action', requestId)).toBe(0);
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
					// Withheld, deliberately: a record the caller cannot see answers
					// false before the guard runs, so a refusal here would be this
					// endpoint admitting the habitat exists.
					acknowledged: {},
				}),
			);
			expect(applied).toBe(false);
		});
	});

	// -------------------------------------------------------------------------
	// Catalogs (#123)
	// -------------------------------------------------------------------------

	it('refuses a collection method a live trap still names, and allows it once the trap is deleted', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'method_block');
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, null, methodId);

			const blocked = await readDeleteImpact(db, {
				recordType: 'collectionMethod',
				recordId: methodId,
				organizationId: org,
			});
			expect(entry(blocked.blockers, 'collectionMethodTraps')).toBe(1);
			expect(blocked.cascades).toEqual([]);
			expect(blocked.detaches).toEqual([]);

			await expect(
				assertRecordDeletable(db, {
					recordType: 'collectionMethod',
					recordId: methodId,
					organizationId: org,
				}),
			).rejects.toBeInstanceOf(RecordDeleteBlockedError);

			// A soft-deleted referrer does not block: the trap is retired, so the
			// method it named is a mistake nobody is living with any more.
			await db
				.updateTable('traps')
				.set({ deleted_at: sql`now()` })
				.where('id', '=', trapId)
				.execute();

			await expect(
				assertRecordDeletable(db, {
					recordType: 'collectionMethod',
					recordId: methodId,
					organizationId: org,
				}),
			).resolves.toBeUndefined();
		});
	});

	it('refuses an insecticide a chemical application used', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'insecticide_block');
			const unitId = await createUnit(db);
			const applicationId = await createApplication(db, org, unitId, {});
			const application = await db
				.selectFrom('applications')
				.select(['insecticide_id'])
				.where('id', '=', applicationId)
				.executeTakeFirstOrThrow();

			const impact = await readDeleteImpact(db, {
				recordType: 'insecticide',
				recordId: application.insecticide_id,
				organizationId: org,
			});
			expect(entry(impact.blockers, 'insecticideApplications')).toBe(1);

			await expect(
				assertRecordDeletable(db, {
					recordType: 'insecticide',
					recordId: application.insecticide_id,
					organizationId: org,
				}),
			).rejects.toBeInstanceOf(RecordDeleteBlockedError);
		});
	});

	it('does not let one agency’s referrer block another agency’s catalog row', async () => {
		await withTestDb(async ({ db }) => {
			const mine = await createOrganization(db, 'method_mine');
			const theirs = await createOrganization(db, 'method_theirs');
			const myMethod = await createCollectionMethod(db, mine);
			await createTrap(db, theirs, null);

			await expect(
				assertRecordDeletable(db, {
					recordType: 'collectionMethod',
					recordId: myMethod,
					organizationId: mine,
				}),
			).resolves.toBeUndefined();
		});
	});
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Db = Kysely<SimmerDatabase>;

/** The refusal a habitat delete answers with, for the case that expects one. */
async function habitatRefusal(
	db: Db,
	organizationId: string,
	habitatId: string,
	acknowledged: Partial<Record<DeleteAcknowledgement, boolean>>,
): Promise<DeleteAcknowledgementRequiredError> {
	const result = await db
		.transaction()
		.execute(async (trx) =>
			applyRecordDeletion(trx, {
				recordType: 'habitat',
				recordId: habitatId,
				organizationId,
				actorProfileId: null,
				acknowledged,
			}),
		)
		.catch((error: unknown) => error);
	if (!(result instanceof DeleteAcknowledgementRequiredError)) {
		throw new Error(`Expected a withheld-acknowledgement refusal, got ${String(result)}`);
	}
	return result;
}

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

// --- Mission dispatch and control-request fixtures -------------------------

async function createUnit(db: Db): Promise<string> {
	const row = await db
		.insertInto('units')
		.values({
			code: 'test_units',
			unit_name: 'units',
			abbreviation: 'u',
			unit_type: 'count',
			unit_system: 'si',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createMission(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('missions')
		.values({
			organization_id: organizationId,
			control_type: 'application' as const,
			scheduled_start_at: sql`timestamptz '2026-08-05 06:00:00+00'`,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createMissionItem(
	db: Db,
	organizationId: string,
	missionId: string,
	links: { readonly requestId?: string } = {},
): Promise<string> {
	const row = await db
		.insertInto('mission_items')
		.values({
			organization_id: organizationId,
			mission_id: missionId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			position: 1,
			requested_control_action_id: links.requestId ?? null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createRequestedControlAction(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('requested_control_actions')
		.values({
			organization_id: organizationId,
			control_type: 'application' as const,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

interface ActionLinks {
	readonly missionItemId?: string;
	readonly requestId?: string;
	readonly habitatId?: string;
}

/** Each application brings its own insecticide: the trade name is unique per agency. */
let nextInsecticide = 1;

async function createApplication(
	db: Db,
	organizationId: string,
	unitId: string,
	links: ActionLinks,
): Promise<string> {
	const suffix = nextInsecticide++;
	const insecticide = await db
		.insertInto('insecticides')
		.values({
			organization_id: organizationId,
			trade_name: `Test larvicide ${suffix}`,
			active_ingredient: 'Bti',
			type: 'larvicide',
			registration_number: `12345-${suffix}`,
			default_unit_id: unitId,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('applications')
		.values({
			organization_id: organizationId,
			insecticide_id: insecticide.id,
			application_date: sql`date '2026-08-01'`,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			amount_applied: 2,
			application_unit_id: unitId,
			mission_item_id: links.missionItemId ?? null,
			requested_control_action_id: links.requestId ?? null,
			habitat_id: links.habitatId ?? null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createSourceReduction(
	db: Db,
	organizationId: string,
	unitId: string,
	links: ActionLinks,
): Promise<string> {
	const method = await db
		.insertInto('source_reduction_methods')
		.values({ organization_id: organizationId, name: 'Ditch clearing' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('source_reductions')
		.values({
			organization_id: organizationId,
			source_reduction_method_id: method.id,
			source_reduction_date: sql`date '2026-08-01'`,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			sources_eliminated_amount: 3,
			sources_eliminated_unit_id: unitId,
			mission_item_id: links.missionItemId ?? null,
			requested_control_action_id: links.requestId ?? null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createOutreachAction(
	db: Db,
	organizationId: string,
	_unitId: string,
	links: ActionLinks,
): Promise<string> {
	const method = await db
		.insertInto('outreach_methods')
		.values({ organization_id: organizationId, name: 'Door hangers' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('outreach_actions')
		.values({
			organization_id: organizationId,
			outreach_method_id: method.id,
			outreach_date: sql`date '2026-08-01'`,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			reach: 25,
			mission_item_id: links.missionItemId ?? null,
			requested_control_action_id: links.requestId ?? null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createBiocontrolAction(
	db: Db,
	organizationId: string,
	unitId: string,
	links: ActionLinks,
): Promise<string> {
	const method = await db
		.insertInto('biocontrol_methods')
		.values({ organization_id: organizationId, name: 'Gambusia release' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('biocontrol_actions')
		.values({
			organization_id: organizationId,
			biocontrol_method_id: method.id,
			biocontrol_date: sql`date '2026-08-01'`,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			amount_released: 40,
			release_unit_id: unitId,
			mission_item_id: links.missionItemId ?? null,
			requested_control_action_id: links.requestId ?? null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
