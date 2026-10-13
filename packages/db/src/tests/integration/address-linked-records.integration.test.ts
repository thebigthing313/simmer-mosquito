import { expect, it } from 'vitest';
import type { DbExecutor, LinkedRecordFamilyPage } from '../../index.js';
import { addressExistsInOrganization, listAddressLinkedRecords, sql } from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';
import {
	createAddress,
	createApplication,
	createBiocontrolAction,
	createCollectionMethod,
	createContact,
	createInsecticide,
	createInspection,
	createMission,
	createMissionItem,
	createNotificationRegistration,
	createOrganization,
	createOutreachAction,
	createRequestedControlAction,
	createServiceRequest,
	createSourceReduction,
	createSourceReductionMethod,
	createUnit,
} from '../../test-support/row-fixtures.js';

const timeZone = 'America/New_York';

/** A collection recorded away from a Trap, which is what a landing-rate count is. */
async function insertLandingRate(
	db: DbExecutor,
	organizationId: string,
	links: { readonly addressId: string; readonly durationUnitId: string },
	collectionDate: string,
): Promise<string> {
	const method = await createCollectionMethod(db, organizationId, {
		name: `Landing rate ${collectionDate}`,
	});
	const row = await db
		.insertInto('collections')
		.values({
			organization_id: organizationId,
			address_id: links.addressId,
			collection_method_id: method,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			collection_timing_mode: 'collection_date_duration',
			collection_date: sql`${collectionDate}::date`,
			duration_amount: 10,
			duration_unit_id: links.durationUnitId,
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

function page(
	families: readonly LinkedRecordFamilyPage[],
	family: LinkedRecordFamilyPage['family'],
): LinkedRecordFamilyPage {
	const found = families.find((entry) => entry.family === family);
	if (found === undefined) {
		throw new Error(`No ${family} page.`);
	}
	return found;
}

describeDbIntegration('address linked records', () => {
	// The issue's case: an Address with a service request and a landing-rate
	// collection named it, and the page said nothing was there because it read
	// only what is sited at the Address.
	it('lists a service request and a landing-rate collection that name the address', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const addressId = await createAddress(db, organizationId);
			const contactId = await createContact(db, organizationId);
			const requestId = await createServiceRequest(db, organizationId, { addressId, contactId });
			// Units are global and their names unique, so each case makes one and
			// hands it to everything that needs a unit.
			const durationUnitId = await createUnit(db);
			const collectionId = await insertLandingRate(
				db,
				organizationId,
				{ addressId, durationUnitId },
				'2026-08-03',
			);

			const { families, limit } = await listAddressLinkedRecords(db, {
				organizationId,
				addressId,
				timeZone,
			});

			expect(limit).toBe(25);
			expect(page(families, 'requests')).toMatchObject({
				total: 1,
				items: [{ id: requestId, category: 'serviceRequest', detail: 'open' }],
			});
			expect(page(families, 'collections')).toMatchObject({
				total: 1,
				items: [{ id: collectionId, category: 'collection', date: '2026-08-03' }],
			});
		});
	});

	it('reads every one of the ten tables, in every status', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const addressId = await createAddress(db, organizationId);
			const contactId = await createContact(db, organizationId, { contact_name: 'J. Ortiz' });
			const unitId = await createUnit(db);
			const insecticideId = await createInsecticide(db, organizationId, unitId);
			const reductionMethodId = await createSourceReductionMethod(db, organizationId);
			const biocontrolMethod = await db
				.insertInto('biocontrol_methods')
				.values({ organization_id: organizationId, name: 'Gambusia' })
				.returning(['id'])
				.executeTakeFirstOrThrow();
			const outreachMethod = await db
				.insertInto('outreach_methods')
				.values({ organization_id: organizationId, name: 'Door hanger' })
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const ids = {
				serviceRequest: await createServiceRequest(
					db,
					organizationId,
					{ addressId, contactId },
					{ closed_at: sql`now()` },
				),
				notificationRegistration: await createNotificationRegistration(
					db,
					organizationId,
					contactId,
					{ address_id: addressId, is_active: false },
				),
				inspection: await createInspection(db, organizationId, { address_id: addressId }),
				collection: await insertLandingRate(
					db,
					organizationId,
					{ addressId, durationUnitId: unitId },
					'2026-08-02',
				),
				application: await createApplication(
					db,
					organizationId,
					{ insecticideId, unitId },
					{ address_id: addressId },
				),
				sourceReduction: await createSourceReduction(
					db,
					organizationId,
					{ methodId: reductionMethodId, unitId },
					{ address_id: addressId },
				),
				biocontrol: await createBiocontrolAction(
					db,
					organizationId,
					{ methodId: biocontrolMethod.id, unitId },
					{ address_id: addressId },
				),
				outreach: await createOutreachAction(db, organizationId, outreachMethod.id, {
					address_id: addressId,
				}),
				requestedControlAction: await createRequestedControlAction(db, organizationId, {
					address_id: addressId,
					resolved_at: sql`now()`,
				}),
				missionItem: await createMissionItem(
					db,
					organizationId,
					await createMission(db, organizationId),
					{ address_id: addressId, skipped_at: sql`now()`, skip_reason: 'Gate locked' },
				),
			};

			const { families } = await listAddressLinkedRecords(db, {
				organizationId,
				addressId,
				timeZone,
			});
			const read = new Map(
				families.flatMap((entry) => entry.items.map((item) => [item.category, item] as const)),
			);

			for (const [category, id] of Object.entries(ids)) {
				expect(read.get(category as never)?.id, category).toBe(id);
			}
			expect(read.get('serviceRequest')?.detail).toBe('closed');
			expect(read.get('notificationRegistration')).toMatchObject({
				detail: 'inactive',
				contactId,
				contactName: 'J. Ortiz',
			});
			expect(read.get('requestedControlAction')).toMatchObject({
				detail: 'resolved',
				controlType: 'application',
				label: 'Standing water behind the levee.',
			});
			expect(read.get('missionItem')?.detail).toBe('skipped');
			expect(families.map((entry) => entry.family)).toEqual([
				'requests',
				'inspections',
				'collections',
				'controlActions',
				'outreach',
				'requestedControlActions',
				'missionStops',
			]);
			expect(page(families, 'requests').total).toBe(2);
			expect(page(families, 'controlActions').total).toBe(3);
		});
	});

	it('caps each family at its newest 25 and counts them all', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const addressId = await createAddress(db, organizationId);
			for (let day = 1; day <= 27; day += 1) {
				await createInspection(db, organizationId, {
					address_id: addressId,
					inspection_date: sql`${`2026-07-${String(day).padStart(2, '0')}`}::date`,
				});
			}

			const { families } = await listAddressLinkedRecords(db, {
				organizationId,
				addressId,
				timeZone,
			});
			const inspections = page(families, 'inspections');

			expect(inspections.total).toBe(27);
			expect(inspections.items).toHaveLength(25);
			expect(inspections.items[0]?.date).toBe('2026-07-27');
			expect(inspections.items.at(-1)?.date).toBe('2026-07-03');
		});
	});

	// ADR 0012: a stop links to the record that closed it, and the row names it.
	it('names a mission stop’s mission, its status and the record that closed it', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const addressId = await createAddress(db, organizationId);
			const unitId = await createUnit(db);
			const insecticideId = await createInsecticide(db, organizationId, unitId);
			const missionId = await createMission(db, organizationId, { mission_name: 'North ditches' });
			const done = await createMissionItem(db, organizationId, missionId, {
				address_id: addressId,
				name: 'Culvert behind the school',
				completed_at: sql`timestamptz '2026-08-05 14:00:00+00'`,
			});
			const open = await createMissionItem(db, organizationId, missionId, {
				address_id: addressId,
				position: 2,
			});
			const applicationId = await createApplication(
				db,
				organizationId,
				{ insecticideId, unitId },
				{ mission_item_id: done },
			);

			const { families } = await listAddressLinkedRecords(db, {
				organizationId,
				addressId,
				timeZone,
			});
			const stops = page(families, 'missionStops');

			expect(stops.total).toBe(2);
			expect(stops.items.find((item) => item.id === done)).toMatchObject({
				detail: 'done',
				label: 'Culvert behind the school',
				missionId,
				missionName: 'North ditches',
				controlType: 'application',
				closedByCategory: 'application',
				closedById: applicationId,
				closedByRefId: insecticideId,
			});
			expect(stops.items.find((item) => item.id === open)).toMatchObject({
				detail: 'open',
				missionId,
				closedByCategory: null,
				closedById: null,
			});
		});
	});

	// The read is the Organization's. A row in another Organization that names
	// this address's id, which only a direct write could produce, stays out, and
	// the address is not found from the other side, which is what the route
	// answers 404 on before it reads anything.
	it('never returns records from another organization', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const otherOrganizationId = await createOrganization(db);
			const addressId = await createAddress(db, organizationId);
			const contactId = await createContact(db, organizationId);
			const otherContactId = await createContact(db, otherOrganizationId);
			const ownRequest = await createServiceRequest(db, organizationId, { addressId, contactId });
			await createServiceRequest(db, otherOrganizationId, {
				addressId,
				contactId: otherContactId,
			});
			await createInspection(db, otherOrganizationId, { address_id: addressId });
			await insertLandingRate(
				db,
				otherOrganizationId,
				{ addressId, durationUnitId: await createUnit(db) },
				'2026-08-04',
			);
			await createMissionItem(
				db,
				otherOrganizationId,
				await createMission(db, otherOrganizationId),
				{ address_id: addressId },
			);

			const own = await listAddressLinkedRecords(db, { organizationId, addressId, timeZone });
			expect(own.families.flatMap((entry) => entry.items.map((item) => item.id))).toEqual([
				ownRequest,
			]);
			expect(own.families.reduce((sum, entry) => sum + entry.total, 0)).toBe(1);

			expect(
				await addressExistsInOrganization(db, { organizationId: otherOrganizationId, addressId }),
			).toBe(false);
			expect(await addressExistsInOrganization(db, { organizationId, addressId })).toBe(true);
		});
	});

	it('leaves deleted records out', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const addressId = await createAddress(db, organizationId);
			await createInspection(db, organizationId, {
				address_id: addressId,
				deleted_at: sql`now()`,
			});

			const { families } = await listAddressLinkedRecords(db, {
				organizationId,
				addressId,
				timeZone,
			});

			expect(page(families, 'inspections')).toEqual({
				family: 'inspections',
				total: 0,
				items: [],
			});
		});
	});
});
