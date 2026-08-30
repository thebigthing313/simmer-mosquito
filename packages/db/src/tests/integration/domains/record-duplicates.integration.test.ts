import { expect, it } from 'vitest';
import {
	type DuplicateGroup,
	type Kysely,
	readDuplicateCandidates,
	readNearbyHabitats,
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

	it('groups addresses on a street address and on exact coordinates', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'address_keys');
			const first = await createAddressAt(db, org, 'Depot', -90.5, 35.5);
			const second = await createAddressAt(db, org, 'Rear entrance', -90.5, 35.5);
			await createAddressAt(db, org, 'Office', -90.6, 35.6);
			await db
				.updateTable('addresses')
				.set({ address_line_1: '412 Oak St' })
				.where('id', 'in', [first, second])
				.execute();

			const groups = await readDuplicateCandidates(db, {
				recordType: 'address',
				organizationId: org,
			});

			const street = groupsFor(groups, 'same_street');
			expect(street).toHaveLength(1);
			expect(ids(street[0])).toEqual(new Set([first, second]));
			// Deduped: the coordinate group names the same two records, and one merge
			// under two headings makes the second look like more work still to do.
			expect(groupsFor(groups, 'same_coordinates')).toHaveLength(0);
		});
	});

	it('never proposes addresses that are merely near each other', async () => {
		await withTestDb(async ({ db }) => {
			// Two metres apart. An address book's duplicates come from the same
			// geocode of the same string and land on the same point, so a radius here
			// proposes the house next door rather than a duplicate.
			await withNearbyAddresses(db, async (org) => {
				const groups = await readDuplicateCandidates(db, {
					recordType: 'address',
					organizationId: org,
				});

				expect(groups).toEqual([]);
			});
		});
	});

	it('groups addresses whose coordinates match exactly', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'address_exact');
			const first = await createAddressAt(db, org, 'Depot', -90.5, 35.5);
			const second = await createAddressAt(db, org, 'Rear entrance', -90.5, 35.5);

			const groups = await readDuplicateCandidates(db, {
				recordType: 'address',
				organizationId: org,
			});

			const placed = groupsFor(groups, 'same_coordinates');
			expect(placed).toHaveLength(1);
			expect(ids(placed[0])).toEqual(new Set([first, second]));
			expect(placed[0]?.value).toBe('35.5, -90.5');
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

	it('carries the values a merge could keep, with blank read as nothing said', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'contact_carry');
			await createContact(db, org, { name: 'Ana Reyes', phone: '555-0100' });
			const other = await createContact(db, org, { name: 'Ana Reyes', phone: '555-0100' });
			await db
				.updateTable('contacts')
				.set({ email: '  ana@example.org ', company: '   ', title: null })
				.where('id', '=', other)
				.execute();

			const groups = await readDuplicateCandidates(db, {
				recordType: 'contact',
				organizationId: org,
			});

			const filled = groupsFor(groups, 'same_name')[0]?.records.find(
				(record) => record.id === other,
			);
			expect(filled?.fields.email).toBe('ana@example.org');
			// A column of spaces and a null are the same answer, and the page's
			// carry-forward rule turns on which records answer at all.
			expect(filled?.fields.company).toBeNull();
			expect(filled?.fields.title).toBeNull();
			// Named on the config, so present as a key even when the record is empty.
			expect(Object.hasOwn(filled?.fields ?? {}, 'department')).toBe(true);
			// Never the consent columns: false is an answer, and carrying it forward
			// would raise a flag nobody gave.
			expect(Object.hasOwn(filled?.fields ?? {}, 'wants_email')).toBe(false);
		});
	});
});

/**
 * The habitats standing near one habitat.
 *
 * Two records for one catch basin agree about nothing except where they are, so
 * this is the only evidence a habitat merge has. Every question here is one the
 * SQL answers: whether the radius means metres at this latitude, whether the
 * agency and soft-delete filters hold, and whether the habitat being kept is
 * excluded from its own answer. A search that returned the target would offer a
 * merge of a record into itself, which the domain refuses after the user has
 * committed to it.
 */
describeDbIntegration('nearby habitats', () => {
	it('answers the habitats inside the radius, nearest first, and not itself', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'nearby_radius');
			const home = await createHabitatAt(db, org, 'Catch basin 41', -90.5, 35.5);
			// About 100 m and 220 m north. A degree of latitude is 111 km anywhere.
			const near = await createHabitatAt(db, org, 'CB-41', -90.5, 35.5009);
			const further = await createHabitatAt(db, org, 'Basin behind 41', -90.5, 35.502);
			await createHabitatAt(db, org, 'Ditch by the school', -90.5, 35.52);

			const result = await readNearbyHabitats(db, {
				habitatId: home,
				organizationId: org,
				radiusMetres: 250,
			});

			expect(result?.target.id).toBe(home);
			expect(result?.candidates.map((candidate) => candidate.id)).toEqual([near, further]);
			expect(result?.candidates[0]?.distanceMetres).toBeGreaterThan(90);
			expect(result?.candidates[0]?.distanceMetres).toBeLessThan(110);
		});
	});

	it('reaches a habitat the smaller radius left out', async () => {
		// The control that widens the search is the whole point of taking a radius
		// as an argument: how far apart two records for one place land depends on
		// how each was filed.
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'nearby_widen');
			const home = await createHabitatAt(db, org, 'Culvert', -90.5, 35.5);
			const distant = await createHabitatAt(db, org, 'Culvert, north end', -90.5, 35.504);

			const tight = await readNearbyHabitats(db, {
				habitatId: home,
				organizationId: org,
				radiusMetres: 100,
			});
			const wide = await readNearbyHabitats(db, {
				habitatId: home,
				organizationId: org,
				radiusMetres: 1000,
			});

			expect(tight?.candidates).toEqual([]);
			expect(wide?.candidates.map((candidate) => candidate.id)).toEqual([distant]);
		});
	});

	it('never answers with another agency habitat or one already deleted', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'nearby_scope');
			const other = await createOrganization(db, 'nearby_other');
			const home = await createHabitatAt(db, org, 'Culvert', -90.5, 35.5);
			const retired = await createHabitatAt(db, org, 'Culvert (dup)', -90.5, 35.5001);
			await createHabitatAt(db, other, 'Culvert', -90.5, 35.5001);
			await db
				.updateTable('habitats')
				.set({ deleted_at: sql`now()` })
				.where('id', '=', retired)
				.execute();

			const result = await readNearbyHabitats(db, {
				habitatId: home,
				organizationId: org,
				radiusMetres: 1000,
			});

			expect(result?.candidates).toEqual([]);
		});
	});

	it('offers an inactive habitat and says that it is one', async () => {
		// A merge may retire an inactive habitat, so hiding it would leave the only
		// way to fold it in out of reach. Saying which is which is what stops it
		// reading as a live duplicate.
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'nearby_inactive');
			const home = await createHabitatAt(db, org, 'Culvert', -90.5, 35.5);
			const inactive = await createHabitatAt(db, org, 'Culvert (old)', -90.5, 35.5001);
			await db
				.updateTable('habitats')
				.set({ is_active: false })
				.where('id', '=', inactive)
				.execute();

			const result = await readNearbyHabitats(db, {
				habitatId: home,
				organizationId: org,
				radiusMetres: 1000,
			});

			expect(result?.candidates.map((candidate) => candidate.isActive)).toEqual([false]);
		});
	});

	it('carries the values the merge form fills the surviving record from', async () => {
		// The target comes back through the same select as the candidates. A page
		// that built its half from a synced row instead would be a second spelling
		// of the same thing, free to drift.
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'nearby_fields');
			const home = await createHabitatAt(db, org, 'Culvert', -90.5, 35.5);
			await createHabitatAt(db, org, '  ', -90.5, 35.5001);

			const result = await readNearbyHabitats(db, {
				habitatId: home,
				organizationId: org,
				radiusMetres: 1000,
			});

			expect(result?.target.fields).toEqual({
				habitat_name: 'Culvert',
				description: 'Roadside ditch',
			});
			expect(result?.candidates[0]?.fields.habitat_name).toBeNull();
			expect(result?.candidates[0]?.label).toBe('  ');
		});
	});

	it('answers nothing at all for a habitat this agency does not have', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'nearby_missing');
			const other = await createOrganization(db, 'nearby_missing_other');
			const theirs = await createHabitatAt(db, other, 'Culvert', -90.5, 35.5);

			// Undefined rather than an empty list, so the route answers 404 rather
			// than "no duplicates" for a record the caller cannot see.
			expect(
				await readNearbyHabitats(db, {
					habitatId: theirs,
					organizationId: org,
					radiusMetres: 1000,
				}),
			).toBeUndefined();
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

/** Two addresses a couple of metres apart, which is not a duplicate any more. */
async function withNearbyAddresses(
	db: Db,
	body: (organizationId: string) => Promise<void>,
): Promise<void> {
	const org = await createOrganization(db, 'address_near');
	await createAddressAt(db, org, 'Depot', -90.5, 35.5);
	await createAddressAt(db, org, 'Neighbour', -90.5, 35.500018);
	await body(org);
}
