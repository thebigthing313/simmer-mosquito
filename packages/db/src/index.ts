import {
	type ColumnType,
	type Generated,
	Kysely,
	PostgresDialect,
	sql,
	type Transaction,
} from 'kysely';
import pg from 'pg';

const { Pool } = pg;

type TimestampWithDefault = ColumnType<Date, Date | undefined, Date | undefined>;
type NullableTimestampWithDefault = ColumnType<
	Date | null,
	Date | null | undefined,
	Date | null | undefined
>;
type BooleanWithDefault = ColumnType<boolean, boolean | undefined, boolean>;

export type SimmerRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';
export type MembershipStatus = 'active' | 'inactive' | 'invited';
export type OrganizationSubscriptionStatus = 'trial' | 'active' | 'suspended' | 'canceled';
export type OrganizationBillingMode = 'manual_invoice';

export interface UsersTable {
	id: Generated<string>;
	workos_user_id: string;
	email: string;
	display_name: string;
	first_name: string | null;
	last_name: string | null;
	email_verified: boolean | null;
	profile_picture_url: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
}

export interface OrganizationsTable {
	id: Generated<string>;
	workos_organization_id: string | null;
	name: string;
	slug: string | null;
	settings: unknown | null;
	subscription_status: ColumnType<
		OrganizationSubscriptionStatus,
		OrganizationSubscriptionStatus | undefined,
		OrganizationSubscriptionStatus
	>;
	billing_mode: ColumnType<
		OrganizationBillingMode,
		OrganizationBillingMode | undefined,
		OrganizationBillingMode
	>;
	billing_contact_name: string | null;
	billing_contact_email: string | null;
	subscription_notes: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface ProfilesTable {
	id: Generated<string>;
	organization_id: string;
	user_id: string | null;
	display_name: string;
	email: string | null;
	is_active: BooleanWithDefault;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface MembershipsTable {
	id: Generated<string>;
	organization_id: string;
	user_id: string | null;
	profile_id: string;
	role: SimmerRole;
	status: MembershipStatus;
	is_default: BooleanWithDefault;
	invited_email: string | null;
	workos_invitation_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
}

export interface SimmerDatabase {
	users: UsersTable;
	organizations: OrganizationsTable;
	profiles: ProfilesTable;
	memberships: MembershipsTable;
}

export interface CreateDbOptions {
	readonly databaseUrl: string;
	readonly maxConnections?: number;
}

export function createDb(options: CreateDbOptions): Kysely<SimmerDatabase> {
	return new Kysely<SimmerDatabase>({
		dialect: new PostgresDialect({
			pool: new Pool({
				connectionString: options.databaseUrl,
				max: options.maxConnections ?? 10,
			}),
		}),
	});
}

export interface WorkOsIdentityInput {
	readonly workosUserId: string;
	readonly email: string;
	readonly displayName: string;
	readonly firstName: string | null;
	readonly lastName: string | null;
	readonly emailVerified: boolean | null;
	readonly profilePictureUrl: string | null;
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
		readonly profilePictureUrl: string | null;
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

export interface OrganizationSubscriptionMetadata {
	readonly subscriptionStatus: OrganizationSubscriptionStatus;
	readonly billingMode: OrganizationBillingMode;
	readonly billingContactName: string | null;
	readonly billingContactEmail: string | null;
	readonly subscriptionNotes: string | null;
}

export interface SafeOrganization {
	readonly id: string;
	readonly workosOrganizationId: string | null;
	readonly name: string;
	readonly slug: string | null;
	readonly subscription: OrganizationSubscriptionMetadata;
	readonly ownerLinked: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

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

export interface UpsertOperatorOrganizationInput extends OrganizationSubscriptionMetadata {
	readonly workosOrganizationId: string;
	readonly name: string;
	readonly slug: string | null;
	readonly ownerUserId?: string;
	readonly ownerDisplayName?: string;
	readonly ownerEmail?: string;
}

export interface StageOrganizationInvitationInput {
	readonly organizationId: string;
	readonly email: string;
	readonly displayName: string | null;
	readonly role: SimmerRole;
	readonly workosInvitationId: string;
}

interface MembershipProvisioningCandidate {
	readonly id: string;
	readonly profileId: string;
	readonly role: SimmerRole;
}

export function resolveMembershipProvisioning(input: {
	readonly existingMembership: MembershipProvisioningCandidate | null;
	readonly invitedMembership: MembershipProvisioningCandidate | null;
	readonly existingMembershipCount: number;
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
	  } {
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

	const isFirstMembership = input.existingMembershipCount === 0;
	return {
		source: 'new',
		role: isFirstMembership ? 'owner' : 'viewer',
		isDefault: isFirstMembership,
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
				profile_picture_url: input.profilePictureUrl,
			})
			.onConflict((oc) =>
				oc.column('workos_user_id').doUpdateSet({
					email: input.email,
					display_name: input.displayName,
					first_name: input.firstName,
					last_name: input.lastName,
					email_verified: input.emailVerified,
					profile_picture_url: input.profilePictureUrl,
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
			.select(['id', 'profile_id', 'role'])
			.where('organization_id', '=', organization.id)
			.where('user_id', '=', user.id)
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
						},
			invitedMembership:
				invitedMembership === undefined
					? null
					: {
							id: invitedMembership.id,
							profileId: invitedMembership.profile_id,
							role: invitedMembership.role,
						},
			existingMembershipCount: Number(existingMembershipCount.count),
		});

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

export async function upsertOperatorOrganization(
	db: Kysely<SimmerDatabase>,
	input: UpsertOperatorOrganizationInput,
): Promise<SafeOrganization> {
	return db.transaction().execute(async (trx) => {
		const organization = await trx
			.insertInto('organizations')
			.values({
				workos_organization_id: input.workosOrganizationId,
				name: input.name,
				slug: input.slug,
				subscription_status: input.subscriptionStatus,
				billing_mode: input.billingMode,
				billing_contact_name: input.billingContactName,
				billing_contact_email: input.billingContactEmail,
				subscription_notes: input.subscriptionNotes,
			})
			.onConflict((oc) =>
				oc.column('workos_organization_id').doUpdateSet({
					name: input.name,
					slug: input.slug,
					subscription_status: input.subscriptionStatus,
					billing_mode: input.billingMode,
					billing_contact_name: input.billingContactName,
					billing_contact_email: input.billingContactEmail,
					subscription_notes: input.subscriptionNotes,
					updated_at: sql`now()`,
				}),
			)
			.returning([
				'id',
				'workos_organization_id',
				'name',
				'slug',
				'subscription_status',
				'billing_mode',
				'billing_contact_name',
				'billing_contact_email',
				'subscription_notes',
				'created_at',
				'updated_at',
			])
			.executeTakeFirstOrThrow();

		let ownerLinked = false;
		if (input.ownerUserId !== undefined) {
			const profile = await trx
				.insertInto('profiles')
				.values({
					organization_id: organization.id,
					user_id: input.ownerUserId,
					display_name: input.ownerDisplayName ?? input.ownerEmail ?? 'SIMMER Operator',
					email: input.ownerEmail ?? null,
				})
				.onConflict((oc) =>
					oc.columns(['organization_id', 'user_id']).doUpdateSet({
						display_name: input.ownerDisplayName ?? input.ownerEmail ?? 'SIMMER Operator',
						email: input.ownerEmail ?? null,
						is_active: true,
						deleted_at: null,
						deleted_by_profile_id: null,
						updated_at: sql`now()`,
					}),
				)
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const existingMembership = await trx
				.selectFrom('memberships')
				.select(['id'])
				.where('organization_id', '=', organization.id)
				.where('user_id', '=', input.ownerUserId)
				.executeTakeFirst();

			if (existingMembership === undefined) {
				await trx
					.insertInto('memberships')
					.values({
						organization_id: organization.id,
						user_id: input.ownerUserId,
						profile_id: profile.id,
						role: 'owner',
						status: 'active',
						is_default: false,
					})
					.execute();
			} else {
				await trx
					.updateTable('memberships')
					.set({
						profile_id: profile.id,
						role: 'owner',
						status: 'active',
						updated_at: sql`now()`,
					})
					.where('id', '=', existingMembership.id)
					.execute();
			}

			ownerLinked = true;
		}

		return toSafeOrganization(organization, ownerLinked);
	});
}

export async function listOperatorOrganizations(
	db: Kysely<SimmerDatabase>,
): Promise<SafeOrganization[]> {
	const rows = await db
		.selectFrom('organizations')
		.select([
			'id',
			'workos_organization_id',
			'name',
			'slug',
			'subscription_status',
			'billing_mode',
			'billing_contact_name',
			'billing_contact_email',
			'subscription_notes',
			'created_at',
			'updated_at',
		])
		.where('deleted_at', 'is', null)
		.orderBy('created_at', 'desc')
		.execute();

	return rows.map((row) => toSafeOrganization(row, false));
}

export async function getOperatorOrganization(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
): Promise<SafeOrganization | null> {
	const row = await db
		.selectFrom('organizations')
		.select([
			'id',
			'workos_organization_id',
			'name',
			'slug',
			'subscription_status',
			'billing_mode',
			'billing_contact_name',
			'billing_contact_email',
			'subscription_notes',
			'created_at',
			'updated_at',
		])
		.where('id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrganization(row, false);
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

export async function stageOrganizationInvitation(
	db: Kysely<SimmerDatabase>,
	input: StageOrganizationInvitationInput,
): Promise<SafeOrganizationMembership> {
	return db.transaction().execute(async (trx) => {
		const normalizedEmail = normalizeEmail(input.email);
		const displayName = input.displayName ?? input.email;
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
			'users.profile_picture_url as user_profile_picture_url',
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
			profilePictureUrl: row.user_profile_picture_url,
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

function toSafeOrganization(
	row: {
		readonly id: string;
		readonly workos_organization_id: string | null;
		readonly name: string;
		readonly slug: string | null;
		readonly subscription_status: OrganizationSubscriptionStatus;
		readonly billing_mode: OrganizationBillingMode;
		readonly billing_contact_name: string | null;
		readonly billing_contact_email: string | null;
		readonly subscription_notes: string | null;
		readonly created_at: Date;
		readonly updated_at: Date;
	},
	ownerLinked: boolean,
): SafeOrganization {
	return {
		id: row.id,
		workosOrganizationId: row.workos_organization_id,
		name: row.name,
		slug: row.slug,
		subscription: {
			subscriptionStatus: row.subscription_status,
			billingMode: row.billing_mode,
			billingContactName: row.billing_contact_name,
			billingContactEmail: row.billing_contact_email,
			subscriptionNotes: row.subscription_notes,
		},
		ownerLinked,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function selectSafeOrganizationMembership(
	db: Kysely<SimmerDatabase> | Transaction<SimmerDatabase>,
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

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}
