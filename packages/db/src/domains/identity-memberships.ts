import { type Kysely, sql, type Transaction } from 'kysely';

import type {
	MembershipStatus,
	MutationWriteResult,
	SimmerDatabase,
	SimmerRole,
} from '../index.js';

export interface SafeOrganizationMembership {
	readonly id: string;
	readonly organizationId: string;
	readonly userId: string | null;
	readonly profileId: string;
	readonly role: SimmerRole;
	readonly status: MembershipStatus;
	readonly isDefault: boolean;
	readonly invitedEmail: string | null;
	readonly workosInvitationId: string | null;
	readonly profile: {
		readonly displayName: string;
		readonly email: string | null;
		readonly isActive: boolean;
	};
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface SafeProfile {
	readonly id: string;
	readonly organizationId: string;
	readonly userId: string | null;
	readonly displayName: string;
	readonly email: string | null;
	readonly isActive: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface StageOrganizationInvitationInput {
	readonly organizationId: string;
	readonly profileId?: string;
	readonly email: string;
	readonly displayName: string | null;
	readonly role: SimmerRole;
	/**
	 * `null` when no invitation was sent because the address already reaches the
	 * organization through WorkOS. The role is still staged and still claimed by
	 * provisioning on next entry — there is simply no WorkOS invitation to name.
	 */
	readonly workosInvitationId: string | null;
}

export interface CreateHistoricalProfileInput {
	readonly id: string;
	readonly organizationId: string;
	readonly displayName: string;
	readonly isActive: boolean;
}

export interface UpdateProfileInput {
	readonly id: string;
	readonly organizationId: string;
	readonly displayName: string;
	readonly isActive: boolean;
}

export interface UpdateOrganizationMembershipRoleInput {
	readonly id: string;
	readonly organizationId: string;
	readonly role: SimmerRole;
}

export type StageOrganizationInvitationErrorCode =
	| 'profile_not_found'
	| 'profile_already_linked'
	| 'profile_deleted'
	| 'invited_email_already_used'
	| 'already_a_member';

export class StageOrganizationInvitationError extends Error {
	readonly code: StageOrganizationInvitationErrorCode;

	constructor(code: StageOrganizationInvitationErrorCode) {
		super(code);
		this.name = 'StageOrganizationInvitationError';
		this.code = code;
	}
}

export interface MembershipProvisioningCandidate {
	readonly id: string;
	readonly profileId: string;
	readonly role: SimmerRole;
	readonly status: MembershipStatus;
}

export interface InviteProfileCandidate {
	readonly id: string;
	readonly userId: string | null;
	readonly deletedAt: Date | null;
}

type IdentityDbExecutor = Kysely<SimmerDatabase> | Transaction<SimmerDatabase>;

export function resolveMembershipProvisioning(input: {
	readonly existingMembership: MembershipProvisioningCandidate | null;
	readonly invitedMembership: MembershipProvisioningCandidate | null;
	readonly existingMembershipCount: number;
	readonly userHasDefaultMembership: boolean;
}):
	| {
			readonly source: 'existing' | 'invited';
			readonly membershipId: string;
			readonly profileId: string;
			readonly role: SimmerRole;
			readonly isDefault: false;
	  }
	| {
			readonly source: 'new';
			readonly role: SimmerRole;
			readonly isDefault: boolean;
	  }
	| { readonly source: 'revoked' } {
	// A membership that was ended is not a membership to resume. Provisioning
	// runs on every sign-in and every organization switch, and the `existing`
	// branch below writes `status: 'active'` — so without this, ending someone's
	// access lasted exactly until they signed in again, and the row came back
	// silently with its old role.
	if (input.existingMembership?.status === 'inactive') {
		return { source: 'revoked' };
	}

	if (input.existingMembership !== null) {
		return {
			source: 'existing',
			membershipId: input.existingMembership.id,
			profileId: input.existingMembership.profileId,
			role: input.existingMembership.role,
			isDefault: false,
		};
	}

	if (input.invitedMembership !== null) {
		return {
			source: 'invited',
			membershipId: input.invitedMembership.id,
			profileId: input.invitedMembership.profileId,
			role: input.invitedMembership.role,
			isDefault: false,
		};
	}

	const isFirstMembershipInOrg = input.existingMembershipCount === 0;
	return {
		source: 'new',
		// The first member of a brand-new organization owns it; anyone joining an
		// organization that already has members lands as a viewer.
		role: isFirstMembershipInOrg ? 'owner' : 'viewer',
		// `is_default` marks the user's default organization and is unique per user
		// (partial unique constraint `memberships_one_default_per_user`). Claim it
		// only when the user has no default yet — otherwise a user who becomes the
		// first member of a *second* organization would try to set a second default
		// and violate the constraint (surfacing as a 500 during sign-in/org select).
		isDefault: !input.userHasDefaultMembership,
	};
}

export function validateExistingProfileInvitationTarget(
	profile: InviteProfileCandidate | null,
): StageOrganizationInvitationErrorCode | null {
	if (profile === null) {
		return 'profile_not_found';
	}

	if (profile.userId !== null) {
		return 'profile_already_linked';
	}

	if (profile.deletedAt !== null) {
		return 'profile_deleted';
	}

	return null;
}

export async function assertOrganizationProfileCanBeInvited(
	db: Kysely<SimmerDatabase>,
	input: {
		readonly organizationId: string;
		readonly profileId: string;
		readonly email?: string;
	},
): Promise<void> {
	const profile = await db
		.selectFrom('profiles')
		.select(['id', 'user_id', 'deleted_at'])
		.where('id', '=', input.profileId)
		.where('organization_id', '=', input.organizationId)
		.executeTakeFirst();

	const issue = validateExistingProfileInvitationTarget(
		profile === undefined
			? null
			: {
					id: profile.id,
					userId: profile.user_id,
					deletedAt: profile.deleted_at,
				},
	);
	if (issue !== null) {
		throw new StageOrganizationInvitationError(issue);
	}

	if (input.email !== undefined) {
		const normalizedEmail = normalizeEmail(input.email);
		const existingEmailMembership = await db
			.selectFrom('memberships')
			.select(['profile_id'])
			.where('organization_id', '=', input.organizationId)
			.where('user_id', 'is', null)
			.where('status', '=', 'invited')
			.where(sql<boolean>`lower(${sql.ref('invited_email')}) = ${normalizedEmail}`)
			.executeTakeFirst();

		if (
			existingEmailMembership !== undefined &&
			existingEmailMembership.profile_id !== input.profileId
		) {
			throw new StageOrganizationInvitationError('invited_email_already_used');
		}
	}
}

// --- ending a membership ------------------------------------------------------
//
// ADR 0011 names this and does not build it: a membership granted for a support
// engagement has to be endable, or operator memberships accumulate silently.
// Nothing in the workspace ended a membership of any kind — there was no writer
// that set `inactive` and no delete — so this is the whole lifecycle, for
// operators and ordinary members alike.
//
// The row survives, deactivated. Attribution survives either way
// (`created_by_profile_id` points at the profile, which outlives the
// membership), but the row is the only record that access was ever held, and
// "who could see this organization's data last March" is a question worth being
// able to answer.

export type MembershipRemovalIssue =
	| 'membership_not_found'
	| 'membership_is_self'
	| 'last_active_owner';

export interface MembershipRemovalTarget {
	readonly id: string;
	readonly role: SimmerRole;
	readonly status: MembershipStatus;
	readonly userId: string | null;
	/** Needed to end the WorkOS side, which is what actually revokes reach. */
	readonly workosUserId: string | null;
}

/**
 * Whether this membership may be ended, given who is asking.
 *
 * Two refusals, both about locking an organization out of itself rather than
 * about rank — the ladder question ("may this actor reach this person at all")
 * is the caller's, and is answered before this runs.
 */
export function validateMembershipRemoval(input: {
	readonly membership: { readonly role: SimmerRole; readonly status: MembershipStatus } | null;
	readonly isSelf: boolean;
	readonly activeOwnerCount: number;
}): MembershipRemovalIssue | null {
	if (input.membership === null) {
		return 'membership_not_found';
	}

	// Self-removal is a foot-gun with no upside: the actor is an owner or admin
	// standing on the page they would lose. Leaving is a different act with a
	// different confirmation, and no organization has asked for it.
	if (input.isSelf) {
		return 'membership_is_self';
	}

	// An organization with no active owner cannot hand out roles or invite anyone
	// — including a replacement owner — so this is a one-way door.
	if (
		input.membership.role === 'owner' &&
		input.membership.status === 'active' &&
		input.activeOwnerCount <= 1
	) {
		return 'last_active_owner';
	}

	return null;
}

/**
 * The membership to be ended, and the one fact the rule needs about its
 * neighbours.
 *
 * Read before the write rather than inside it because the WorkOS side has to go
 * first: WorkOS is what refuses the session, so a run that ends the SIMMER row
 * and then fails leaves somebody who reads as removed and can still sign in.
 */
export async function readMembershipRemovalTarget(
	db: Kysely<SimmerDatabase>,
	input: { readonly id: string; readonly organizationId: string },
): Promise<{
	readonly membership: MembershipRemovalTarget | null;
	readonly activeOwnerCount: number;
}> {
	const row = await db
		.selectFrom('memberships')
		.leftJoin('users', 'users.id', 'memberships.user_id')
		.select([
			'memberships.id',
			'memberships.role',
			'memberships.status',
			'memberships.user_id',
			'users.workos_user_id',
		])
		.where('memberships.id', '=', input.id)
		.where('memberships.organization_id', '=', input.organizationId)
		.executeTakeFirst();

	const activeOwners = await db
		.selectFrom('memberships')
		.select(({ fn }) => fn.countAll<number>().as('count'))
		.where('organization_id', '=', input.organizationId)
		.where('role', '=', 'owner')
		.where('status', '=', 'active')
		.executeTakeFirstOrThrow();

	return {
		membership:
			row === undefined
				? null
				: {
						id: row.id,
						role: row.role,
						status: row.status,
						userId: row.user_id,
						workosUserId: row.workos_user_id,
					},
		activeOwnerCount: Number(activeOwners.count),
	};
}

export async function deactivateOrganizationMembershipWithTxid(
	db: Kysely<SimmerDatabase>,
	input: { readonly id: string; readonly organizationId: string },
): Promise<MutationWriteResult<SafeOrganizationMembership | null>> {
	return db.transaction().execute(async (trx) => {
		const updated =
			(await trx
				.updateTable('memberships')
				.set({
					status: 'inactive',
					// `is_default` names where a user lands when they sign in. Left set,
					// it points at the one organization they can no longer enter, and
					// the next sign-in has nowhere to go.
					is_default: false,
					updated_at: sql`now()`,
				})
				.where('id', '=', input.id)
				.where('organization_id', '=', input.organizationId)
				.returning(['id'])
				.executeTakeFirst()) ?? null;
		const txid = await readCurrentTransactionId(trx);
		if (updated === null) {
			return { row: null, txid };
		}

		return { row: await selectSafeOrganizationMembership(trx, updated.id), txid };
	});
}

export async function listOrganizationMemberships(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
): Promise<SafeOrganizationMembership[]> {
	const rows = await db
		.selectFrom('memberships')
		.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
		.select([
			'memberships.id',
			'memberships.organization_id',
			'memberships.user_id',
			'memberships.profile_id',
			'memberships.role',
			'memberships.status',
			'memberships.is_default',
			'memberships.invited_email',
			'memberships.workos_invitation_id',
			'memberships.created_at',
			'memberships.updated_at',
			'profiles.display_name as profile_display_name',
			'profiles.email as profile_email',
			'profiles.is_active as profile_is_active',
		])
		.where('memberships.organization_id', '=', organizationId)
		.orderBy('memberships.created_at', 'desc')
		.execute();

	return rows.map((row) =>
		toSafeOrganizationMembership({
			id: row.id,
			organization_id: row.organization_id,
			user_id: row.user_id,
			profile_id: row.profile_id,
			role: row.role,
			status: row.status,
			is_default: row.is_default,
			invited_email: row.invited_email,
			workos_invitation_id: row.workos_invitation_id,
			created_at: row.created_at,
			updated_at: row.updated_at,
			profile_display_name: row.profile_display_name,
			profile_email: row.profile_email,
			profile_is_active: row.profile_is_active,
		}),
	);
}

export async function updateOrganizationMembershipRoleWithTxid(
	db: Kysely<SimmerDatabase>,
	input: UpdateOrganizationMembershipRoleInput,
): Promise<MutationWriteResult<SafeOrganizationMembership | null>> {
	return db.transaction().execute(async (trx) => {
		const updated =
			(await trx
				.updateTable('memberships')
				.set({
					role: input.role,
					updated_at: sql`now()`,
				})
				.where('id', '=', input.id)
				.where('organization_id', '=', input.organizationId)
				.returning(['id'])
				.executeTakeFirst()) ?? null;
		const txid = await readCurrentTransactionId(trx);
		if (updated === null) {
			return { row: null, txid };
		}

		return { row: await selectSafeOrganizationMembership(trx, updated.id), txid };
	});
}

export async function createHistoricalProfileWithTxid(
	db: Kysely<SimmerDatabase>,
	input: CreateHistoricalProfileInput,
): Promise<MutationWriteResult<SafeProfile>> {
	return db.transaction().execute(async (trx) => {
		const row = await trx
			.insertInto('profiles')
			.values({
				id: input.id,
				organization_id: input.organizationId,
				user_id: null,
				display_name: input.displayName,
				email: null,
				is_active: input.isActive,
			})
			.returning([
				'id',
				'organization_id',
				'user_id',
				'display_name',
				'email',
				'is_active',
				'created_at',
				'updated_at',
			])
			.executeTakeFirstOrThrow();
		const txid = await readCurrentTransactionId(trx);
		return { row: toSafeProfile(row), txid };
	});
}

export async function updateProfileWithTxid(
	db: Kysely<SimmerDatabase>,
	input: UpdateProfileInput,
): Promise<MutationWriteResult<SafeProfile | null>> {
	return db.transaction().execute(async (trx) => {
		const row =
			(await trx
				.updateTable('profiles')
				.set({
					display_name: input.displayName,
					is_active: input.isActive,
					updated_at: sql`now()`,
				})
				.where('id', '=', input.id)
				.where('organization_id', '=', input.organizationId)
				.where('deleted_at', 'is', null)
				.returning([
					'id',
					'organization_id',
					'user_id',
					'display_name',
					'email',
					'is_active',
					'created_at',
					'updated_at',
				])
				.executeTakeFirst()) ?? null;
		const txid = await readCurrentTransactionId(trx);
		return { row: row === null ? null : toSafeProfile(row), txid };
	});
}

export async function stageOrganizationInvitation(
	db: Kysely<SimmerDatabase>,
	input: StageOrganizationInvitationInput,
): Promise<SafeOrganizationMembership> {
	return db.transaction().execute(async (trx) => {
		const normalizedEmail = normalizeEmail(input.email);
		const displayName = input.displayName ?? input.email;

		// Somebody who already has access cannot be invited to it. Without this the
		// insert branch below stages a second Profile and a second Membership
		// beside their live one, and provisioning prefers the active membership on
		// every sign-in, so the invited row is never consumed and never leaves.
		const activeMembership = await trx
			.selectFrom('memberships')
			.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
			.select('memberships.id')
			.where('memberships.organization_id', '=', input.organizationId)
			.where('memberships.status', '=', 'active')
			.where(sql<boolean>`lower(${sql.ref('profiles.email')}) = ${normalizedEmail}`)
			.executeTakeFirst();
		if (activeMembership !== undefined) {
			throw new StageOrganizationInvitationError('already_a_member');
		}
		if (input.profileId !== undefined) {
			const profile = await trx
				.selectFrom('profiles')
				.select(['id', 'user_id', 'display_name', 'deleted_at'])
				.where('id', '=', input.profileId)
				.where('organization_id', '=', input.organizationId)
				.executeTakeFirst();

			const profileIssue = validateExistingProfileInvitationTarget(
				profile === undefined
					? null
					: {
							id: profile.id,
							userId: profile.user_id,
							deletedAt: profile.deleted_at,
						},
			);
			if (profileIssue !== null) {
				throw new StageOrganizationInvitationError(profileIssue);
			}

			const existingProfileMembership = await trx
				.selectFrom('memberships')
				.select(['id', 'profile_id'])
				.where('organization_id', '=', input.organizationId)
				.where('user_id', 'is', null)
				.where('status', '=', 'invited')
				.where('profile_id', '=', input.profileId)
				.executeTakeFirst();

			const existingEmailMembership = await trx
				.selectFrom('memberships')
				.select(['id', 'profile_id'])
				.where('organization_id', '=', input.organizationId)
				.where('user_id', 'is', null)
				.where('status', '=', 'invited')
				.where(sql<boolean>`lower(${sql.ref('invited_email')}) = ${normalizedEmail}`)
				.executeTakeFirst();

			if (
				existingEmailMembership !== undefined &&
				existingEmailMembership.profile_id !== input.profileId
			) {
				throw new StageOrganizationInvitationError('invited_email_already_used');
			}

			const membershipId = existingProfileMembership?.id ?? existingEmailMembership?.id ?? null;
			await trx
				.updateTable('profiles')
				.set({
					display_name: input.displayName ?? profile?.display_name ?? displayName,
					email: normalizedEmail,
					is_active: true,
					deleted_at: null,
					deleted_by_profile_id: null,
					updated_at: sql`now()`,
				})
				.where('id', '=', input.profileId)
				.executeTakeFirstOrThrow();

			if (membershipId !== null) {
				const updated = await trx
					.updateTable('memberships')
					.set({
						role: input.role,
						invited_email: normalizedEmail,
						workos_invitation_id: input.workosInvitationId,
						updated_at: sql`now()`,
					})
					.where('id', '=', membershipId)
					.returning(['id'])
					.executeTakeFirstOrThrow();

				return selectSafeOrganizationMembership(trx, updated.id);
			}

			const membership = await trx
				.insertInto('memberships')
				.values({
					organization_id: input.organizationId,
					user_id: null,
					profile_id: input.profileId,
					role: input.role,
					status: 'invited',
					is_default: false,
					invited_email: normalizedEmail,
					workos_invitation_id: input.workosInvitationId,
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();

			return selectSafeOrganizationMembership(trx, membership.id);
		}

		const existingMembership = await trx
			.selectFrom('memberships')
			.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
			.select(['memberships.id', 'memberships.profile_id', 'profiles.id as joined_profile_id'])
			.where('memberships.organization_id', '=', input.organizationId)
			.where('memberships.user_id', 'is', null)
			.where('memberships.status', '=', 'invited')
			.where(sql<boolean>`lower(${sql.ref('memberships.invited_email')}) = ${normalizedEmail}`)
			.executeTakeFirst();

		if (existingMembership !== undefined) {
			await trx
				.updateTable('profiles')
				.set({
					display_name: displayName,
					email: normalizedEmail,
					is_active: true,
					deleted_at: null,
					deleted_by_profile_id: null,
					updated_at: sql`now()`,
				})
				.where('id', '=', existingMembership.joined_profile_id)
				.executeTakeFirstOrThrow();

			const updated = await trx
				.updateTable('memberships')
				.set({
					role: input.role,
					invited_email: normalizedEmail,
					workos_invitation_id: input.workosInvitationId,
					updated_at: sql`now()`,
				})
				.where('id', '=', existingMembership.id)
				.returningAll()
				.executeTakeFirstOrThrow();

			return selectSafeOrganizationMembership(trx, updated.id);
		}

		const profile = await trx
			.insertInto('profiles')
			.values({
				organization_id: input.organizationId,
				user_id: null,
				display_name: displayName,
				email: normalizedEmail,
			})
			.returning(['id'])
			.executeTakeFirstOrThrow();

		const membership = await trx
			.insertInto('memberships')
			.values({
				organization_id: input.organizationId,
				user_id: null,
				profile_id: profile.id,
				role: input.role,
				status: 'invited',
				is_default: false,
				invited_email: normalizedEmail,
				workos_invitation_id: input.workosInvitationId,
			})
			.returning(['id'])
			.executeTakeFirstOrThrow();

		return selectSafeOrganizationMembership(trx, membership.id);
	});
}

/**
 * The second half of an invitation, once WorkOS has answered.
 *
 * Staging writes the Membership with no `workos_invitation_id`, because the
 * mail must not go out before the row it will be accepted into exists. This
 * stamps the id the send returned onto that row.
 *
 * Scoped by organization as well as by id. The caller has an id it read from
 * its own staging call, and a stamp that could reach another organization's row
 * would be a hole in that scope for the sake of one saved predicate.
 */
export async function stampOrganizationInvitation(
	db: Kysely<SimmerDatabase>,
	input: {
		readonly id: string;
		readonly organizationId: string;
		readonly workosInvitationId: string;
	},
): Promise<SafeOrganizationMembership> {
	const updated = await db
		.updateTable('memberships')
		.set({ workos_invitation_id: input.workosInvitationId, updated_at: sql`now()` })
		.where('id', '=', input.id)
		.where('organization_id', '=', input.organizationId)
		.returning(['id'])
		.executeTakeFirstOrThrow();

	return selectSafeOrganizationMembership(db, updated.id);
}

/**
 * Forget the invitation a Membership names, once WorkOS no longer holds it.
 *
 * `identity.reinvite` revokes the invitation it replaces before mailing the
 * replacement, and between those two calls the column names a link that is dead.
 * Nulling it is what keeps the row saying only what WorkOS actually finished: a
 * Membership at `invited` with no `workos_invitation_id` is #207's shape already,
 * and every path reads it as nothing to revoke.
 *
 * Scoped by organization for the same reason the stamp is.
 */
export async function clearOrganizationInvitationStamp(
	db: Kysely<SimmerDatabase>,
	input: { readonly id: string; readonly organizationId: string },
): Promise<void> {
	await db
		.updateTable('memberships')
		.set({ workos_invitation_id: null, updated_at: sql`now()` })
		.where('id', '=', input.id)
		.where('organization_id', '=', input.organizationId)
		.returning(['id'])
		.executeTakeFirstOrThrow();
}

async function readCurrentTransactionId(db: IdentityDbExecutor): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(db);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}

	return Number.parseInt(txid, 10);
}

async function selectSafeOrganizationMembership(
	db: IdentityDbExecutor,
	membershipId: string,
): Promise<SafeOrganizationMembership> {
	const row = await db
		.selectFrom('memberships')
		.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
		.select([
			'memberships.id',
			'memberships.organization_id',
			'memberships.user_id',
			'memberships.profile_id',
			'memberships.role',
			'memberships.status',
			'memberships.is_default',
			'memberships.invited_email',
			'memberships.workos_invitation_id',
			'memberships.created_at',
			'memberships.updated_at',
			'profiles.display_name as profile_display_name',
			'profiles.email as profile_email',
			'profiles.is_active as profile_is_active',
		])
		.where('memberships.id', '=', membershipId)
		.executeTakeFirstOrThrow();

	return toSafeOrganizationMembership({
		id: row.id,
		organization_id: row.organization_id,
		user_id: row.user_id,
		profile_id: row.profile_id,
		role: row.role,
		status: row.status,
		is_default: row.is_default,
		invited_email: row.invited_email,
		workos_invitation_id: row.workos_invitation_id,
		created_at: row.created_at,
		updated_at: row.updated_at,
		profile_display_name: row.profile_display_name,
		profile_email: row.profile_email,
		profile_is_active: row.profile_is_active,
	});
}

function toSafeOrganizationMembership(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly user_id: string | null;
	readonly profile_id: string;
	readonly role: SimmerRole;
	readonly status: MembershipStatus;
	readonly is_default: boolean;
	readonly invited_email: string | null;
	readonly workos_invitation_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
	readonly profile_display_name: string;
	readonly profile_email: string | null;
	readonly profile_is_active: boolean;
}): SafeOrganizationMembership {
	return {
		id: row.id,
		organizationId: row.organization_id,
		userId: row.user_id,
		profileId: row.profile_id,
		role: row.role,
		status: row.status,
		isDefault: row.is_default,
		invitedEmail: row.invited_email,
		workosInvitationId: row.workos_invitation_id,
		profile: {
			displayName: row.profile_display_name,
			email: row.profile_email,
			isActive: row.profile_is_active,
		},
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeProfile(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly user_id: string | null;
	readonly display_name: string;
	readonly email: string | null;
	readonly is_active: boolean;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeProfile {
	return {
		id: row.id,
		organizationId: row.organization_id,
		userId: row.user_id,
		displayName: row.display_name,
		email: row.email,
		isActive: row.is_active,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}
