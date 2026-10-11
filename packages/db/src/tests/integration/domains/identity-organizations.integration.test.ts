import { sql } from 'kysely';
import { expect, it } from 'vitest';
import {
	getOperatorOrganization,
	listOperatorOrganizations,
	ORGANIZATION_CONTACT_COLUMNS,
	type OrganizationContactInfo,
	type UpsertOperatorOrganizationInput,
	upsertOperatorOrganization,
} from '../../../index.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';
import {
	createOrganization,
	createProfile,
	createUser,
} from '../../../test-support/row-fixtures.js';

type ContactKey = keyof typeof ORGANIZATION_CONTACT_COLUMNS;

/** Read off the column map, so a contact detail added there is covered here with no edit. */
const CONTACT_KEYS = Object.keys(ORGANIZATION_CONTACT_COLUMNS) as readonly ContactKey[];

/**
 * Every contact detail set to a value no other detail holds.
 *
 * Distinct values are the point: two keys swapped on the way in or out would
 * still read back as a full set if every detail held the same string.
 *
 * `mailing_country` is `character(2)`, so the tagged string would be refused
 * as too long, and a shorter one comes back space-padded. The country takes a
 * two-letter code of its own instead, and every other key, a new one included,
 * still gets the tagged string. The domain accepts only `US` and a state code
 * for the region, but these cases call the database layer under that check,
 * so a code per call is what lets a stale country show.
 */
function contactWith(tag: string, country: string): OrganizationContactInfo {
	return {
		...Object.fromEntries(CONTACT_KEYS.map((key) => [key, `${tag} ${key}`])),
		mailingCountry: country,
	} as OrganizationContactInfo;
}

function operatorInput(
	overrides: Partial<UpsertOperatorOrganizationInput> = {},
): UpsertOperatorOrganizationInput {
	return {
		workosOrganizationId: 'workos_org_operator_create',
		name: 'Operator Create District',
		slug: 'operator-create',
		subscriptionStatus: 'trial',
		billingMode: 'manual_invoice',
		billingContactName: 'Billing Person',
		billingContactEmail: 'billing@example.test',
		subscriptionNotes: 'First year on trial.',
		contact: contactWith('first', 'US'),
		...overrides,
	};
}

describeDbIntegration('operator Organization create and reads', () => {
	it('returns every contact detail under its own key from the create and both reads', async () => {
		await withTestDb(async ({ db }) => {
			const contact = contactWith('round trip', 'CA');
			const created = await upsertOperatorOrganization(db, operatorInput({ contact }));

			expect(created.contact).toEqual(contact);

			const fetched = await getOperatorOrganization(db, created.id);
			expect(fetched?.contact).toEqual(contact);

			const listed = await listOperatorOrganizations(db);
			const entry = listed.find((organization) => organization.id === created.id);
			expect(entry?.contact).toEqual(contact);

			// The stored columns, read without the module's own mapping, so a swap
			// made the same way in the write and the read still fails here.
			const row = await db
				.selectFrom('organizations')
				.selectAll()
				.where('id', '=', created.id)
				.executeTakeFirstOrThrow();
			for (const key of CONTACT_KEYS) {
				expect(row[ORGANIZATION_CONTACT_COLUMNS[key]]).toBe(contact[key]);
			}
		});
	});

	it('updates the existing Organization when the same WorkOS id is created again', async () => {
		await withTestDb(async ({ db }) => {
			const first = await upsertOperatorOrganization(db, operatorInput());

			const clearedKey: ContactKey = 'mailingAddressLine2';
			const secondContact = { ...contactWith('second', 'MX'), [clearedKey]: null };
			const second = await upsertOperatorOrganization(
				db,
				operatorInput({
					name: 'Renamed District',
					slug: 'renamed',
					subscriptionStatus: 'active',
					billingContactName: 'New Billing Person',
					billingContactEmail: 'new-billing@example.test',
					subscriptionNotes: null,
					contact: secondContact,
				}),
			);

			expect(second.id).toBe(first.id);

			const fetched = await getOperatorOrganization(db, first.id);
			expect(fetched).toMatchObject({
				id: first.id,
				name: 'Renamed District',
				slug: 'renamed',
				subscription: {
					subscriptionStatus: 'active',
					billingMode: 'manual_invoice',
					billingContactName: 'New Billing Person',
					billingContactEmail: 'new-billing@example.test',
					subscriptionNotes: null,
				},
			});
			expect(fetched?.contact).toEqual(secondContact);
			expect(fetched?.contact[clearedKey]).toBeNull();

			const listed = await listOperatorOrganizations(db);
			expect(listed.map((organization) => organization.id)).toEqual([first.id]);
		});
	});

	it('links the owner with one Profile and one active owner Membership', async () => {
		await withTestDb(async ({ db }) => {
			const ownerUserId = await createUser(db);

			const created = await upsertOperatorOrganization(
				db,
				operatorInput({
					ownerUserId,
					ownerDisplayName: 'Owner Person',
					ownerEmail: 'owner@example.test',
				}),
			);

			expect(created.ownerLinked).toBe(true);

			const profiles = await db
				.selectFrom('profiles')
				.select(['id', 'user_id', 'display_name', 'email'])
				.where('organization_id', '=', created.id)
				.execute();
			expect(profiles).toEqual([
				{
					id: expect.any(String),
					user_id: ownerUserId,
					display_name: 'Owner Person',
					email: 'owner@example.test',
				},
			]);

			const memberships = await db
				.selectFrom('memberships')
				.select(['user_id', 'profile_id', 'role', 'status'])
				.where('organization_id', '=', created.id)
				.execute();
			expect(memberships).toEqual([
				{ user_id: ownerUserId, profile_id: profiles[0]?.id, role: 'owner', status: 'active' },
			]);
		});
	});

	it('restores an existing Profile and Membership for the owner rather than adding rows', async () => {
		await withTestDb(async ({ db }) => {
			const ownerUserId = await createUser(db);
			const input = operatorInput({ ownerUserId });
			const organizationId = await createOrganization(db, {
				workos_organization_id: input.workosOrganizationId,
			});
			const profileId = await createProfile(db, organizationId, {
				user_id: ownerUserId,
				is_active: false,
				deleted_at: sql<Date>`now()`,
			});
			await db
				.insertInto('memberships')
				.values({
					organization_id: organizationId,
					user_id: ownerUserId,
					profile_id: profileId,
					role: 'collector',
					status: 'inactive',
				})
				.execute();

			const created = await upsertOperatorOrganization(db, input);

			expect(created.id).toBe(organizationId);
			expect(created.ownerLinked).toBe(true);

			const profiles = await db
				.selectFrom('profiles')
				.select(['id', 'deleted_at', 'is_active'])
				.where('organization_id', '=', organizationId)
				.execute();
			expect(profiles).toEqual([{ id: profileId, deleted_at: null, is_active: true }]);

			const memberships = await db
				.selectFrom('memberships')
				.select(['user_id', 'profile_id', 'role', 'status'])
				.where('organization_id', '=', organizationId)
				.execute();
			expect(memberships).toEqual([
				{ user_id: ownerUserId, profile_id: profileId, role: 'owner', status: 'active' },
			]);
		});
	});

	it('leaves a soft-deleted Organization out of both reads', async () => {
		await withTestDb(async ({ db }) => {
			const kept = await upsertOperatorOrganization(db, operatorInput());
			const removed = await upsertOperatorOrganization(
				db,
				operatorInput({ workosOrganizationId: 'workos_org_operator_removed', slug: 'removed' }),
			);
			await db
				.updateTable('organizations')
				.set({ deleted_at: sql<Date>`now()` })
				.where('id', '=', removed.id)
				.execute();

			await expect(getOperatorOrganization(db, removed.id)).resolves.toBeNull();
			await expect(
				getOperatorOrganization(db, '00000000-0000-4000-8000-000000000000'),
			).resolves.toBeNull();

			const listed = await listOperatorOrganizations(db);
			expect(listed.map((organization) => organization.id)).toEqual([kept.id]);
		});
	});
});
