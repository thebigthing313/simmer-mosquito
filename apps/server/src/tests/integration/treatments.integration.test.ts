import {
	DeleteAcknowledgementRequiredError,
	type Kysely,
	ReferenceRefusedError,
	type SimmerDatabase,
	sql,
} from '@simmer-mosquito/db';
import {
	createApplication,
	createApplicationBatch,
	createFormulation,
	createFormulationInsecticide,
	createInsecticide,
	createInsecticideBatch,
	createMission,
	createMissionItem,
	createOrganization,
	createProfile,
	createTreatment,
	createUnit,
	describeDbIntegration,
	withTestDb,
} from '@simmer-mosquito/db/test-support';
import {
	addAdditionalPersonnelCommand,
	addCommentCommand,
	DomainValidationError,
} from '@simmer-mosquito/domain';
import { expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import { CommandError } from '../../command-endpoint.js';
import type { CommandActor, OrganizationCommandType } from '../../command-permissions.js';
import { writeCommands } from '../../command-write.js';
import { treatmentTableCommands } from '../../table-commands/treatments.js';
import {
	settleTreatmentWrites,
	type TreatmentCommand,
	writeTreatmentCommand,
} from '../../writers/control-operations/treatments.js';
import { writeAdditionalPersonnelCommand } from '../../writers/field-work/additional-personnel.js';
import { writeCommentCommand } from '../../writers/field-work/comments.js';

/**
 * `/commands/treatments` against real Postgres (ADR 0020).
 *
 * Each case sends a body the way the client does: the intents it names, built
 * by the table's own intent map, committed through `writeCommands` with the
 * table's writer and its settle hook, which is the transaction a request runs
 * in. The intent translation alone is in
 * `tests/unit/table-commands/control-records.test.ts`; what needs a database is
 * here: the line diff, every refusal, the recipe check, the mission stop and
 * the floors, which read the stored Treatment.
 */
describeDbIntegration('treatment write surface', () => {
	it('records a treatment, every line and every batch link in one transaction', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();

			const row = await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				applications: [lineOf(world, world.a, 2, [world.batchA]), lineOf(world, world.b, 3, [])],
			});

			expect(row).toMatchObject({ id: treatmentId });
			const lines = await liveLines(db, treatmentId);
			expect(lines.map((line) => [line.insecticide_id, line.amount_applied]).sort()).toEqual(
				[
					[world.a, 2],
					[world.b, 3],
				].sort(),
			);
			expect(await liveLinks(db, treatmentId)).toHaveLength(1);
		});
	});

	it('writes nothing when one line is refused', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();

			const refusal = await capture(() =>
				send(db, world, world.manager, treatmentId, ['recordTreatment'], {
					...visit(),
					// A batch of A on the line for B.
					applications: [lineOf(world, world.a, 2, []), lineOf(world, world.b, 3, [world.batchA])],
				}),
			);

			expect(refusal).toBeInstanceOf(DomainValidationError);
			expect(issuePaths(refusal)).toEqual([
				'applications.1.application_batches.0.insecticide_batch_id',
			]);
			const treatment = await db
				.selectFrom('treatments')
				.select('id')
				.where('id', '=', treatmentId)
				.executeTakeFirst();
			expect(treatment).toBeUndefined();
			expect(await liveLines(db, treatmentId)).toEqual([]);
		});
	});

	it('diffs a revise: inserts new ids, updates changed lines and soft-deletes missing ones', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			const kept = lineOf(world, world.a, 2, [world.batchA]);
			const dropped = lineOf(world, world.b, 3, [world.batchB]);
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				applications: [kept, dropped],
			});
			const added = lineOf(world, world.c, 1, []);
			const secondBatchA = await createInsecticideBatch(db, world.organizationId, world.a, {
				batch_name: 'Lot 2026-05',
			});

			await send(db, world, world.manager, treatmentId, ['reviseTreatmentLines'], {
				applications: [
					{
						...kept,
						amount_applied: 2.5,
						// The old link goes and a new one arrives on the kept line.
						application_batches: [{ id: crypto.randomUUID(), insecticide_batch_id: secondBatchA }],
					},
					added,
				],
			});

			const lines = await allLines(db, treatmentId);
			const byId = new Map(lines.map((line) => [line.id, line]));
			expect(byId.get(kept.id)).toMatchObject({ amount_applied: 2.5, deleted_at: null });
			expect(byId.get(added.id)).toMatchObject({ insecticide_id: world.c, deleted_at: null });
			expect(byId.get(dropped.id)?.deleted_at).not.toBeNull();

			const links = await liveLinks(db, treatmentId);
			expect(links.map((link) => link.insecticide_batch_id)).toEqual([secondBatchA]);
		});
	});

	it('holds the one-line-per-insecticide rule against the final set', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			const first = lineOf(world, world.a, 2, []);
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				applications: [first],
			});

			// Removing a line and adding another for the same product is one request,
			// because the rule is read off what the request leaves behind.
			const replacement = lineOf(world, world.a, 4, []);
			await send(db, world, world.manager, treatmentId, ['reviseTreatmentLines'], {
				applications: [replacement],
			});
			expect((await liveLines(db, treatmentId)).map((line) => line.id)).toEqual([replacement.id]);

			const twice = await capture(() =>
				send(db, world, world.manager, treatmentId, ['reviseTreatmentLines'], {
					applications: [replacement, lineOf(world, world.a, 1, [])],
				}),
			);
			expect(issuePaths(twice)).toEqual(['applications.1.insecticide_id']);
		});
	});

	it('refuses a line id from another treatment, and a removed line id', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const mine = crypto.randomUUID();
			const theirs = crypto.randomUUID();
			const line = lineOf(world, world.a, 2, []);
			const theirLine = lineOf(world, world.a, 2, []);
			await send(db, world, world.manager, mine, ['recordTreatment'], {
				...visit(),
				applications: [line],
			});
			await send(db, world, world.manager, theirs, ['recordTreatment'], {
				...visit(),
				applications: [theirLine],
			});

			const foreign = await capture(() =>
				send(db, world, world.manager, mine, ['reviseTreatmentLines'], {
					applications: [line, { ...theirLine, insecticide_id: world.b }],
				}),
			);
			expect(issues(foreign)).toEqual([
				{
					path: 'applications.1.id',
					message: 'This chemical application belongs to another treatment.',
				},
			]);

			// Removed, then named again: not restored.
			const replacement = lineOf(world, world.b, 1, []);
			await send(db, world, world.manager, mine, ['reviseTreatmentLines'], {
				applications: [replacement],
			});
			const restored = await capture(() =>
				send(db, world, world.manager, mine, ['reviseTreatmentLines'], {
					applications: [replacement, line],
				}),
			);
			expect(issuePaths(restored)).toEqual(['applications.1.id']);
		});
	});

	it('answers a revise of a treatment that is not there with no row and writes no line', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const missing = crypto.randomUUID();

			const row = await send(db, world, world.manager, missing, ['reviseTreatmentLines'], {
				applications: [lineOf(world, world.a, 2, [])],
			});

			// No row is the endpoint's 404, `treatment_not_found`.
			expect(row).toBeNull();
			expect(await allLines(db, missing)).toEqual([]);
		});
	});

	it('refuses a batch link that belongs to another line', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			const withLink = lineOf(world, world.a, 2, [world.batchA]);
			const other = lineOf(world, world.b, 3, []);
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				applications: [withLink, other],
			});

			const refusal = await capture(() =>
				send(db, world, world.manager, treatmentId, ['reviseTreatmentLines'], {
					applications: [
						{ ...withLink, application_batches: [] },
						{ ...other, application_batches: withLink.application_batches },
					],
				}),
			);
			expect(issuePaths(refusal)).toEqual(['applications.1.application_batches.0.id']);
		});
	});

	it('changes a kept line’s insecticide in place only when its batches still match', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			const line = lineOf(world, world.a, 2, [world.batchA]);
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				applications: [line],
			});

			const stale = await capture(() =>
				send(db, world, world.manager, treatmentId, ['reviseTreatmentLines'], {
					applications: [{ ...line, insecticide_id: world.b }],
				}),
			);
			expect(issuePaths(stale)).toEqual([
				'applications.0.application_batches.0.insecticide_batch_id',
			]);

			await send(db, world, world.manager, treatmentId, ['reviseTreatmentLines'], {
				applications: [
					{
						...line,
						insecticide_id: world.b,
						application_batches: [{ id: crypto.randomUUID(), insecticide_batch_id: world.batchB }],
					},
				],
			});
			const [stored] = await liveLines(db, treatmentId);
			expect(stored).toMatchObject({ id: line.id, insecticide_id: world.b });
		});
	});

	it('gates only the catalog references a write changes', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			const line = lineOf(world, world.a, 2, [world.batchA]);
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				applications: [line],
			});
			await db
				.updateTable('insecticides')
				.set({ is_active: false })
				.where('id', '=', world.a)
				.execute();
			await db
				.updateTable('insecticide_batches')
				.set({ is_active: false })
				.where('id', '=', world.batchA)
				.execute();

			// The kept line and its kept link name retired rows and still save.
			await send(db, world, world.manager, treatmentId, ['reviseTreatmentLines'], {
				applications: [{ ...line, amount_applied: 3 }],
			});

			// A new line naming a retired product is refused.
			const newLine = await capture(() =>
				send(db, world, world.manager, crypto.randomUUID(), ['recordTreatment'], {
					...visit(),
					applications: [lineOf(world, world.a, 2, [])],
				}),
			);
			expect(newLine).toBeInstanceOf(ReferenceRefusedError);
			expect((newLine as ReferenceRefusedError).reason).toBe('inactive');
		});
	});

	it('refuses a new link to a retired batch by name', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			const line = lineOf(world, world.a, 2, []);
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				applications: [line],
			});
			await db
				.updateTable('insecticide_batches')
				.set({ is_active: false })
				.where('id', '=', world.batchA)
				.execute();

			const refusal = await capture(() =>
				send(db, world, world.manager, treatmentId, ['reviseTreatmentLines'], {
					applications: [{ ...line, application_batches: [link(world.batchA)] }],
				}),
			);
			expect(refusal).toBeInstanceOf(ReferenceRefusedError);
			expect((refusal as ReferenceRefusedError).reference).toBe('insecticideBatch');
		});
	});

	it('records a treatment mixed from a formulation when its lines are the recipe', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();

			// 78 of a 26-unit batch is three batches: A at 0.5 is 1.5, B at 2 is 6.
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				...mixedFrom(world, 78),
				applications: [lineOf(world, world.b, 6, []), lineOf(world, world.a, 1.5, [world.batchA])],
			});

			const stored = await db
				.selectFrom('treatments')
				.select(['formulation_id', 'mix_amount', 'mix_unit_id'])
				.where('id', '=', treatmentId)
				.executeTakeFirstOrThrow();
			expect(stored).toEqual({
				formulation_id: world.formulationId,
				mix_amount: 78,
				mix_unit_id: world.mixUnit,
			});
		});
	});

	it('refuses a formulation treatment that differs from the recipe, naming what differs', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const create = (applications: unknown[], extra: Record<string, unknown> = {}) =>
				capture(() =>
					send(db, world, world.manager, crypto.randomUUID(), ['recordTreatment'], {
						...visit(),
						...mixedFrom(world, 78),
						...extra,
						applications,
					}),
				);

			const amount = await create([lineOf(world, world.a, 1.5, []), lineOf(world, world.b, 5, [])]);
			expect(issuePaths(amount)).toEqual(['applications.1.amount_applied']);

			const extra = await create([
				lineOf(world, world.a, 1.5, []),
				lineOf(world, world.b, 6, []),
				lineOf(world, world.c, 1, []),
			]);
			expect(issuePaths(extra)).toEqual(['applications.2.insecticide_id']);

			const missing = await create([lineOf(world, world.a, 1.5, [])]);
			expect(issues(missing)).toEqual([
				{
					path: 'applications',
					message: 'Mix A includes Larvicide B, and this treatment has no line for it.',
				},
			]);

			const unit = await create([lineOf(world, world.a, 1.5, []), lineOf(world, world.b, 6, [])], {
				mix_unit_id: world.unit,
			});
			expect(issuePaths(unit)).toEqual(['mixUnitId']);
		});
	});

	it('runs the recipe check once, after a header change and a revise in one request', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			const a = lineOf(world, world.a, 1.5, []);
			const b = lineOf(world, world.b, 6, []);
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				...mixedFrom(world, 78),
				applications: [a, b],
			});

			// The mix amount alone no longer matches the stored lines.
			const headerOnly = await capture(() =>
				send(db, world, world.manager, treatmentId, ['updateTreatmentFieldDetails'], {
					...mixedFrom(world, 52),
				}),
			);
			expect(issuePaths(headerOnly)).toEqual(['applications.0.amount_applied']);

			// With the lines recomputed in the same PATCH, both commit together.
			await send(
				db,
				world,
				world.manager,
				treatmentId,
				['updateTreatmentFieldDetails', 'reviseTreatmentLines'],
				{
					...mixedFrom(world, 52),
					applications: [
						{ ...a, amount_applied: 1 },
						{ ...b, amount_applied: 4 },
					],
				},
			);
			const lines = await liveLines(db, treatmentId);
			expect(lines.map((line) => line.amount_applied).sort()).toEqual([1, 4]);
		});
	});

	it('lets a batch-only revise through on a treatment whose recipe was edited after it was saved', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			const a = lineOf(world, world.a, 1.5, []);
			const b = lineOf(world, world.b, 6, []);
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				...mixedFrom(world, 78),
				applications: [a, b],
			});
			// The recipe changes after the save: B now takes 3 per batch.
			await db
				.updateTable('formulation_insecticides')
				.set({ amount: 3 })
				.where('formulation_id', '=', world.formulationId)
				.where('insecticide_id', '=', world.b)
				.execute();

			await send(db, world, world.manager, treatmentId, ['reviseTreatmentLines'], {
				applications: [{ ...a, application_batches: [link(world.batchA)] }, b],
			});
			expect(await liveLinks(db, treatmentId)).toHaveLength(1);

			// Touching an amount runs the check, against the recipe as it now stands.
			const amount = await capture(() =>
				send(db, world, world.manager, treatmentId, ['reviseTreatmentLines'], {
					applications: [{ ...a, amount_applied: 1.6 }, b],
				}),
			);
			expect(issuePaths(amount)).toEqual(['applications.0.amount_applied']);
		});
	});

	it('refuses a retired formulation only when the write changes the reference to it', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				...mixedFrom(world, 78),
				applications: [lineOf(world, world.a, 1.5, []), lineOf(world, world.b, 6, [])],
			});
			await db
				.updateTable('formulations')
				.set({ is_active: false })
				.where('id', '=', world.formulationId)
				.execute();

			// The stored reference is unchanged, so a header edit passes.
			await send(db, world, world.manager, treatmentId, ['updateTreatmentFieldDetails'], {
				...mixedFrom(world, 78),
				application_date: today(),
			});

			const fresh = await capture(() =>
				send(db, world, world.manager, crypto.randomUUID(), ['recordTreatment'], {
					...visit(),
					...mixedFrom(world, 78),
					applications: [lineOf(world, world.a, 1.5, []), lineOf(world, world.b, 6, [])],
				}),
			);
			expect(fresh).toBeInstanceOf(ReferenceRefusedError);
			expect((fresh as ReferenceRefusedError).reason).toBe('inactive');
		});
	});

	it('clears the formulation and keeps the lines when the crew switches to product by product', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			const a = lineOf(world, world.a, 1.5, []);
			const b = lineOf(world, world.b, 6, []);
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				...mixedFrom(world, 78),
				applications: [a, b],
			});

			await send(
				db,
				world,
				world.manager,
				treatmentId,
				['updateTreatmentFieldDetails', 'reviseTreatmentLines'],
				{
					formulation_id: null,
					mix_amount: null,
					mix_unit_id: null,
					applications: [{ ...a, amount_applied: 9 }],
				},
			);
			const stored = await db
				.selectFrom('treatments')
				.select(['formulation_id'])
				.where('id', '=', treatmentId)
				.executeTakeFirstOrThrow();
			expect(stored.formulation_id).toBeNull();
			expect((await liveLines(db, treatmentId)).map((line) => line.amount_applied)).toEqual([9]);
		});
	});

	it('completes a mission stop once per treatment and checks coverage against the treatment', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const missionId = await createMission(db, world.organizationId);
			const itemId = await createMissionItem(db, world.organizationId, missionId);
			const treatmentId = crypto.randomUUID();

			await send(db, world, world.manager, treatmentId, ['recordTreatmentForMissionItem'], {
				application_date: today(),
				mission_item_id: itemId,
				applications: [lineOf(world, world.a, 2, []), lineOf(world, world.b, 3, [])],
			});

			const item = await db
				.selectFrom('mission_items')
				.select(['completed_at'])
				.where('id', '=', itemId)
				.executeTakeFirstOrThrow();
			expect(item.completed_at).not.toBeNull();
			const treatment = await db
				.selectFrom('treatments')
				.select(['mission_item_id'])
				.where('id', '=', treatmentId)
				.executeTakeFirstOrThrow();
			expect(treatment.mission_item_id).toBe(itemId);

			const otherItem = await createMissionItem(db, world.organizationId, missionId, {
				position: 2,
			});
			const elsewhere = await capture(() =>
				send(db, world, world.manager, crypto.randomUUID(), ['recordTreatmentForMissionItem'], {
					application_date: today(),
					mission_item_id: otherItem,
					geometry: { type: 'Point', coordinates: [-80, 30] },
					applications: [lineOf(world, world.a, 2, [])],
				}),
			);
			expect(elsewhere).toBeInstanceOf(CommandError);
			expect((elsewhere as CommandError).body.error).toBe('mission_geometry_not_covered');
		});
	});

	it('deletes a treatment and its lines with no flag, and asks before taking batch links', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const plain = crypto.randomUUID();
			await send(db, world, world.manager, plain, ['recordTreatment'], {
				...visit(),
				applications: [lineOf(world, world.a, 2, []), lineOf(world, world.b, 3, [])],
			});
			await send(db, world, world.manager, plain, ['deleteTreatment'], {
				acknowledgedBatchDeletion: false,
				acknowledgedSupportRecordDeletion: false,
			});
			expect(await liveLines(db, plain)).toEqual([]);

			const linked = crypto.randomUUID();
			await send(db, world, world.manager, linked, ['recordTreatment'], {
				...visit(),
				applications: [lineOf(world, world.a, 2, [world.batchA])],
			});
			const refusal = await capture(() =>
				send(db, world, world.manager, linked, ['deleteTreatment'], {
					acknowledgedBatchDeletion: false,
				}),
			);
			expect(refusal).toBeInstanceOf(DeleteAcknowledgementRequiredError);
			expect((refusal as DeleteAcknowledgementRequiredError).acknowledgement).toBe(
				'acknowledgedBatchDeletion',
			);
			expect(await liveLines(db, linked)).toHaveLength(1);
		});
	});

	// OWN_TREATMENT and DELETE_OWN_TREATMENT read the stored Treatment, so the
	// floor is only proved against one.
	it('lets a collector correct their own recent treatment and nobody else’s', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const mine = crypto.randomUUID();
			const line = lineOf(world, world.a, 2, []);
			await send(db, world, world.collector, mine, ['recordTreatment'], {
				...visit(),
				applications: [line],
			});
			await send(db, world, world.collector, mine, ['reviseTreatmentLines'], {
				applications: [{ ...line, amount_applied: 3 }],
			});

			const theirs = crypto.randomUUID();
			await send(db, world, world.manager, theirs, ['recordTreatment'], {
				...visit(),
				applications: [lineOf(world, world.a, 2, [])],
			});
			const foreign = await capture(() =>
				send(db, world, world.collector, theirs, ['updateTreatmentFieldDetails'], {
					application_date: today(),
				}),
			);
			expect(foreign).toBeInstanceOf(CommandError);
			expect((foreign as CommandError).status).toBe(403);

			// Older than 30 days is a manager's.
			const old = await createTreatment(db, world.organizationId, {
				applicator_profile_id: world.collector.profileId,
				application_date: sql`current_date - 31`,
			});
			await createApplication(db, world.organizationId, {
				treatmentId: old,
				insecticideId: world.a,
				unitId: world.unit,
			});
			const expired = await capture(() =>
				send(db, world, world.collector, old, ['updateTreatmentLocationAndContext'], {
					address_id: null,
				}),
			);
			expect((expired as CommandError).body.reason).toBe(
				'Control actions can only be corrected by their performer for 30 days.',
			);
			await send(db, world, world.manager, old, ['updateTreatmentLocationAndContext'], {
				address_id: null,
			});
		});
	});

	it('sends a collector’s delete of a treatment with batch links to a manager', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const standalone = crypto.randomUUID();
			await send(db, world, world.collector, standalone, ['recordTreatment'], {
				...visit(),
				applications: [lineOf(world, world.a, 2, [])],
			});
			await send(db, world, world.collector, standalone, ['deleteTreatment'], {});

			const linked = await createTreatment(db, world.organizationId, {
				applicator_profile_id: world.collector.profileId,
				application_date: sql`current_date`,
			});
			const lineId = await createApplication(db, world.organizationId, {
				treatmentId: linked,
				insecticideId: world.a,
				unitId: world.unit,
			});
			await createApplicationBatch(db, world.organizationId, {
				applicationId: lineId,
				insecticideBatchId: world.batchA,
			});

			const refusal = await capture(() =>
				send(db, world, world.collector, linked, ['deleteTreatment'], {}),
			);
			expect((refusal as CommandError).body.reason).toBe(
				'This treatment has insecticide batches linked to it. A manager can delete it.',
			);
		});
	});

	it('trades insecticides between two kept lines in one revise', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			const first = lineOf(world, world.a, 2, []);
			const second = lineOf(world, world.b, 3, []);
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				applications: [first, second],
			});

			// Midway through the diff both lines name B; the deferred exclusion
			// constraint reads the set at commit, when they name one each again.
			await send(db, world, world.manager, treatmentId, ['reviseTreatmentLines'], {
				applications: [
					{ ...first, insecticide_id: world.b },
					{ ...second, insecticide_id: world.a },
				],
			});

			const byId = new Map(
				(await liveLines(db, treatmentId)).map((line) => [line.id, line.insecticide_id]),
			);
			expect(byId.get(first.id)).toBe(world.b);
			expect(byId.get(second.id)).toBe(world.a);
		});
	});
});

/**
 * Comments and Additional Personnel hang on the Treatment, never on a line
 * (ADR 0020). The target type is `treatment`, the stored `entity_type` is
 * `'treatment'`, and a Chemical Application id sent as the target is refused.
 */
describeDbIntegration('support records on a treatment', () => {
	it('files a comment and an assisting person on the treatment', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				applications: [lineOf(world, world.a, 2, [])],
			});

			const comment = await db
				.transaction()
				.execute((trx) => writeCommentCommand(trx, commentOn(world, treatmentId)));
			const person = await db
				.transaction()
				.execute((trx) => writeAdditionalPersonnelCommand(trx, personOn(world, treatmentId)));

			expect(comment).toMatchObject({ entity_type: 'treatment', entity_id: treatmentId });
			expect(person).toMatchObject({ entity_type: 'treatment', entity_id: treatmentId });
		});
	});

	it('refuses a chemical application id sent as the treatment', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db);
			const treatmentId = crypto.randomUUID();
			const line = lineOf(world, world.a, 2, []);
			await send(db, world, world.manager, treatmentId, ['recordTreatment'], {
				...visit(),
				applications: [line],
			});

			for (const write of [
				async (trx: Parameters<typeof writeCommentCommand>[0]): Promise<unknown> =>
					writeCommentCommand(trx, commentOn(world, line.id)),
				async (trx: Parameters<typeof writeCommentCommand>[0]): Promise<unknown> =>
					writeAdditionalPersonnelCommand(trx, personOn(world, line.id)),
			]) {
				const refusal = await capture(() => db.transaction().execute(write));
				expect(refusal).toBeInstanceOf(CommandError);
				expect((refusal as CommandError).body).toEqual({
					error: 'target_not_found',
					reason: 'That treatment is not available.',
				});
			}
			const filed = await db
				.selectFrom('comments')
				.select('id')
				.where('entity_id', '=', line.id)
				.execute();
			expect(filed).toEqual([]);
		});
	});

	it('no longer takes a chemical application as a target', () => {
		expect(() =>
			addCommentCommand({
				organizationId: crypto.randomUUID(),
				actorProfileId: crypto.randomUUID(),
				commentId: crypto.randomUUID(),
				target: { type: 'application' as never, id: crypto.randomUUID() },
				commentText: 'Two basins dry.',
			}),
		).toThrow(DomainValidationError);
	});
});

function commentOn(world: World, entityId: string) {
	return addCommentCommand({
		organizationId: world.organizationId,
		actorProfileId: world.manager.profileId,
		commentId: crypto.randomUUID(),
		target: { type: 'treatment', id: entityId },
		commentText: 'Two basins dry.',
	});
}

function personOn(world: World, entityId: string) {
	return addAdditionalPersonnelCommand({
		organizationId: world.organizationId,
		actorProfileId: world.manager.profileId,
		additionalPersonnelId: crypto.randomUUID(),
		target: { type: 'treatment', id: entityId },
		personnelProfileId: world.collector.profileId,
	});
}

// ---------------------------------------------------------------------------
// The world and the request
// ---------------------------------------------------------------------------

interface World {
	readonly organizationId: string;
	readonly manager: CommandActor;
	readonly collector: CommandActor;
	readonly unit: string;
	readonly mixUnit: string;
	readonly a: string;
	readonly b: string;
	readonly c: string;
	readonly batchA: string;
	readonly batchB: string;
	readonly formulationId: string;
}

/**
 * Three insecticides, a batch each of the first two, and Mix A: 0.5 of A and 2
 * of B per 26 of finished mix.
 */
async function seedWorld(db: Kysely<SimmerDatabase>): Promise<World> {
	const organizationId = await createOrganization(db);
	const manager = await createProfile(db, organizationId, { display_name: 'Manager' });
	const collector = await createProfile(db, organizationId, { display_name: 'Collector' });
	const unit = await createUnit(db);
	const mixUnit = await createUnit(db, { unit_name: 'gallons', abbreviation: 'gal' });
	const insecticide = (name: string, registration: string) =>
		createInsecticide(db, organizationId, unit, {
			trade_name: name,
			registration_number: registration,
		});
	const a = await insecticide('Larvicide A', '100-1');
	const b = await insecticide('Larvicide B', '100-2');
	const c = await insecticide('Larvicide C', '100-3');
	const formulationId = await createFormulation(db, organizationId, mixUnit, {
		formulation_name: 'Mix A',
		batch_size: 26,
	});
	await createFormulationInsecticide(
		db,
		organizationId,
		{ formulationId, insecticideId: a, unitId: unit },
		{ amount: 0.5 },
	);
	await createFormulationInsecticide(
		db,
		organizationId,
		{ formulationId, insecticideId: b, unitId: unit },
		{ amount: 2 },
	);
	return {
		organizationId,
		manager: { role: 'manager', profileId: manager },
		collector: { role: 'collector', profileId: collector },
		unit,
		mixUnit,
		a,
		b,
		c,
		batchA: await createInsecticideBatch(db, organizationId, a),
		batchB: await createInsecticideBatch(db, organizationId, b, { batch_name: 'Lot B' }),
		formulationId,
	};
}

/**
 * One request: the intents it names, built by the table's map over one body,
 * committed in one transaction with the table's writer and settle hook.
 */
async function send(
	db: Kysely<SimmerDatabase>,
	world: World,
	actor: CommandActor,
	id: string,
	intents: readonly string[],
	payload: Record<string, unknown>,
) {
	const spec = treatmentTableCommands(db);
	const request = {
		payload,
		organization: { organizationId: world.organizationId, actorProfileId: actor.profileId },
		authContext: {
			organization: { id: world.organizationId, settings: null },
			profile: { id: actor.profileId },
			role: actor.role,
		} as unknown as AuthContext,
		id,
	};
	const commands = intents.map((intent) => {
		const name = (
			intent === 'recordTreatmentForMissionItem'
				? `missionDispatch.${intent}`
				: `controlOperations.${intent}`
		) as OrganizationCommandType;
		const build = spec.intents[name];
		if (build === undefined) {
			throw new Error(`treatments does not accept ${name}.`);
		}
		return build(request as never) as TreatmentCommand;
	});
	const result = await writeCommands(
		db,
		actor,
		commands,
		writeTreatmentCommand,
		settleTreatmentWrites,
	);
	return result.row;
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function visit(): Record<string, unknown> {
	return {
		application_date: today(),
		locationSource: { kind: 'geometry', geometry: { type: 'Point', coordinates: [-90.5, 35.5] } },
	};
}

function mixedFrom(world: World, mixAmount: number): Record<string, unknown> {
	return { formulation_id: world.formulationId, mix_amount: mixAmount, mix_unit_id: world.mixUnit };
}

function link(insecticideBatchId: string) {
	return { id: crypto.randomUUID(), insecticide_batch_id: insecticideBatchId };
}

function lineOf(world: World, insecticideId: string, amount: number, batches: readonly string[]) {
	return {
		id: crypto.randomUUID(),
		insecticide_id: insecticideId,
		amount_applied: amount,
		application_unit_id: world.unit,
		application_batches: batches.map(link),
	};
}

async function capture(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run();
	} catch (error) {
		return error;
	}
	throw new Error('Expected the request to be refused.');
}

function issues(error: unknown): readonly { readonly path: string; readonly message: string }[] {
	if (!(error instanceof DomainValidationError)) {
		throw new Error(`Expected a DomainValidationError, got ${String(error)}`);
	}
	return error.issues;
}

function issuePaths(error: unknown): readonly string[] {
	return issues(error).map((issue) => issue.path);
}

async function liveLines(db: Kysely<SimmerDatabase>, treatmentId: string) {
	return db
		.selectFrom('applications')
		.select(['id', 'insecticide_id', 'amount_applied'])
		.where('treatment_id', '=', treatmentId)
		.where('deleted_at', 'is', null)
		.execute();
}

async function allLines(db: Kysely<SimmerDatabase>, treatmentId: string) {
	return db
		.selectFrom('applications')
		.select(['id', 'insecticide_id', 'amount_applied', 'deleted_at'])
		.where('treatment_id', '=', treatmentId)
		.execute();
}

async function liveLinks(db: Kysely<SimmerDatabase>, treatmentId: string) {
	return db
		.selectFrom('application_batches')
		.innerJoin('applications', 'applications.id', 'application_batches.application_id')
		.select(['application_batches.id', 'application_batches.insecticide_batch_id'])
		.where('applications.treatment_id', '=', treatmentId)
		.where('application_batches.deleted_at', 'is', null)
		.execute();
}
