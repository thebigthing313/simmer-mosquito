import type { OrganizationContactDetailKey } from '@simmer-mosquito/domain';
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

/** The contact details as stored: every key the domain names, each text or `null`. */
export type OrganizationContactInfo = {
	readonly [K in OrganizationContactDetailKey]: string | null;
};

type OrganizationColumns = SimmerDatabase['organizations'];

/** A column of `organizations` that holds nullable text and nothing else. */
type NullableTextColumn = {
	[C in keyof OrganizationColumns]: OrganizationColumns[C] extends string | null
		? string | null extends OrganizationColumns[C]
			? C
			: never
		: never;
}[keyof OrganizationColumns];

/**
 * Each contact detail and the `organizations` column it is stored in.
 *
 * The one place the pairs are written. The operator create's insert, its
 * conflict update, both reads and the row mapping are built from it, and so is
 * the details edit's column table in `apps/server`. The `satisfies` is the
 * check: a key the domain adds fails `tsc` here until it has a column, and a
 * column that does not exist, or is not nullable text, fails the same way.
 */
export const ORGANIZATION_CONTACT_COLUMNS = {
	mainContactEmail: 'main_contact_email',
	phoneNumber: 'phone_number',
	mailingCountry: 'mailing_country',
	mailingAddressLine1: 'mailing_address_line_1',
	mailingAddressLine2: 'mailing_address_line_2',
	mailingLocality: 'mailing_locality',
	mailingRegion: 'mailing_region',
	mailingPostalCode: 'mailing_postal_code',
} as const satisfies Record<OrganizationContactDetailKey, NullableTextColumn>;

type ContactKey = keyof typeof ORGANIZATION_CONTACT_COLUMNS;

type ContactColumn = (typeof ORGANIZATION_CONTACT_COLUMNS)[ContactKey];

type ContactRow = { readonly [C in ContactColumn]: string | null };

/**
 * The map's own keys, which the `satisfies` holds to the domain's list.
 *
 * Walked instead of that list so that a key the map has not got yet fails
 * `tsc` at the map alone, rather than again at every lookup below.
 */
const CONTACT_KEYS = Object.keys(ORGANIZATION_CONTACT_COLUMNS) as readonly ContactKey[];

const CONTACT_COLUMNS = CONTACT_KEYS.map((key) => ORGANIZATION_CONTACT_COLUMNS[key]);

/** The contact details as the columns an insert or an update writes. */
function toContactRow(contact: OrganizationContactInfo): ContactRow {
	return Object.fromEntries(
		CONTACT_KEYS.map((key) => [ORGANIZATION_CONTACT_COLUMNS[key], contact[key]]),
	) as ContactRow;
}

/** The contact columns of a row read back as the domain's keys. */
function toContactInfo(row: ContactRow): OrganizationContactInfo {
	return Object.fromEntries(
		CONTACT_KEYS.map((key) => [key, row[ORGANIZATION_CONTACT_COLUMNS[key]]]),
	) as OrganizationContactInfo;
}

/** Every column the operator reads return, the contact columns included. */
const SAFE_ORGANIZATION_COLUMNS = [
	'id',
	'workos_organization_id',
	'name',
	'slug',
	'subscription_status',
	'billing_mode',
	'billing_contact_name',
	'billing_contact_email',
	'subscription_notes',
	...CONTACT_COLUMNS,
	'created_at',
	'updated_at',
] as const;

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
				...toContactRow(input.contact),
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
					...toContactRow(input.contact),
					updated_at: sql`now()`,
				}),
			)
			.returning(SAFE_ORGANIZATION_COLUMNS)
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
		.select(SAFE_ORGANIZATION_COLUMNS)
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
		.select(SAFE_ORGANIZATION_COLUMNS)
		.where('id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrganization(row, false);
}

function toSafeOrganization(
	row: ContactRow & {
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
		contact: toContactInfo(row),
		ownerLinked,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
