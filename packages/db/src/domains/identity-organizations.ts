import { type Kysely, sql } from 'kysely';

import type {
	OrganizationBillingMode,
	OrganizationSubscriptionStatus,
	SimmerDatabase,
} from '../index.js';

export interface OrganizationSubscriptionMetadata {
	readonly subscriptionStatus: OrganizationSubscriptionStatus;
	readonly billingMode: OrganizationBillingMode;
	readonly billingContactName: string | null;
	readonly billingContactEmail: string | null;
	readonly subscriptionNotes: string | null;
}

export interface OrganizationContactInfo {
	readonly mainContactEmail: string | null;
	readonly phoneNumber: string | null;
	readonly mailingCountry: string | null;
	readonly mailingAddressLine1: string | null;
	readonly mailingAddressLine2: string | null;
	readonly mailingLocality: string | null;
	readonly mailingRegion: string | null;
	readonly mailingPostalCode: string | null;
}

export interface SafeOrganization {
	readonly id: string;
	readonly workosOrganizationId: string | null;
	readonly name: string;
	readonly slug: string | null;
	readonly subscription: OrganizationSubscriptionMetadata;
	readonly contact: OrganizationContactInfo;
	readonly ownerLinked: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface UpsertOperatorOrganizationInput extends OrganizationSubscriptionMetadata {
	readonly workosOrganizationId: string;
	readonly name: string;
	readonly slug: string | null;
	readonly contact: OrganizationContactInfo;
	readonly ownerUserId?: string;
	readonly ownerDisplayName?: string;
	readonly ownerEmail?: string;
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
				main_contact_email: input.contact.mainContactEmail,
				phone_number: input.contact.phoneNumber,
				mailing_country: input.contact.mailingCountry,
				mailing_address_line_1: input.contact.mailingAddressLine1,
				mailing_address_line_2: input.contact.mailingAddressLine2,
				mailing_locality: input.contact.mailingLocality,
				mailing_region: input.contact.mailingRegion,
				mailing_postal_code: input.contact.mailingPostalCode,
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
					main_contact_email: input.contact.mainContactEmail,
					phone_number: input.contact.phoneNumber,
					mailing_country: input.contact.mailingCountry,
					mailing_address_line_1: input.contact.mailingAddressLine1,
					mailing_address_line_2: input.contact.mailingAddressLine2,
					mailing_locality: input.contact.mailingLocality,
					mailing_region: input.contact.mailingRegion,
					mailing_postal_code: input.contact.mailingPostalCode,
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
				'main_contact_email',
				'phone_number',
				'mailing_country',
				'mailing_address_line_1',
				'mailing_address_line_2',
				'mailing_locality',
				'mailing_region',
				'mailing_postal_code',
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
			'main_contact_email',
			'phone_number',
			'mailing_country',
			'mailing_address_line_1',
			'mailing_address_line_2',
			'mailing_locality',
			'mailing_region',
			'mailing_postal_code',
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
			'main_contact_email',
			'phone_number',
			'mailing_country',
			'mailing_address_line_1',
			'mailing_address_line_2',
			'mailing_locality',
			'mailing_region',
			'mailing_postal_code',
			'created_at',
			'updated_at',
		])
		.where('id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrganization(row, false);
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
		readonly main_contact_email: string | null;
		readonly phone_number: string | null;
		readonly mailing_country: string | null;
		readonly mailing_address_line_1: string | null;
		readonly mailing_address_line_2: string | null;
		readonly mailing_locality: string | null;
		readonly mailing_region: string | null;
		readonly mailing_postal_code: string | null;
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
		contact: {
			mainContactEmail: row.main_contact_email,
			phoneNumber: row.phone_number,
			mailingCountry: row.mailing_country,
			mailingAddressLine1: row.mailing_address_line_1,
			mailingAddressLine2: row.mailing_address_line_2,
			mailingLocality: row.mailing_locality,
			mailingRegion: row.mailing_region,
			mailingPostalCode: row.mailing_postal_code,
		},
		ownerLinked,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
