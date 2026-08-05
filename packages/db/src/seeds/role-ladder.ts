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

/**
 * A WorkOS account to link a fixture profile to.
 *
 * `email` is optional and only affects what `users.email` says before that
 * account's first sign-in — `upsertWorkOsIdentity` overwrites it from WorkOS on
 * every login, and the link itself is by `workosUserId`. Supply it anyway when
 * the real address differs from the fixture's, which it will: the practical way
 * to get several test logins out of one mailbox is plus-addressing
 * (`you+simmer-collector@gmail.com`), and a `users` row claiming
 * `casey.collector@example.test` is a confusing thing to read.
 */
export interface WorkosAccount {
	readonly workosUserId: string;
	readonly email?: string;
}

/** WorkOS accounts to link, keyed by person. Absent means "profile only". */
export type WorkosUserIds = Partial<Record<RoleLadderKey, string | WorkosAccount>>;

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
	/** Performed by the collector, recently: theirs to correct. */
	ownActionId: '00000000-0000-4000-8000-000000002403',
	/** Performed by the collector, but older than the correction window. */
	staleActionId: '00000000-0000-4000-8000-000000002404',
	/** Performed by somebody else. */
	otherActionId: '00000000-0000-4000-8000-000000002405',
} as const;

/**
 * Profiles that already exist, keyed by role.
 *
 * The case this is for: real accounts have been invited into a real agency, so
 * each role already has a profile with a role that came from a genuine
 * invitation. Naming those here makes the fixtures below belong to the account
 * that will actually sign in — an assignment "assigned to the collector" is
 * assigned to *them*, not to a stand-in they have no way to be.
 *
 * A named profile is left completely untouched: no profile write, no membership
 * write, so nothing this seed does can change a role somebody set deliberately.
 */
export type ExistingProfileIds = Partial<Record<RoleLadderKey, string>>;

/** Resolves a role to the profile id the fixtures should use. */
type ProfileResolver = (key: RoleLadderKey) => string;

export interface SeedRoleLadderOptions {
	readonly organizationId?: string;
	/**
	 * WorkOS user ids for the accounts that exist. Anyone omitted gets a profile
	 * and a membership with no login, which is enough for API-driven checks and
	 * for appearing as an assignee.
	 */
	readonly workosUserIds?: WorkosUserIds;
	/** Existing profiles to attach the fixtures to instead of creating stand-ins. */
	readonly existingProfileIds?: ExistingProfileIds;
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
	const existingProfileIds = options.existingProfileIds ?? {};
	const profileId: ProfileResolver = (key) => existingProfileIds[key] ?? person(key).profileId;

	await db.transaction().execute(async (trx) => {
		await upsertOrganization(trx, organizationId);
		await upsertPeople(trx, organizationId, workosUserIds, existingProfileIds);
		await upsertHabitat(trx, organizationId);
		await upsertAssignments(trx, organizationId, profileId);
		await upsertComments(trx, organizationId, profileId);
		await upsertControlActions(trx, organizationId, profileId);
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

/**
 * The organization the fixtures hang off — created only if it is not already
 * there.
 *
 * `doNothing`, emphatically not `doUpdateSet`: pointing this at an agency that
 * already exists is the *expected* use once real accounts have been invited into
 * one, and an upsert that set the name would rename a live organization to
 * "Role Ladder Test District" on the way past.
 */
async function upsertOrganization(trx: DbExecutor, organizationId: string): Promise<void> {
	await trx
		.insertInto('organizations')
		.values({
			id: organizationId,
			workos_organization_id: `workos_role_ladder_${organizationId.slice(-6)}`,
			name: 'Role Ladder Test District',
		})
		.onConflict((conflict) => conflict.column('id').doNothing())
		.execute();
}

async function upsertPeople(
	trx: DbExecutor,
	organizationId: string,
	workosUserIds: WorkosUserIds,
	existingProfileIds: ExistingProfileIds,
): Promise<void> {
	for (const person of roleLadderPeople) {
		// A profile that already exists is left entirely alone — no profile write,
		// no membership write. Its role came from a real invitation and its display
		// name is what somebody chose; this seed only needs its id, so the fixtures
		// below can belong to the account that will actually sign in.
		if (existingProfileIds[person.key] !== undefined) {
			continue;
		}

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
		const account = toWorkosAccount(workosUserIds[person.key]);
		const userId =
			account === null
				? null
				: await upsertUser(
						trx,
						account.workosUserId,
						person.displayName,
						// The real address when one was given: this row is what somebody
						// reads to work out which login is which.
						account.email ?? person.email,
					);
		const membership = {
			role: person.role,
			status: (userId === null ? 'invited' : 'active') as MembershipStatus,
			user_id: userId,
			// `is_default` is unique per user, so a person who already belongs
			// somewhere cannot claim it again.
			is_default: userId === null,
			invited_email: userId === null ? person.email : null,
		};

		await trx
			.insertInto('memberships')
			.values({
				id: person.membershipId,
				organization_id: organizationId,
				profile_id: person.profileId,
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

async function upsertAssignments(
	trx: DbExecutor,
	organizationId: string,
	profileId: ProfileResolver,
): Promise<void> {
	const collector = { profileId: profileId('collector') };
	const other = { profileId: profileId('otherCollector') };
	const manager = { profileId: profileId('manager') };

	await upsertAssignment(trx, organizationId, {
		id: roleLadderIds.ownAssignmentId,
		name: 'Role ladder — assigned to the collector',
		assignedTo: collector.profileId,
		assignedBy: manager.profileId,
		started: false,
	});
	await upsertAssignment(trx, organizationId, {
		id: roleLadderIds.otherAssignmentId,
		name: 'Role ladder — assigned to another collector',
		assignedTo: other.profileId,
		assignedBy: manager.profileId,
		started: false,
	});
	await upsertAssignment(trx, organizationId, {
		id: roleLadderIds.unassignedAssignmentId,
		name: 'Role ladder — assigned to nobody',
		assignedTo: null,
		assignedBy: manager.profileId,
		started: false,
	});
	await upsertAssignment(trx, organizationId, {
		id: roleLadderIds.mixedAssignmentId,
		name: 'Role ladder — started, one stop pending',
		assignedTo: collector.profileId,
		assignedBy: manager.profileId,
		started: true,
	});
	await upsertAssignment(trx, organizationId, {
		id: roleLadderIds.emptyAssignmentId,
		name: 'Role ladder — started with no stops',
		assignedTo: collector.profileId,
		assignedBy: manager.profileId,
		started: true,
	});

	// Three stops on the mixed assignment: one done, one skipped, one pending. The
	// pending one is what makes `completeAssignment` refuse, which is the
	// precondition with no other way to reach it.
	await upsertAssignmentItem(
		trx,
		organizationId,
		roleLadderIds.mixedAssignmentId,
		1,
		'completed',
		profileId,
	);
	await upsertAssignmentItem(
		trx,
		organizationId,
		roleLadderIds.mixedAssignmentId,
		2,
		'skipped',
		profileId,
	);
	await upsertAssignmentItem(
		trx,
		organizationId,
		roleLadderIds.mixedAssignmentId,
		3,
		'pending',
		profileId,
	);
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
	profileId: ProfileResolver,
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
				? { completed_at: sql`now()`, completed_by_profile_id: profileId('collector') }
				: {}),
			...(state === 'skipped'
				? {
						skipped_at: sql`now()`,
						skipped_by_profile_id: profileId('collector'),
						skip_reason: 'Locked gate',
					}
				: {}),
		})
		.onConflict((conflict) => conflict.column('id').doNothing())
		.execute();
}

async function upsertComments(
	trx: DbExecutor,
	organizationId: string,
	profileId: ProfileResolver,
): Promise<void> {
	const collector = { profileId: profileId('collector') };
	const other = { profileId: profileId('otherCollector') };

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

async function upsertControlActions(
	trx: DbExecutor,
	organizationId: string,
	profileId: ProfileResolver,
): Promise<void> {
	const unitId = await resolveCountUnit(trx);

	await trx
		.insertInto('source_reduction_methods')
		.values({
			id: roleLadderIds.sourceReductionMethodId,
			organization_id: organizationId,
			name: 'Role ladder ditch clearing',
		})
		.onConflict((conflict) => conflict.column('id').doNothing())
		.execute();

	await upsertSourceReduction(trx, organizationId, unitId, {
		id: roleLadderIds.ownActionId,
		by: profileId('collector'),
		daysAgo: 1,
	});
	// Same performer, outside the window: the case that separates "yours" from
	// "yours and recent".
	await upsertSourceReduction(trx, organizationId, unitId, {
		id: roleLadderIds.staleActionId,
		by: profileId('collector'),
		daysAgo: PAST_THE_WINDOW_DAYS,
	});
	await upsertSourceReduction(trx, organizationId, unitId, {
		id: roleLadderIds.otherActionId,
		by: profileId('otherCollector'),
		daysAgo: 1,
	});
}

async function upsertSourceReduction(
	trx: DbExecutor,
	organizationId: string,
	unitId: string,
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
			sources_eliminated_unit_id: unitId,
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

/** Accepts a bare WorkOS id for the common case, or an account with its email. */
function toWorkosAccount(value: string | WorkosAccount | undefined): WorkosAccount | null {
	if (value === undefined) {
		return null;
	}
	return typeof value === 'string' ? { workosUserId: value } : value;
}

/**
 * A unit for the fixture's "3 sources eliminated", preferring one that exists.
 *
 * `units` is **global** — no `organization_id` — so inserting a fixture unit
 * would put `role_ladder_sources` in every agency's picker, in every environment
 * this seed is ever run against, permanently. Reusing a count unit avoids that;
 * the fixture only needs the source reduction to be valid, and which unit it
 * carries is incidental to every rule being tested.
 *
 * It creates one only when the database has no count unit at all, which is a
 * bare schema rather than any real environment.
 */
async function resolveCountUnit(trx: DbExecutor): Promise<string> {
	const existing = await trx
		.selectFrom('units')
		.select(['id'])
		.where('unit_type', '=', 'count')
		.orderBy('code')
		.executeTakeFirst();
	if (existing !== undefined) {
		return existing.id;
	}

	const created = await trx
		.insertInto('units')
		.values({
			code: 'count',
			unit_name: 'count',
			abbreviation: 'ct',
			unit_type: 'count',
			unit_system: 'si',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return created.id;
}

function person(key: RoleLadderKey): RoleLadderPerson {
	const found = roleLadderPeople.find((candidate) => candidate.key === key);
	if (found === undefined) {
		throw new Error(`Unknown role ladder person: ${key}`);
	}
	return found;
}
