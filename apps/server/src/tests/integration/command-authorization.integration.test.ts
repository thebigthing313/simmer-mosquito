import { type Kysely, type SimmerDatabase, sql, type Transaction } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import { expect, it } from 'vitest';
import {
	ACTION_CORRECTION_WINDOW_DAYS,
	COMMENT_CORRECTION_WINDOW_DAYS,
	readAssigneeOwnership,
	readCommentOwnership,
	readItemParentId,
	readPerformerOwnership,
	resolveCommandOwnership,
} from '../../command-ownership.js';
import type { PerformedRecordRef } from '../../command-permissions.js';
import {
	loadAssignmentSnapshot,
	readAssignmentItemState,
} from '../../field-work-commands/assignment-lifecycle.js';

/**
 * The reads that decide whether a write happens, against real Postgres.
 *
 * Both sets are covered by unit tests against fakes, and those prove the
 * predicates. What they cannot prove is the part that only a database has: that
 * `for update` really serializes two crews finishing the same assignment, that
 * a filtered `count(*)` agrees with reading every row and asking
 * `readAssignmentItemState`, and that the organization and `deleted_at`
 * predicates exclude what they claim to. The SQL was previously verified by
 * compiling it with Kysely's `DummyDriver`, which proves its shape and nothing
 * about its behaviour.
 */
describeDbIntegration('command authorization reads', () => {
	// -----------------------------------------------------------------------
	// Assignee ownership
	// -----------------------------------------------------------------------

	it('answers assignee ownership, and treats an unassigned assignment as nobody’s', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'assignee');
			const collector = await createProfile(db, org, 'Collector');
			const other = await createProfile(db, org, 'Other');

			const mine = await createAssignment(db, org, { assignedTo: collector });
			const theirs = await createAssignment(db, org, { assignedTo: other });
			const nobodys = await createAssignment(db, org, { assignedTo: null });

			await db.transaction().execute(async (trx) => {
				expect(await readAssigneeOwnership(trx, 'assignments', mine, org, collector)).toBe('owner');
				expect(await readAssigneeOwnership(trx, 'assignments', theirs, org, collector)).toBe(
					'not_owner',
				);
				// The case worth pinning: an unassigned assignment has nobody it
				// belongs to, so a collector is refused rather than admitted by a
				// null-matches-nothing accident.
				expect(await readAssigneeOwnership(trx, 'assignments', nobodys, org, collector)).toBe(
					'not_owner',
				);
			});
		});
	});

	it('hides another organization’s assignment and a deleted one behind the same “missing”', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'assignee_scope');
			const otherOrg = await createOrganization(db, 'assignee_other');
			const collector = await createProfile(db, org, 'Collector');

			const elsewhere = await createAssignment(db, otherOrg, { assignedTo: null });
			const deleted = await createAssignment(db, org, { assignedTo: collector });
			await softDelete(db, 'assignments', deleted);

			await db.transaction().execute(async (trx) => {
				// Answered as missing rather than not_owner: a refusal that
				// distinguished them would let a caller probe for ids in other
				// organizations.
				expect(await readAssigneeOwnership(trx, 'assignments', elsewhere, org, collector)).toBe(
					'missing',
				);
				expect(await readAssigneeOwnership(trx, 'assignments', deleted, org, collector)).toBe(
					'missing',
				);
			});
		});
	});

	it('resolves an item’s parent assignment, and refuses to for a deleted or foreign item', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'item_parent');
			const otherOrg = await createOrganization(db, 'item_parent_other');
			const assignment = await createAssignment(db, org, { assignedTo: null });
			const item = await createAssignmentItem(db, org, assignment, {});
			const deletedItem = await createAssignmentItem(db, org, assignment, {});
			await softDelete(db, 'assignment_items', deletedItem);

			await db.transaction().execute(async (trx) => {
				expect(await readItemParentId(trx, 'assignment_items', item, org)).toBe(assignment);
				expect(await readItemParentId(trx, 'assignment_items', deletedItem, org)).toBeNull();
				expect(await readItemParentId(trx, 'assignment_items', item, otherOrg)).toBeNull();
			});
		});
	});

	// -----------------------------------------------------------------------
	// Comment authorship
	// -----------------------------------------------------------------------

	it('lets an author correct their own comment until the window closes', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'comment_window');
			const author = await createProfile(db, org, 'Author');
			const other = await createProfile(db, org, 'Other');
			const habitat = await createHabitat(db, org);

			const fresh = await createComment(db, org, habitat, author, 0);
			// The expired case cannot be produced by clicking — it needs a backdated
			// `commented_at`, which is exactly why #57 asks for it as a fixture.
			const old = await createComment(db, org, habitat, author, COMMENT_CORRECTION_WINDOW_DAYS + 1);
			const someoneElses = await createComment(db, org, habitat, other, 0);

			await db.transaction().execute(async (trx) => {
				expect(await readCommentOwnership(trx, fresh, org, author)).toBe('owner');
				expect(await readCommentOwnership(trx, old, org, author)).toBe('window_expired');
				expect(await readCommentOwnership(trx, someoneElses, org, author)).toBe('not_author');
			});
		});
	});

	it('excludes a deleted comment and another organization’s from the authorship read', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'comment_scope');
			const otherOrg = await createOrganization(db, 'comment_scope_other');
			const author = await createProfile(db, org, 'Author');
			const habitat = await createHabitat(db, org);
			const deleted = await createComment(db, org, habitat, author, 0);
			await softDelete(db, 'comments', deleted);
			const live = await createComment(db, org, habitat, author, 0);

			await db.transaction().execute(async (trx) => {
				expect(await readCommentOwnership(trx, deleted, org, author)).toBe('missing');
				expect(await readCommentOwnership(trx, live, otherOrg, author)).toBe('missing');
			});
		});
	});

	// -----------------------------------------------------------------------
	// Control-action performance
	// -----------------------------------------------------------------------

	it('lets the performer correct their own recent action and nobody else’s', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'performer');
			const technician = await createProfile(db, org, 'Technician');
			const other = await createProfile(db, org, 'Other');
			const method = await createSourceReductionMethod(db, org);
			const unit = await createUnit(db);

			const mine = await createSourceReduction(db, org, method, unit, {
				by: technician,
				daysAgo: 1,
			});
			const theirs = await createSourceReduction(db, org, method, unit, { by: other, daysAgo: 1 });
			// A performer of null is nobody's to correct — the column is nullable and
			// a null must not read as "matches whoever is asking".
			const unattributed = await createSourceReduction(db, org, method, unit, {
				by: null,
				daysAgo: 1,
			});
			const stale = await createSourceReduction(db, org, method, unit, {
				by: technician,
				daysAgo: ACTION_CORRECTION_WINDOW_DAYS + 2,
			});

			await db.transaction().execute(async (trx) => {
				expect(await readPerformerOwnership(trx, SOURCE_REDUCTION_REF, mine, org, technician)).toBe(
					'owner',
				);
				expect(
					await readPerformerOwnership(trx, SOURCE_REDUCTION_REF, theirs, org, technician),
				).toBe('not_performer');
				expect(
					await readPerformerOwnership(trx, SOURCE_REDUCTION_REF, unattributed, org, technician),
				).toBe('not_performer');
				expect(
					await readPerformerOwnership(trx, SOURCE_REDUCTION_REF, stale, org, technician),
				).toBe('window_expired');
			});
		});
	});

	it('measures the correction window from the action date, not from when it was written', async () => {
		await withTestDb(async ({ db }) => {
			// Backfilling last month's work must not buy a fresh month to change it
			// in. The row is created now; only `source_reduction_date` is old.
			const org = await createOrganization(db, 'performer_backfill');
			const technician = await createProfile(db, org, 'Technician');
			const method = await createSourceReductionMethod(db, org);
			const unit = await createUnit(db);
			const backfilled = await createSourceReduction(db, org, method, unit, {
				by: technician,
				daysAgo: ACTION_CORRECTION_WINDOW_DAYS + 5,
			});

			await db.transaction().execute(async (trx) => {
				expect(
					await readPerformerOwnership(trx, SOURCE_REDUCTION_REF, backfilled, org, technician),
				).toBe('window_expired');
			});
		});
	});

	// -----------------------------------------------------------------------
	// Assignment snapshot
	// -----------------------------------------------------------------------

	it('counts stops the same way reading each one and asking would', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'snapshot_counts');
			const assignment = await createAssignment(db, org, { assignedTo: null, started: true });
			await createAssignmentItem(db, org, assignment, {});
			await createAssignmentItem(db, org, assignment, {});
			await createAssignmentItem(db, org, assignment, { completed: true });
			await createAssignmentItem(db, org, assignment, { skipped: true });
			const gone = await createAssignmentItem(db, org, assignment, {});
			await softDelete(db, 'assignment_items', gone);

			const snapshot = await db
				.transaction()
				.execute(async (trx) => loadAssignmentSnapshot(trx, assignment, org));

			// The two are different expressions of the same rule now — a filtered
			// `count(*)` in SQL, and `readAssignmentItemState` per row — so the test
			// is that they agree rather than that either matches a literal.
			const rows = await db
				.selectFrom('assignment_items')
				.select(['completed_at', 'skipped_at'])
				.where('assignment_id', '=', assignment)
				.where('organization_id', '=', org)
				.where('deleted_at', 'is', null)
				.execute();
			const pendingByRow = rows.filter((row) => readAssignmentItemState(row) === 'pending').length;

			expect(snapshot).not.toBeNull();
			expect(snapshot?.activeItemCount).toBe(rows.length);
			expect(snapshot?.pendingItemCount).toBe(pendingByRow);
			// And the literals, so a change that broke both together still fails.
			expect(snapshot?.activeItemCount).toBe(4);
			expect(snapshot?.pendingItemCount).toBe(2);
			expect(snapshot?.state).toBe('in_progress');
		});
	});

	it('does not find another organization’s assignment or a deleted one', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'snapshot_scope');
			const otherOrg = await createOrganization(db, 'snapshot_scope_other');
			const assignment = await createAssignment(db, org, { assignedTo: null, started: true });
			const deleted = await createAssignment(db, org, { assignedTo: null, started: true });
			await softDelete(db, 'assignments', deleted);

			await db.transaction().execute(async (trx) => {
				expect(await loadAssignmentSnapshot(trx, assignment, otherOrg)).toBeNull();
				expect(await loadAssignmentSnapshot(trx, deleted, org)).toBeNull();
			});
		});
	});

	it('serializes two crews completing the same assignment rather than letting both read stale', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'snapshot_lock');
			const assignment = await createAssignment(db, org, { assignedTo: null, started: true });
			await createAssignmentItem(db, org, assignment, { completed: true });

			const order: string[] = [];

			// The first transaction takes the lock, holds it while it writes, and
			// commits. Without `for update` the second would read the pre-completion
			// state and both would commit a completion.
			const first = db.transaction().execute(async (trx) => {
				const snapshot = await loadAssignmentSnapshot(trx, assignment, org);
				order.push(`first-read:${snapshot?.state}`);
				await sleep(400);
				await trx
					.updateTable('assignments')
					.set({ completed_at: sql`now()` })
					.where('id', '=', assignment)
					.execute();
				order.push('first-write');
			});

			const second = (async () => {
				// Long enough that the first is certainly holding the row lock, short
				// enough to be well inside its sleep.
				await sleep(150);
				await db.transaction().execute(async (trx) => {
					const snapshot = await loadAssignmentSnapshot(trx, assignment, org);
					order.push(`second-read:${snapshot?.state}`);
				});
			})();

			await Promise.all([first, second]);

			// The second read waited for the first to commit and then saw its result,
			// which is the whole point: the precondition it checks is the one it will
			// write against.
			expect(order).toEqual(['first-read:in_progress', 'first-write', 'second-read:completed']);
		});
	});

	// -----------------------------------------------------------------------
	// Deletion escalations
	// -----------------------------------------------------------------------

	/**
	 * The unit tests prove which escalation fires; only a database proves the
	 * reads find the rows at all. The polymorphic `entity_type` is the reason —
	 * the support tables store `source_reduction`, the domain says
	 * `sourceReduction`, and a mismatch there reads as "nothing depends on this"
	 * and quietly hands a collector a delete the doc reserves for a manager.
	 */
	it('finds the rows that escalate a collector’s own delete', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'escalation');
			const collector = await createProfile(db, org, 'Collector');
			const helper = await createProfile(db, org, 'Helper');
			const method = await createSourceReductionMethod(db, org);
			const unit = await createUnit(db);
			const actor = { role: 'collector' as const, profileId: collector };

			const standalone = await createSourceReduction(db, org, method, unit, {
				by: collector,
				daysAgo: 1,
			});
			const withHelper = await createSourceReduction(db, org, method, unit, {
				by: collector,
				daysAgo: 1,
			});
			await db
				.insertInto('additional_personnel')
				.values({
					organization_id: org,
					personnel_profile_id: helper,
					entity_type: 'source_reduction',
					entity_id: withHelper,
				})
				.execute();

			const request = await createRequestedControlAction(db, org, collector);
			const answering = await createSourceReduction(db, org, method, unit, {
				by: collector,
				daysAgo: 1,
			});
			await db
				.updateTable('source_reductions')
				.set({ requested_control_action_id: request })
				.where('id', '=', answering)
				.execute();

			await db.transaction().execute(async (trx) => {
				expect(await deleteOwnership(trx, standalone, org, actor)).toEqual({ kind: 'allowed' });
				expect(await deleteOwnership(trx, withHelper, org, actor)).toMatchObject({
					kind: 'refused',
					reason: expect.stringContaining('assisting personnel'),
				});
				expect(await deleteOwnership(trx, answering, org, actor)).toMatchObject({
					kind: 'refused',
					reason: expect.stringContaining('requested control action'),
				});

				// The request is now referenced by the action above, so its own delete
				// escalates too — and that read crosses four action tables by a column
				// name, which is the other thing a fake cannot check.
				expect(
					await resolveCommandOwnership(
						trx,
						{
							type: 'controlOperations.deleteRequestedControlAction',
							payload: { organizationId: org, requestedControlActionId: request },
						},
						actor,
					),
				).toMatchObject({ kind: 'refused', reason: expect.stringContaining('referenced') });
			});
		});
	});
});

function deleteOwnership(
	trx: Transaction<SimmerDatabase>,
	sourceReductionId: string,
	organizationId: string,
	actor: { readonly role: 'collector'; readonly profileId: string },
) {
	return resolveCommandOwnership(
		trx,
		{
			type: 'controlOperations.deleteSourceReduction',
			payload: { organizationId, sourceReductionId },
		},
		actor,
	);
}

// ===========================================================================
// Fixtures
// ===========================================================================

type Db = Kysely<SimmerDatabase>;

const SOURCE_REDUCTION_REF: PerformedRecordRef = {
	table: 'source_reductions',
	payloadKey: 'sourceReductionId',
	performerColumn: 'technician_profile_id',
	performedOnColumn: 'source_reduction_date',
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stops are ordered per assignment; a shared counter keeps them distinct. */
let nextPosition = 1;

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

async function createAssignment(
	db: Db,
	organizationId: string,
	options: { readonly assignedTo: string | null; readonly started?: boolean },
): Promise<string> {
	const row = await db
		.insertInto('assignments')
		.values({
			organization_id: organizationId,
			assigned_to_profile_id: options.assignedTo,
			assignment_date: sql`current_date`,
			...(options.started === true ? { started_at: sql`now()` } : {}),
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

/**
 * A stop on an assignment.
 *
 * Each gets its own habitat: `assignment_items_assignment_entity_unique` means
 * one assignment cannot visit the same site twice, so reusing an id here would
 * fail on the second stop rather than testing anything.
 */
async function createAssignmentItem(
	db: Db,
	organizationId: string,
	assignmentId: string,
	state: { readonly completed?: boolean; readonly skipped?: boolean },
): Promise<string> {
	const habitatId = await createHabitat(db, organizationId);
	const row = await db
		.insertInto('assignment_items')
		.values({
			organization_id: organizationId,
			assignment_id: assignmentId,
			entity_type: 'habitat',
			entity_id: habitatId,
			position: nextPosition++,
			...(state.completed === true ? { completed_at: sql`now()` } : {}),
			...(state.skipped === true ? { skipped_at: sql`now()`, skip_reason: 'Locked gate' } : {}),
		})
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

async function createComment(
	db: Db,
	organizationId: string,
	habitatId: string,
	authorProfileId: string,
	daysAgo: number,
): Promise<string> {
	const row = await db
		.insertInto('comments')
		.values({
			organization_id: organizationId,
			entity_type: 'habitat',
			entity_id: habitatId,
			comment_text: 'Standing water at the north end.',
			commented_by_profile_id: authorProfileId,
			commented_at: sql`now() - ${`${daysAgo} days`}::interval`,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createSourceReductionMethod(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('source_reduction_methods')
		.values({ organization_id: organizationId, name: 'Ditch clearing' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createUnit(db: Db): Promise<string> {
	const row = await db
		.insertInto('units')
		.values({
			code: 'test_sources',
			unit_name: 'sources',
			abbreviation: 'src',
			unit_type: 'count',
			unit_system: 'si',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createSourceReduction(
	db: Db,
	organizationId: string,
	methodId: string,
	unitId: string,
	options: { readonly by: string | null; readonly daysAgo: number },
): Promise<string> {
	const row = await db
		.insertInto('source_reductions')
		.values({
			organization_id: organizationId,
			source_reduction_method_id: methodId,
			technician_profile_id: options.by,
			source_reduction_date: sql`current_date - ${`${options.daysAgo} days`}::interval`,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			sources_eliminated_amount: 3,
			sources_eliminated_unit_id: unitId,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createRequestedControlAction(
	db: Db,
	organizationId: string,
	requestedBy: string,
): Promise<string> {
	const row = await db
		.insertInto('requested_control_actions')
		.values({
			organization_id: organizationId,
			control_type: 'source_reduction',
			summary: 'Clear the ditch behind the school.',
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			requested_by_profile_id: requestedBy,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function softDelete(
	db: Db,
	table: 'assignments' | 'assignment_items' | 'comments',
	id: string,
): Promise<void> {
	await db.updateTable(table).set({ deleted_at: sql`now()` }).where('id', '=', id).execute();
}
