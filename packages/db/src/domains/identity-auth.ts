import { type Kysely, sql } from 'kysely';

import type { MembershipStatus, SimmerDatabase, SimmerRole } from '../index.js';

import { resolveMembershipProvisioning } from './identity-memberships.js';

export interface WorkOsIdentityInput {
	readonly workosUserId: string;
	readonly email: string;
	readonly displayName: string;
	readonly firstName: string | null;
	readonly lastName: string | null;
	readonly emailVerified: boolean | null;
	readonly workosOrganizationId: string | null;
	readonly workosOrganizationName?: string | null;
	readonly workosRole?: string | null;
}

export interface LocalIdentity {
	readonly userId: string;
	readonly organizationId: string | null;
	readonly profileId: string | null;
	readonly membershipId: string | null;
	readonly role: SimmerRole | null;
}

export interface ActiveLocalAuthIdentity {
	readonly user: {
		readonly id: string;
		readonly workosUserId: string;
		readonly email: string;
		readonly displayName: string;
		readonly firstName: string | null;
		readonly lastName: string | null;
		readonly emailVerified: boolean | null;
	};
	readonly organization: {
		readonly id: string;
		readonly workosOrganizationId: string;
		readonly name: string;
		readonly slug: string | null;
	};
	readonly profile: {
		readonly id: string;
		readonly organizationId: string;
		readonly userId: string | null;
		readonly displayName: string;
		readonly email: string | null;
	};
	readonly membership: {
		readonly id: string;
		readonly organizationId: string;
		readonly userId: string;
		readonly profileId: string;
		readonly role: SimmerRole;
		readonly status: MembershipStatus;
		readonly isDefault: boolean;
	};
}

export async function upsertWorkOsIdentity(
	db: Kysely<SimmerDatabase>,
	input: WorkOsIdentityInput,
): Promise<LocalIdentity> {
	return db.transaction().execute(async (trx) => {
		const user = await trx
			.insertInto('users')
			.values({
				workos_user_id: input.workosUserId,
				email: input.email,
				display_name: input.displayName,
				first_name: input.firstName,
				last_name: input.lastName,
				email_verified: input.emailVerified,
			})
			.onConflict((oc) =>
				oc.column('workos_user_id').doUpdateSet({
					email: input.email,
					display_name: input.displayName,
					first_name: input.firstName,
					last_name: input.lastName,
					email_verified: input.emailVerified,
					updated_at: sql`now()`,
				}),
			)
			.returning(['id'])
			.executeTakeFirstOrThrow();

		if (input.workosOrganizationId === null) {
			return {
				userId: user.id,
				organizationId: null,
				profileId: null,
				membershipId: null,
				role: null,
			};
		}

		const organizationName = input.workosOrganizationName ?? input.workosOrganizationId;

		const organization = await trx
			.insertInto('organizations')
			.values({
				workos_organization_id: input.workosOrganizationId,
				name: organizationName,
			})
			.onConflict((oc) =>
				oc.column('workos_organization_id').doUpdateSet({
					name: organizationName,
					updated_at: sql`now()`,
				}),
			)
			.returning(['id'])
			.executeTakeFirstOrThrow();

		const existingMembershipCount = await trx
			.selectFrom('memberships')
			.select(({ fn }) => fn.countAll<number>().as('count'))
			.where('organization_id', '=', organization.id)
			.executeTakeFirstOrThrow();

		const existingMembership = await trx
			.selectFrom('memberships')
			.select(['id', 'profile_id', 'role', 'status'])
			.where('organization_id', '=', organization.id)
			.where('user_id', '=', user.id)
			.executeTakeFirst();

		// Whether the user already has a default organization anywhere. A new
		// membership may only be marked default when they have none yet, so a user
		// joining a second organization doesn't violate memberships_one_default_per_user.
		const userDefaultMembership = await trx
			.selectFrom('memberships')
			.select('id')
			.where('user_id', '=', user.id)
			.where('is_default', '=', true)
			.executeTakeFirst();

		const normalizedEmail = normalizeEmail(input.email);
		const invitedMembership = await trx
			.selectFrom('memberships')
			.select(['id', 'profile_id', 'role'])
			.where('organization_id', '=', organization.id)
			.where('user_id', 'is', null)
			.where('status', '=', 'invited')
			.where(sql<boolean>`lower(${sql.ref('invited_email')}) = ${normalizedEmail}`)
			.executeTakeFirst();

		const provisioning = resolveMembershipProvisioning({
			existingMembership:
				existingMembership === undefined
					? null
					: {
							id: existingMembership.id,
							profileId: existingMembership.profile_id,
							role: existingMembership.role,
							status: existingMembership.status,
						},
			invitedMembership:
				invitedMembership === undefined
					? null
					: {
							id: invitedMembership.id,
							profileId: invitedMembership.profile_id,
							role: invitedMembership.role,
							status: 'invited',
						},
			existingMembershipCount: Number(existingMembershipCount.count),
			userHasDefaultMembership: userDefaultMembership !== undefined,
		});

		// Their membership here was ended. Same answer as a user who was never in
		// this organization at all: a local identity with no organization on it.
		if (provisioning.source === 'revoked') {
			return {
				userId: user.id,
				organizationId: null,
				profileId: null,
				membershipId: null,
				role: null,
			};
		}

		if (provisioning.source === 'existing' || provisioning.source === 'invited') {
			await trx
				.updateTable('profiles')
				.set({
					user_id: user.id,
					display_name: input.displayName,
					email: input.email,
					is_active: true,
					deleted_at: null,
					deleted_by_profile_id: null,
					updated_at: sql`now()`,
				})
				.where('id', '=', provisioning.profileId)
				.executeTakeFirstOrThrow();

			const membership = await trx
				.updateTable('memberships')
				.set({
					user_id: user.id,
					status: 'active',
					updated_at: sql`now()`,
				})
				.where('id', '=', provisioning.membershipId)
				.returning(['id', 'profile_id', 'role'])
				.executeTakeFirstOrThrow();

			return {
				userId: user.id,
				organizationId: organization.id,
				profileId: membership.profile_id,
				membershipId: membership.id,
				role: membership.role,
			};
		}

		const profile = await trx
			.insertInto('profiles')
			.values({
				organization_id: organization.id,
				user_id: user.id,
				display_name: input.displayName,
				email: input.email,
			})
			.onConflict((oc) =>
				oc.columns(['organization_id', 'user_id']).doUpdateSet({
					display_name: input.displayName,
					email: input.email,
					is_active: true,
					deleted_at: null,
					deleted_by_profile_id: null,
					updated_at: sql`now()`,
				}),
			)
			.returning(['id'])
			.executeTakeFirstOrThrow();

		const membership = await trx
			.insertInto('memberships')
			.values({
				organization_id: organization.id,
				user_id: user.id,
				profile_id: profile.id,
				role: provisioning.role,
				status: 'active',
				is_default: provisioning.isDefault,
			})
			.returning(['id', 'role'])
			.executeTakeFirstOrThrow();

		return {
			userId: user.id,
			organizationId: organization.id,
			profileId: profile.id,
			membershipId: membership.id,
			role: membership.role,
		};
	});
}

export async function resolveActiveLocalAuthIdentity(
	db: Kysely<SimmerDatabase>,
	input: {
		readonly workosUserId: string;
		readonly workosOrganizationId: string;
	},
): Promise<ActiveLocalAuthIdentity | null> {
	const row = await db
		.selectFrom('users')
		.innerJoin('memberships', 'memberships.user_id', 'users.id')
		.innerJoin('organizations', 'organizations.id', 'memberships.organization_id')
		.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
		.select([
			'users.id as user_id',
			'users.workos_user_id as user_workos_user_id',
			'users.email as user_email',
			'users.display_name as user_display_name',
			'users.first_name as user_first_name',
			'users.last_name as user_last_name',
			'users.email_verified as user_email_verified',
			'organizations.id as organization_id',
			'organizations.workos_organization_id as organization_workos_organization_id',
			'organizations.name as organization_name',
			'organizations.slug as organization_slug',
			'profiles.id as profile_id',
			'profiles.organization_id as profile_organization_id',
			'profiles.user_id as profile_user_id',
			'profiles.display_name as profile_display_name',
			'profiles.email as profile_email',
			'memberships.id as membership_id',
			'memberships.organization_id as membership_organization_id',
			'memberships.user_id as membership_user_id',
			'memberships.profile_id as membership_profile_id',
			'memberships.role as membership_role',
			'memberships.status as membership_status',
			'memberships.is_default as membership_is_default',
		])
		.where('users.workos_user_id', '=', input.workosUserId)
		.where('organizations.workos_organization_id', '=', input.workosOrganizationId)
		.where('organizations.deleted_at', 'is', null)
		.where('memberships.status', '=', 'active')
		.where('memberships.user_id', 'is not', null)
		.where('profiles.is_active', '=', true)
		.where('profiles.deleted_at', 'is', null)
		.executeTakeFirst();

	if (
		row === undefined ||
		row.organization_workos_organization_id === null ||
		row.membership_user_id === null
	) {
		return null;
	}

	return {
		user: {
			id: row.user_id,
			workosUserId: row.user_workos_user_id,
			email: row.user_email,
			displayName: row.user_display_name,
			firstName: row.user_first_name,
			lastName: row.user_last_name,
			emailVerified: row.user_email_verified,
		},
		organization: {
			id: row.organization_id,
			workosOrganizationId: row.organization_workos_organization_id,
			name: row.organization_name,
			slug: row.organization_slug,
		},
		profile: {
			id: row.profile_id,
			organizationId: row.profile_organization_id,
			userId: row.profile_user_id,
			displayName: row.profile_display_name,
			email: row.profile_email,
		},
		membership: {
			id: row.membership_id,
			organizationId: row.membership_organization_id,
			userId: row.membership_user_id,
			profileId: row.membership_profile_id,
			role: row.membership_role,
			status: row.membership_status,
			isDefault: row.membership_is_default,
		},
	};
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}
