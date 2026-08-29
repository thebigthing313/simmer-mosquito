import { expect, it } from 'vitest';
import {
	type DuplicateGroup,
	type Kysely,
	readDuplicateCandidates,
	type SimmerDatabase,
	sql,
} from '../../../index.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';

/**
 * What the cleanup page proposes, against real rows.
 *
 * Every question here is one the SQL answers and no unit test can: whether a
 * shared name survives a difference in case and padding, whether two rows a few
 * metres apart cluster while two rows a street apart do not, and whether the
 * organization and soft-delete filters hold. A proposal that includes another
 * agency's row, or a row that is already gone, is worse than no proposal at all,
 * because the merge it leads to names ids the writer will refuse.
 */
describeDbIntegration('duplicate candidates', () => {
	it('groups addresses that share a display name, ignoring case and padding', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'address_name');
			const first = await createAddress(db, org, '412 Oak St');
			const second = await createAddress(db, org, '  412 OAK st ');
			await createAddress(db, org, '88 Pine Ave');

			const groups = await readDuplicateCandidates(db, {
				recordType: 'address',
				organizationId: org,
			});

			const named = groupsFor(groups, 'same_name');
			expect(named).toHaveLength(1);
			expect(ids(named[0])).toEqual(new Set([first, second]));
			expect(named[0]?.value).toBe('412 oak st');
		});
	});

	it('orders the records in a group oldest first, which is what the page preselects', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'address_order');
			const oldest = await createAddress(db, org, 'Depot');
			const middle = await createAddress(db, org, 'Depot');
			const newest = await createAddress(db, org, 'Depot');
			await db
				.updateTable('addresses')
				.set({ created_at: sql`now() - interval '3 days'` })
				.where('id', '=', oldest)
				.execute();
			await db
				.updateTable('addresses')
				.set({ created_at: sql`now() - interval '2 days'` })
				.where('id', '=', middle)
				.execute();

			const groups = await readDuplicateCandidates(db, {
				recordType: 'address',
				organizationId: org,
			});

			const named = groupsFor(groups, 'same_name');
			expect(named[0]?.records.map((record) => record.id)).toEqual([oldest, middle, newest]);
		});
	});

	it('clusters habitats that sit within ten metres and leaves a distant one alone', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'habitat_place');
			// Roughly 5 m apart in latitude, then 200 m away.
			const first = await createHabitatAt(db, org, 'Catch basin 41', -90.5, 35.5);
			const second = await createHabitatAt(db, org, 'CB-41', -90.5, 35.500045);
			await createHabitatAt(db, org, 'Ditch behind the school', -90.5, 35.5018);

			const groups = await readDuplicateCandidates(db, {
				recordType: 'habitat',
				organizationId: org,
			});

			const placed = groupsFor(groups, 'same_place');
			expect(placed).toHaveLength(1);
			expect(ids(placed[0])).toEqual(new Set([first, second]));
		});
	});

	it('chains a cluster through a shared neighbour', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'habitat_chain');
			// Each hop is under ten metres; the ends are about twelve metres apart, so
			// they are one place only if the middle row joins them.
			const west = await createHabitatAt(db, org, 'West', -90.5, 35.5);
			const middle = await createHabitatAt(db, org, 'Middle', -90.5, 35.500054);
			const east = await createHabitatAt(db, org, 'East', -90.5, 35.500108);

			const groups = await readDuplicateCandidates(db, {
				recordType: 'habitat',
				organizationId: org,
			});

			const placed = groupsFor(groups, 'same_place');
			expect(placed).toHaveLength(1);
			expect(ids(placed[0])).toEqual(new Set([west, middle, east]));
		});
	});

	it('does not propose the same set twice when rows share a name and a spot', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'address_overlap');
			await createAddressAt(db, org, 'Depot', -90.5, 35.5);
			await createAddressAt(db, org, 'depot', -90.5, 35.500018);

			const groups = await readDuplicateCandidates(db, {
				recordType: 'address',
				organizationId: org,
			});

			expect(groups).toHaveLength(1);
			expect(groups[0]?.reason).toBe('same_name');
		});
	});

	it('groups contacts on a shared email and on a shared phone', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'contact_keys');
			const emailed = await createContact(db, org, {
				name: 'A Reyes',
				email: 'A.Reyes@example.org',
			});
			const alsoEmailed = await createContact(db, org, {
				name: 'Ana Reyes',
				email: 'a.reyes@example.org',
			});
			const called = await createContact(db, org, { name: 'K Osei', phone: '555-0100' });
			const alsoCalled = await createContact(db, org, { name: 'Kofi Osei', phone: '555-0100' });

			const groups = await readDuplicateCandidates(db, {
				recordType: 'contact',
				organizationId: org,
			});

			expect(ids(groupsFor(groups, 'same_email')[0])).toEqual(new Set([emailed, alsoEmailed]));
			expect(ids(groupsFor(groups, 'same_phone')[0])).toEqual(new Set([called, alsoCalled]));
		});
	});

	it('never proposes a row from another agency or a row that is already deleted', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'duplicates_scope');
			const other = await createOrganization(db, 'duplicates_other');
			const kept = await createAddress(db, org, 'Shared name');
			const retired = await createAddress(db, org, 'Shared name');
			await createAddress(db, other, 'Shared name');
			await createAddress(db, other, 'Shared name');
			await db
				.updateTable('addresses')
				.set({ deleted_at: sql`now()` })
				.where('id', '=', retired)
				.execute();

			const groups = await readDuplicateCandidates(db, {
				recordType: 'address',
				organizationId: org,
			});

			expect(groups).toHaveLength(0);
			expect(kept).toBeTruthy();
		});
	});

	it('does not group habitats on a name they do not have', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'habitat_blank');
			await createHabitatAt(db, org, null, -90.5, 35.5);
			await createHabitatAt(db, org, '   ', -90.6, 35.6);
			await createHabitatAt(db, org, null, -90.7, 35.7);

			const groups = await readDuplicateCandidates(db, {
				recordType: 'habitat',
				organizationId: org,
			});

			expect(groupsFor(groups, 'same_name')).toHaveLength(0);
		});
	});

	it('carries the label, the supporting detail and the coordinates the page draws', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'address_fields');
			await createAddressAt(db, org, 'Depot', -90.5, 35.5);
			await createAddressAt(db, org, 'Depot', -90.5, 35.5);
			await db
				.updateTable('addresses')
				.set({ address_line_1: '412 Oak St', locality: 'Marion', postal_code: '72364' })
				.where('organization_id', '=', org)
				.execute();

			const groups = await readDuplicateCandidates(db, {
				recordType: 'address',
				organizationId: org,
			});

			const record = groups[0]?.records[0];
			expect(record?.label).toBe('Depot');
			expect(record?.detail).toBe('412 Oak St, Marion, 72364');
			expect(record?.lat).toBeCloseTo(35.5, 4);
			expect(record?.lng).toBeCloseTo(-90.5, 4);
			expect(record?.createdAt).toBeInstanceOf(Date);
		});
	});
});

type Db = Kysely<SimmerDatabase>;

function groupsFor(
	groups: readonly DuplicateGroup[],
	reason: DuplicateGroup['reason'],
): readonly DuplicateGroup[] {
	return groups.filter((group) => group.reason === reason);
}

function ids(group: DuplicateGroup | undefined): Set<string> {
	return new Set((group?.records ?? []).map((record) => record.id));
}

async function createOrganization(db: Db, slug: string): Promise<string> {
	const row = await db
		.insertInto('organizations')
		.values({ workos_organization_id: `workos_${slug}`, name: `${slug} District` })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

function createAddress(db: Db, organizationId: string, displayName: string): Promise<string> {
	return createAddressAt(db, organizationId, displayName, -90.5, 35.5);
}

async function createAddressAt(
	db: Db,
	organizationId: string,
	displayName: string,
	lng: number,
	lat: number,
): Promise<string> {
	const row = await db
		.insertInto('addresses')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(${lng}, ${lat}), 4326)`,
			display_name: displayName,
			country: 'US',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createHabitatAt(
	db: Db,
	organizationId: string,
	habitatName: string | null,
	lng: number,
	lat: number,
): Promise<string> {
	const row = await db
		.insertInto('habitats')
		.values({
			organization_id: organizationId,
			address_id: null,
			geom: sql`st_setsrid(st_makepoint(${lng}, ${lat}), 4326)`,
			habitat_name: habitatName,
			description: 'Roadside ditch',
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createContact(
	db: Db,
	organizationId: string,
	fields: { readonly name: string; readonly email?: string; readonly phone?: string },
): Promise<string> {
	const row = await db
		.insertInto('contacts')
		.values({
			organization_id: organizationId,
			contact_name: fields.name,
			email: fields.email ?? null,
			preferred_phone: fields.phone ?? null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
