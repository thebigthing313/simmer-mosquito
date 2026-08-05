import { type Kysely, sql, type Transaction } from 'kysely';
import type { MembershipStatus, SimmerDatabase, SimmerRole } from '../index.js';

type DbExecutor = Kysely<SimmerDatabase> | Transaction<SimmerDatabase>;

/**
 * The rows needed to verify the role ladder end to end.
 *
 * Role enforcement is unit-tested (`command-permissions.test.ts`) and now
 * covered against Postgres (`command-authorization.integration.test.ts`), but
 * neither exercises the ladder the way a person does: signed in, clicking, and
 * being refused. Only the Owner and Viewer halves could ever be checked that
 * way, because those were the only accounts that existed.
 *
 * This seeds one profile and membership per role, plus the *states* the
 * ownership rules turn on. Those are the part that cannot be produced by
 * clicking:
 *
 * - an assignment assigned to the collector, and one assigned to somebody else
 * - an assignment assigned to nobody, which a collector must also be refused
 * - an assignment with a mix of pending, completed, and skipped stops, for the
 *   `assignment_items_pending` / `assignment_has_no_items` preconditions
 * - a comment by the collector inside the correction window, and one **more
 *   than thirty days old**, which needs a backdated `commented_at` and is
 *   otherwise unreachable
 * - a control action performed by the collector, and one performed long enough
 *   ago that the correction window has closed
 *
 * What this cannot do is create the WorkOS users. SIMMER's identity lives in
 * WorkOS and a login has to exist there first; `workosUserId` on each role below
 * is where you paste the id once you have. Without one, the profile and its
 * membership still exist and every API-driven check works — it is only the
 * browser half that needs the account.
 */

/** A stable organization id, so re-running the seed updates rather than duplicates. */
export const ROLE_LADDER_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000201';

export interface RoleLadderPerson {
	readonly key: string;
	readonly profileId: string;
	readonly membershipId: string;
	readonly displayName: string;
	readonly email: string;
	readonly role: SimmerRole;
}

/**
 * One profile per rung, plus a second collector.
 *
 * The second collector is not padding: every ownership rule has a "somebody
 * else's" case, and testing it against the manager's profile would conflate
 * "not yours" with "not your role".
 */
export const roleLadderPeople = [
	{
		key: 'owner',
		profileId: '00000000-0000-4000-8000-000000002001',
		membershipId: '00000000-0000-4000-8000-000000002011',
		displayName: 'Olive Owner',
		email: 'olive.owner@example.test',
		role: 'owner',
	},
	{
		key: 'admin',
		profileId: '00000000-0000-4000-8000-000000002002',
		membershipId: '00000000-0000-4000-8000-000000002012',
		displayName: 'Adam Admin',
		email: 'adam.admin@example.test',
		role: 'admin',
	},
	{
		key: 'manager',
		profileId: '00000000-0000-4000-8000-000000002003',
		membershipId: '00000000-0000-4000-8000-000000002013',
		displayName: 'Mara Manager',
		email: 'mara.manager@example.test',
		role: 'manager',
	},
	{
		key: 'collector',
		profileId: '00000000-0000-4000-8000-000000002004',
		membershipId: '00000000-0000-4000-8000-000000002014',
		displayName: 'Casey Collector',
		email: 'casey.collector@example.test',
		role: 'collector',
	},
	{
		key: 'otherCollector',
		profileId: '00000000-0000-4000-8000-000000002005',
		membershipId: '00000000-0000-4000-8000-000000002015',
		displayName: 'Quinn Collector',
		email: 'quinn.collector@example.test',
		role: 'collector',
	},
	{
		key: 'viewer',
		profileId: '00000000-0000-4000-8000-000000002006',
		membershipId: '00000000-0000-4000-8000-000000002016',
		displayName: 'Vera Viewer',
		email: 'vera.viewer@example.test',
		role: 'viewer',
	},
] as const satisfies readonly RoleLadderPerson[];

export type RoleLadderKey = (typeof roleLadderPeople)[number]['key'];

/** WorkOS user ids to link, keyed by person. Absent means "profile only". */
export type WorkosUserIds = Partial<Record<RoleLadderKey, string>>;

/** The fixture ids, so a test or a checklist can name the rows it is about. */
export const roleLadderIds = {
	organizationId: ROLE_LADDER_ORGANIZATION_ID,
	habitatId: '00000000-0000-4000-8000-000000002101',
	/** Assigned to the collector: their own work, which they may progress. */
	ownAssignmentId: '00000000-0000-4000-8000-000000002201',
	/** Assigned to the other collector: refused with "assigned to them". */
	otherAssignmentId: '00000000-0000-4000-8000-000000002202',
	/** Assigned to nobody: also refused, and the case most likely to be missed. */
	unassignedAssignmentId: '00000000-0000-4000-8000-000000002203',
	/** Started, with one stop pending — so completing it is refused, not allowed. */
	mixedAssignmentId: '00000000-0000-4000-8000-000000002204',
	/** Started with no stops at all, for `assignment_has_no_items`. */
	emptyAssignmentId: '00000000-0000-4000-8000-000000002205',
	freshCommentId: '00000000-0000-4000-8000-000000002301',
	/** Backdated past the 30-day window. Cannot be produced by clicking. */
	expiredCommentId: '00000000-0000-4000-8000-000000002302',
	otherAuthorCommentId: '00000000-0000-4000-8000-000000002303',
	sourceReductionMethodId: '00000000-0000-4000-8000-000000002401',
	unitId: '00000000-0000-4000-8000-000000002402',
	/** Performed by the collector, recently: theirs to correct. */
	ownActionId: '00000000-0000-4000-8000-000000002403',
	/** Performed by the collector, but older than the correction window. */
	staleActionId: '00000000-0000-4000-8000-000000002404',
	/** Performed by somebody else. */
	otherActionId: '00000000-0000-4000-8000-000000002405',
} as const;

export interface SeedRoleLadderOptions {
	readonly organizationId?: string;
	/**
	 * WorkOS user ids for the accounts that exist. Anyone omitted gets a profile
	 * and a membership with no login, which is enough for API-driven checks and
	 * for appearing as an assignee.
	 */
	readonly workosUserIds?: WorkosUserIds;
}

export interface SeedRoleLadderResult {
	readonly organizationId: string;
	readonly profileCount: number;
	readonly linkedUserCount: number;
	readonly assignmentCount: number;
	readonly commentCount: number;
	readonly actionCount: number;
}

/** How old the expired fixtures are, in days: comfortably past both 30-day windows. */
const PAST_THE_WINDOW_DAYS = 45;

export async function seedRoleLadder(
	db: Kysely<SimmerDatabase>,
	options: SeedRoleLadderOptions = {},
): Promise<SeedRoleLadderResult> {
	const organizationId = options.organizationId ?? ROLE_LADDER_ORGANIZATION_ID;
	const workosUserIds = options.workosUserIds ?? {};

	await db.transaction().execute(async (trx) => {
		await upsertOrganization(trx, organizationId);
		await upsertPeople(trx, organizationId, workosUserIds);
		await upsertHabitat(trx, organizationId);
		await upsertAssignments(trx, organizationId);
		await upsertComments(trx, organizationId);
		await upsertControlActions(trx, organizationId);
	});

	return {
		organizationId,
		profileCount: roleLadderPeople.length,
		linkedUserCount: Object.keys(workosUserIds).length,
		assignmentCount: 5,
		commentCount: 3,
		actionCount: 3,
	};
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

async function upsertOrganization(trx: DbExecutor, organizationId: string): Promise<void> {
	await trx
		.insertInto('organizations')
		.values({
			id: organizationId,
			workos_organization_id: `workos_role_ladder_${organizationId.slice(-6)}`,
			name: 'Role Ladder Test District',
		})
		.onConflict((conflict) =>
			conflict.column('id').doUpdateSet({ name: 'Role Ladder Test District' }),
		)
		.execute();
}

async function upsertPeople(
	trx: DbExecutor,
	organizationId: string,
	workosUserIds: WorkosUserIds,
): Promise<void> {
	for (const person of roleLadderPeople) {
		await trx
			.insertInto('profiles')
			.values({
				id: person.profileId,
				organization_id: organizationId,
				display_name: person.displayName,
				email: person.email,
				is_active: true,
			})
			.onConflict((conflict) =>
				conflict.column('id').doUpdateSet({ display_name: person.displayName, is_active: true }),
			)
			.execute();

		// A membership exists whether or not there is a login behind it: it is what
		// carries the role, and the role is what is being tested.
		//
		// `memberships_user_or_invited_email_check` requires one or the other, so
		// an unlinked person is an *invited* membership carrying their address —
		// which is also what they are, until somebody creates the WorkOS account.
		// Conflict is on the fixed id rather than on organization+profile, because
		// no unique index covers that pair.
		const workosUserId = workosUserIds[person.key];
		const userId =
			workosUserId === undefined
				? null
				: await upsertUser(trx, workosUserId, person.displayName, person.email);
		const membership = {
			role: person.role,
			status: (userId === null ? 'invited' : 'active') as MembershipStatus,
			user_id: userId,
			invited_email: userId === null ? person.email : null,
		};

		await trx
			.insertInto('memberships')
			.values({
				id: person.membershipId,
				organization_id: organizationId,
				profile_id: person.profileId,
				is_default: true,
				...membership,
			})
			.onConflict((conflict) => conflict.column('id').doUpdateSet(membership))
			.execute();
	}
}

async function upsertUser(
	trx: DbExecutor,
	workosUserId: string,
	displayName: string,
	email: string,
): Promise<string> {
	const row = await trx
		.insertInto('users')
		.values({
			workos_user_id: workosUserId,
			email,
			display_name: displayName,
			email_verified: true,
		})
		.onConflict((conflict) =>
			conflict.column('workos_user_id').doUpdateSet({ email, display_name: displayName }),
		)
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function upsertHabitat(trx: DbExecutor, organizationId: string): Promise<void> {
	await trx
		.insertInto('habitats')
		.values({
			id: roleLadderIds.habitatId,
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			habitat_name: 'Role ladder ditch',
			description: 'The site every fixture below hangs off.',
			metadata: null,
		})
		.onConflict((conflict) => conflict.column('id').doNothing())
		.execute();
}

async function upsertAssignments(trx: DbExecutor, organizationId: string): Promise<void> {
	const collector = person('collector');
	const other = person('otherCollector');
	const manager = person('manager');

	await upsertAssignment(trx, organizationId, {
		id: roleLadderIds.ownAssignmentId,
		name: 'Assigned to Casey',
		assignedTo: collector.profileId,
		assignedBy: manager.profileId,
		started: false,
	});
	await upsertAssignment(trx, organizationId, {
		id: roleLadderIds.otherAssignmentId,
		name: 'Assigned to Quinn',
		assignedTo: other.profileId,
		assignedBy: manager.profileId,
		started: false,
	});
	await upsertAssignment(trx, organizationId, {
		id: roleLadderIds.unassignedAssignmentId,
		name: 'Assigned to nobody',
		assignedTo: null,
		assignedBy: manager.profileId,
		started: false,
	});
	await upsertAssignment(trx, organizationId, {
		id: roleLadderIds.mixedAssignmentId,
		name: 'Started, one stop still pending',
		assignedTo: collector.profileId,
		assignedBy: manager.profileId,
		started: true,
	});
	await upsertAssignment(trx, organizationId, {
		id: roleLadderIds.emptyAssignmentId,
		name: 'Started with no stops',
		assignedTo: collector.profileId,
		assignedBy: manager.profileId,
		started: true,
	});

	// Three stops on the mixed assignment: one done, one skipped, one pending. The
	// pending one is what makes `completeAssignment` refuse, which is the
	// precondition with no other way to reach it.
	await upsertAssignmentItem(trx, organizationId, roleLadderIds.mixedAssignmentId, 1, 'completed');
	await upsertAssignmentItem(trx, organizationId, roleLadderIds.mixedAssignmentId, 2, 'skipped');
	await upsertAssignmentItem(trx, organizationId, roleLadderIds.mixedAssignmentId, 3, 'pending');
}

async function upsertAssignment(
	trx: DbExecutor,
	organizationId: string,
	input: {
		readonly id: string;
		readonly name: string;
		readonly assignedTo: string | null;
		readonly assignedBy: string;
		readonly started: boolean;
	},
): Promise<void> {
	await trx
		.insertInto('assignments')
		.values({
			id: input.id,
			organization_id: organizationId,
			assignment_name: input.name,
			assigned_to_profile_id: input.assignedTo,
			assigned_by_profile_id: input.assignedBy,
			assignment_date: sql`current_date`,
			...(input.started ? { started_at: sql`now()` } : {}),
		})
		.onConflict((conflict) =>
			conflict.column('id').doUpdateSet({
				assignment_name: input.name,
				assigned_to_profile_id: input.assignedTo,
				started_at: input.started ? sql`now()` : null,
				completed_at: null,
				cancelled_at: null,
				deleted_at: null,
			}),
		)
		.execute();
}

async function upsertAssignmentItem(
	trx: DbExecutor,
	organizationId: string,
	assignmentId: string,
	position: number,
	state: 'pending' | 'completed' | 'skipped',
): Promise<void> {
	const itemId = `00000000-0000-4000-8000-00000000220${position + 5}`;
	// Each stop needs its own entity: an assignment cannot visit the same site
	// twice (`assignment_items_assignment_entity_unique`).
	const habitatId = `00000000-0000-4000-8000-00000000210${position + 1}`;
	await trx
		.insertInto('habitats')
		.values({
			id: habitatId,
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(${-90.5 + position * 0.01}, 35.5), 4326)`,
			habitat_name: `Role ladder stop ${position}`,
			description: 'A stop on the mixed-state assignment.',
			metadata: null,
		})
		.onConflict((conflict) => conflict.column('id').doNothing())
		.execute();

	await trx
		.insertInto('assignment_items')
		.values({
			id: itemId,
			organization_id: organizationId,
			assignment_id: assignmentId,
			entity_type: 'habitat',
			entity_id: habitatId,
			position,
			...(state === 'completed'
				? { completed_at: sql`now()`, completed_by_profile_id: person('collector').profileId }
				: {}),
			...(state === 'skipped'
				? {
						skipped_at: sql`now()`,
						skipped_by_profile_id: person('collector').profileId,
						skip_reason: 'Locked gate',
					}
				: {}),
		})
		.onConflict((conflict) => conflict.column('id').doNothing())
		.execute();
}

async function upsertComments(trx: DbExecutor, organizationId: string): Promise<void> {
	const collector = person('collector');
	const other = person('otherCollector');

	await upsertComment(trx, organizationId, {
		id: roleLadderIds.freshCommentId,
		author: collector.profileId,
		text: 'Standing water at the north end.',
		daysAgo: 0,
	});
	// The one that matters: the author's own comment, past the correction window.
	await upsertComment(trx, organizationId, {
		id: roleLadderIds.expiredCommentId,
		author: collector.profileId,
		text: 'Old note, outside the correction window.',
		daysAgo: PAST_THE_WINDOW_DAYS,
	});
	await upsertComment(trx, organizationId, {
		id: roleLadderIds.otherAuthorCommentId,
		author: other.profileId,
		text: 'Somebody else’s note.',
		daysAgo: 0,
	});
}

async function upsertComment(
	trx: DbExecutor,
	organizationId: string,
	input: {
		readonly id: string;
		readonly author: string;
		readonly text: string;
		readonly daysAgo: number;
	},
): Promise<void> {
	await trx
		.insertInto('comments')
		.values({
			id: input.id,
			organization_id: organizationId,
			entity_type: 'habitat',
			entity_id: roleLadderIds.habitatId,
			comment_text: input.text,
			commented_by_profile_id: input.author,
			commented_at: sql`now() - ${`${input.daysAgo} days`}::interval`,
		})
		.onConflict((conflict) =>
			conflict.column('id').doUpdateSet({
				commented_at: sql`now() - ${`${input.daysAgo} days`}::interval`,
				deleted_at: null,
			}),
		)
		.execute();
}

async function upsertControlActions(trx: DbExecutor, organizationId: string): Promise<void> {
	await trx
		.insertInto('units')
		.values({
			id: roleLadderIds.unitId,
			code: 'role_ladder_sources',
			unit_name: 'sources',
			abbreviation: 'src',
			unit_type: 'count',
			unit_system: 'si',
		})
		.onConflict((conflict) => conflict.column('id').doNothing())
		.execute();

	await trx
		.insertInto('source_reduction_methods')
		.values({
			id: roleLadderIds.sourceReductionMethodId,
			organization_id: organizationId,
			name: 'Role ladder ditch clearing',
		})
		.onConflict((conflict) => conflict.column('id').doNothing())
		.execute();

	await upsertSourceReduction(trx, organizationId, {
		id: roleLadderIds.ownActionId,
		by: person('collector').profileId,
		daysAgo: 1,
	});
	// Same performer, outside the window: the case that separates "yours" from
	// "yours and recent".
	await upsertSourceReduction(trx, organizationId, {
		id: roleLadderIds.staleActionId,
		by: person('collector').profileId,
		daysAgo: PAST_THE_WINDOW_DAYS,
	});
	await upsertSourceReduction(trx, organizationId, {
		id: roleLadderIds.otherActionId,
		by: person('otherCollector').profileId,
		daysAgo: 1,
	});
}

async function upsertSourceReduction(
	trx: DbExecutor,
	organizationId: string,
	input: { readonly id: string; readonly by: string; readonly daysAgo: number },
): Promise<void> {
	await trx
		.insertInto('source_reductions')
		.values({
			id: input.id,
			organization_id: organizationId,
			source_reduction_method_id: roleLadderIds.sourceReductionMethodId,
			technician_profile_id: input.by,
			source_reduction_date: sql`current_date - ${`${input.daysAgo} days`}::interval`,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			sources_eliminated_amount: 3,
			sources_eliminated_unit_id: roleLadderIds.unitId,
			habitat_id: roleLadderIds.habitatId,
		})
		.onConflict((conflict) =>
			conflict.column('id').doUpdateSet({
				technician_profile_id: input.by,
				source_reduction_date: sql`current_date - ${`${input.daysAgo} days`}::interval`,
				deleted_at: null,
			}),
		)
		.execute();
}

function person(key: RoleLadderKey): RoleLadderPerson {
	const found = roleLadderPeople.find((candidate) => candidate.key === key);
	if (found === undefined) {
		throw new Error(`Unknown role ladder person: ${key}`);
	}
	return found;
}
