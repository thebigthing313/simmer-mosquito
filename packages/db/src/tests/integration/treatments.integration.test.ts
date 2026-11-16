import { expect, it } from 'vitest';
import { type DbExecutor, sql } from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';
import {
	createAddress,
	createApplication,
	createComment,
	createFormulation,
	createHabitat,
	createInsecticide,
	createInspection,
	createOrganization,
	createProfile,
	createTag,
	createTreatment,
	createUnit,
} from '../../test-support/row-fixtures.js';

/**
 * The migration that puts a Treatment above each Chemical Application
 * (`docs/treatment-spec.md`, "One migration, one cutover").
 *
 * The backfill cases seed `applications` as it stood before the migration and
 * then run it, which is what `pauseBefore` is for. A row seeded afterwards would
 * be written into the new shape and prove nothing about the rows already in
 * production. Those seeds are raw SQL because the Kysely types describe the
 * schema after the migration, where the visit columns no longer exist.
 */

const MIGRATION = '202611150001_treatments.sql';

/** The audit columns a backfilled Treatment copies, read back as text so a microsecond counts. */
const AUDIT_COLUMNS = sql`
	created_by_profile_id, updated_by_profile_id,
	created_at::text as created_at, updated_at::text as updated_at,
	deleted_at::text as deleted_at, deleted_by_profile_id`;

interface PreMigrationWorld {
	readonly organizationId: string;
	readonly applicatorId: string;
	readonly editorId: string;
	readonly unitId: string;
	readonly insecticideId: string;
	readonly habitatId: string;
	readonly inspectionId: string;
	readonly addressId: string;
}

/** The rows a Chemical Application names, all on tables the migration leaves alone. */
async function seedPreMigrationWorld(db: DbExecutor): Promise<PreMigrationWorld> {
	const organizationId = await createOrganization(db);
	const applicatorId = await createProfile(db, organizationId, { display_name: 'Applicator' });
	const editorId = await createProfile(db, organizationId, { display_name: 'Editor' });
	const unitId = await createUnit(db);
	const insecticideId = await createInsecticide(db, organizationId, unitId);
	const habitatId = await createHabitat(db, organizationId);
	const inspectionId = await createInspection(db, organizationId, { habitat_id: habitatId });
	const addressId = await createAddress(db, organizationId);
	return {
		organizationId,
		applicatorId,
		editorId,
		unitId,
		insecticideId,
		habitatId,
		inspectionId,
		addressId,
	};
}

/**
 * One `applications` row in the shape before the migration, every visit column
 * and every audit column set, so a column the backfill forgets reads back null.
 */
async function seedLegacyApplication(
	db: DbExecutor,
	world: PreMigrationWorld,
	options: { readonly deleted?: boolean } = {},
): Promise<string> {
	const deleted = options.deleted === true;
	const result = await sql<{ id: string }>`
		insert into applications (
			organization_id, insecticide_id, applicator_profile_id, application_date,
			address_id, amount_applied, application_unit_id, habitat_id, inspection_id,
			metadata, geom, created_by_profile_id, updated_by_profile_id,
			created_at, updated_at, deleted_at, deleted_by_profile_id
		) values (
			${world.organizationId}, ${world.insecticideId}, ${world.applicatorId}, date '2026-06-14',
			${world.addressId}, 3.25, ${world.unitId}, ${world.habitatId}, ${world.inspectionId},
			${JSON.stringify({ total_basins: 40, dry: 12, wet: 28 })}::jsonb,
			st_setsrid(st_geomfromtext('LINESTRING(-90.5 35.5, -90.4 35.6)'), 4326),
			${world.applicatorId}, ${world.editorId},
			timestamptz '2026-06-14 13:02:03.123456+00', timestamptz '2026-06-20 08:09:10.654321+00',
			${deleted ? sql`timestamptz '2026-07-01 17:00:00.5+00'` : sql`null`},
			${deleted ? world.editorId : null}
		)
		returning id`.execute(db);
	const id = result.rows[0]?.id;
	if (id === undefined) {
		throw new Error('The legacy application insert returned no id.');
	}
	return id;
}

async function legacyAudit(db: DbExecutor, id: string) {
	const result = await sql<Record<string, string | null>>`
		select ${AUDIT_COLUMNS} from applications where id = ${id}`.execute(db);
	return result.rows[0];
}

async function treatmentAudit(db: DbExecutor, id: string) {
	const result = await sql<Record<string, string | null>>`
		select ${AUDIT_COLUMNS} from treatments where id = ${id}`.execute(db);
	return result.rows[0];
}

describeDbIntegration('the treatments backfill', () => {
	it('backfills one Treatment per row, reusing its id and copying the visit', async () => {
		await withTestDb(
			async ({ db, applyHeldBackMigrations }) => {
				const world = await seedPreMigrationWorld(db);
				const applicationId = await seedLegacyApplication(db, world);

				await applyHeldBackMigrations();

				const treatment = await db
					.selectFrom('treatments')
					.select([
						'id',
						'organization_id',
						'application_date',
						'applicator_profile_id',
						'address_id',
						'habitat_id',
						'inspection_id',
						'metadata',
						'formulation_id',
						'mix_amount',
						'mix_unit_id',
						'lat',
						'lng',
						'geom_type',
						sql<string>`st_astext(geom)`.as('wkt'),
					])
					.where('id', '=', applicationId)
					.executeTakeFirstOrThrow();

				expect(treatment).toMatchObject({
					id: applicationId,
					organization_id: world.organizationId,
					applicator_profile_id: world.applicatorId,
					address_id: world.addressId,
					habitat_id: world.habitatId,
					inspection_id: world.inspectionId,
					metadata: { total_basins: 40, dry: 12, wet: 28 },
					formulation_id: null,
					mix_amount: null,
					mix_unit_id: null,
					geom_type: 'st_linestring',
					wkt: 'LINESTRING(-90.5 35.5,-90.4 35.6)',
				});
				expect(treatment.lat).toBeCloseTo(35.55);
				expect(treatment.lng).toBeCloseTo(-90.45);

				const date = await sql<{ day: string }>`
					select application_date::text as day from treatments where id = ${applicationId}`.execute(
					db,
				);
				expect(date.rows[0]?.day).toBe('2026-06-14');

				const line = await db
					.selectFrom('applications')
					.select(['id', 'treatment_id', 'organization_id', 'insecticide_id', 'amount_applied'])
					.where('id', '=', applicationId)
					.executeTakeFirstOrThrow();
				expect(line).toEqual({
					id: applicationId,
					treatment_id: applicationId,
					organization_id: world.organizationId,
					insecticide_id: world.insecticideId,
					amount_applied: 3.25,
				});
			},
			{ pauseBefore: MIGRATION },
		);
	});

	it('copies all six audit columns, and leaves the line its own', async () => {
		await withTestDb(
			async ({ db, applyHeldBackMigrations }) => {
				const world = await seedPreMigrationWorld(db);
				const live = await seedLegacyApplication(db, world);
				const otherInsecticide = await createInsecticide(db, world.organizationId, world.unitId, {
					trade_name: 'Adulticide B',
				});
				const deleted = await seedLegacyApplication(
					db,
					{ ...world, insecticideId: otherInsecticide },
					{ deleted: true },
				);
				const before = {
					live: await legacyAudit(db, live),
					deleted: await legacyAudit(db, deleted),
				};

				await applyHeldBackMigrations();

				expect(await treatmentAudit(db, live)).toEqual(before.live);
				expect(await treatmentAudit(db, deleted)).toEqual(before.deleted);
				// Setting `treatment_id` touched every line, and no trigger stamps
				// `updated_at`, so the line's audit columns read as they did.
				expect(await legacyAudit(db, live)).toEqual(before.live);
				expect(await legacyAudit(db, deleted)).toEqual(before.deleted);
				expect(before.live).toMatchObject({
					created_by_profile_id: world.applicatorId,
					updated_by_profile_id: world.editorId,
					created_at: '2026-06-14 13:02:03.123456+00',
					updated_at: '2026-06-20 08:09:10.654321+00',
					deleted_at: null,
					deleted_by_profile_id: null,
				});
			},
			{ pauseBefore: MIGRATION },
		);
	});

	it('turns a soft-deleted row into a soft-deleted Treatment over a soft-deleted line', async () => {
		await withTestDb(
			async ({ db, applyHeldBackMigrations }) => {
				const world = await seedPreMigrationWorld(db);
				const deleted = await seedLegacyApplication(db, world, { deleted: true });

				await applyHeldBackMigrations();

				expect(await treatmentAudit(db, deleted)).toMatchObject({
					deleted_at: '2026-07-01 17:00:00.5+00',
					deleted_by_profile_id: world.editorId,
				});
				expect(await legacyAudit(db, deleted)).toMatchObject({
					deleted_at: '2026-07-01 17:00:00.5+00',
					deleted_by_profile_id: world.editorId,
				});
				const line = await db
					.selectFrom('applications')
					.select('treatment_id')
					.where('id', '=', deleted)
					.executeTakeFirstOrThrow();
				expect(line.treatment_id).toBe(deleted);
			},
			{ pauseBefore: MIGRATION },
		);
	});

	it('points comments and additional personnel at the Treatment, and only those', async () => {
		await withTestDb(
			async ({ db, applyHeldBackMigrations }) => {
				const world = await seedPreMigrationWorld(db);
				const applicationId = await seedLegacyApplication(db, world);
				const commentId = await createComment(
					db,
					world.organizationId,
					{ entityType: 'application', entityId: applicationId },
					{ comment_text: 'Catch basins along Delta Road' },
				);
				const habitatCommentId = await createComment(db, world.organizationId, {
					entityType: 'habitat',
					entityId: world.habitatId,
				});
				const personnel = await db
					.insertInto('additional_personnel')
					.values({
						organization_id: world.organizationId,
						personnel_profile_id: world.editorId,
						entity_type: 'application',
						entity_id: applicationId,
					})
					.returning('id')
					.executeTakeFirstOrThrow();

				await applyHeldBackMigrations();

				const comments = await db
					.selectFrom('comments')
					.select(['id', 'entity_type', 'entity_id'])
					.where('id', 'in', [commentId, habitatCommentId])
					.orderBy('entity_type')
					.execute();
				expect(comments).toEqual([
					{ id: habitatCommentId, entity_type: 'habitat', entity_id: world.habitatId },
					{ id: commentId, entity_type: 'treatment', entity_id: applicationId },
				]);

				const person = await db
					.selectFrom('additional_personnel')
					.select(['entity_type', 'entity_id'])
					.where('id', '=', personnel.id)
					.executeTakeFirstOrThrow();
				expect(person).toEqual({ entity_type: 'treatment', entity_id: applicationId });

				// The comment's search document refreshed itself through the update trigger.
				const document = await sql<{ display: unknown }>`
					select display from search_documents
					where source_table = 'comments' and source_id = ${commentId}`.execute(db);
				expect(document.rows[0]?.display).toEqual({
					entity_type: 'treatment',
					entity_id: applicationId,
				});

				const leftBehind = await sql<{ count: number }>`
					select (
						(select count(*) from comments where entity_type = 'application')
						+ (select count(*) from additional_personnel where entity_type = 'application')
					)::int as count`.execute(db);
				expect(leftBehind.rows[0]?.count).toBe(0);
			},
			{ pauseBefore: MIGRATION },
		);
	});
});

describeDbIntegration('the treatments schema', () => {
	it("refuses a line whose organization differs from its Treatment's", async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const otherOrganizationId = await createOrganization(db);
			const unitId = await createUnit(db);
			const otherInsecticideId = await createInsecticide(db, otherOrganizationId, unitId);
			const treatmentId = await createTreatment(db, organizationId);

			await expect(
				createApplication(db, otherOrganizationId, {
					treatmentId,
					insecticideId: otherInsecticideId,
					unitId,
				}),
			).rejects.toMatchObject({ code: '23503', constraint: 'applications_treatment_fkey' });
		});
	});

	it('takes one live line per Insecticide, and another once the first is deleted', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const unitId = await createUnit(db);
			const insecticideId = await createInsecticide(db, organizationId, unitId);
			const treatmentId = await createTreatment(db, organizationId);
			const links = { treatmentId, insecticideId, unitId };
			const first = await createApplication(db, organizationId, links);

			await expect(createApplication(db, organizationId, links)).rejects.toMatchObject({
				code: '23P01',
				constraint: 'applications_active_treatment_insecticide_excl',
			});

			// Deferred: the duplicate is written, and the transaction is refused at
			// commit, which is what lets two lines trade Insecticides mid-revise.
			let insertedInside = false;
			await expect(
				db.transaction().execute(async (trx) => {
					await createApplication(trx, organizationId, links);
					insertedInside = true;
				}),
			).rejects.toMatchObject({
				code: '23P01',
				constraint: 'applications_active_treatment_insecticide_excl',
			});
			expect(insertedInside).toBe(true);

			await db
				.updateTable('applications')
				.set({ deleted_at: sql`now()` })
				.where('id', '=', first)
				.execute();
			await expect(createApplication(db, organizationId, links)).resolves.toEqual(
				expect.any(String),
			);
		});
	});

	it('holds the Formulation columns all or none, with a positive mix amount', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const unitId = await createUnit(db);
			const formulationId = await createFormulation(db, organizationId, unitId);

			await expect(
				createTreatment(db, organizationId, { formulation_id: formulationId }),
			).rejects.toMatchObject({ code: '23514', constraint: 'treatments_formulation_all_or_none' });
			await expect(
				createTreatment(db, organizationId, {
					formulation_id: formulationId,
					mix_amount: 0,
					mix_unit_id: unitId,
				}),
			).rejects.toMatchObject({ code: '23514', constraint: 'treatments_mix_amount_positive' });
			await expect(
				createTreatment(db, organizationId, {
					formulation_id: formulationId,
					mix_amount: 78,
					mix_unit_id: unitId,
				}),
			).resolves.toEqual(expect.any(String));
		});
	});

	it('lets a tag name Treatments', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);

			await expect(
				createTag(db, organizationId, { relevant_entity_types: ['treatment', 'habitat'] }),
			).resolves.toEqual(expect.any(String));
			await expect(
				createTag(db, organizationId, {
					tag_name: 'Old jobs',
					relevant_entity_types: ['application'],
				}),
			).rejects.toMatchObject({ code: '23514', constraint: 'tags_relevant_entity_types_known' });
		});
	});
});
