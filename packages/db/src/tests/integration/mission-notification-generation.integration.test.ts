import { expect, it } from 'vitest';
import {
	generateMissionNotifications,
	type Kysely,
	MissionNotificationRefusedError,
	readRegistrationBufferUnits,
	type SimmerDatabase,
	sql,
	type UnitMetres,
} from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';

/**
 * Who a mission has to notify, decided against real geometry.
 *
 * Nothing about this is checkable without Postgres. The eligibility rule is an
 * `st_dwithin` against a buffer measured in a unit, the channel rule is a lateral
 * over three contact preferences, and "existing rows are not mutated by
 * regeneration" is a partial unique index. Each of those is either right in the
 * database or wrong in a way no type sees.
 *
 * The distances below are chosen against a known scale: at 35°N, 0.01° of
 * longitude is about 912 m and 0.01° of latitude about 1109 m, so a stop 0.01°
 * east of a registration is comfortably outside a 500 m buffer and comfortably
 * inside a 2 km one.
 */
describeDbIntegration('mission notification generation', () => {
	it('notifies a subscriber inside the buffer on every channel they asked for', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db, 'mn_basic');
			// 0.001° east, roughly 91 m: inside the 500 m buffer.
			await createMissionItem(db, world, -90.499);
			const registration = await createRegistration(db, world, {
				longitude: -90.5,
				bufferDistance: 500,
				unitId: world.meterUnitId,
				contactId: await createContact(db, world, {
					email: 'sam@example.test',
					preferredPhone: '555-0100',
					wantsEmail: true,
					wantsSms: true,
					wantsPhone: true,
				}),
			});
			await subscribe(db, world, registration);

			const result = await db
				.transaction()
				.execute(async (trx) => generateMissionNotifications(trx, generateInput(world)));

			expect(result.notificationTypeActive).toBe(true);
			expect(result.unitsMissing).toEqual([]);
			expect(
				result.created
					.map((row) => ({ channel: row.channel, destination: row.destination }))
					.sort(byChannel),
			).toEqual(
				[
					{ channel: 'email', destination: 'sam@example.test' },
					{ channel: 'sms', destination: '555-0100' },
					{ channel: 'phone', destination: '555-0100' },
				].sort(byChannel),
			);
		});
	});

	it('leaves out a channel with no destination, however it was asked for', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db, 'mn_channels');
			await createMissionItem(db, world, -90.499);
			// Wants everything; has only an email. A preference is not a channel —
			// `docs/public-engagement-domain.md`: rows are created only when a
			// concrete destination exists.
			const registration = await createRegistration(db, world, {
				longitude: -90.5,
				bufferDistance: 500,
				unitId: world.meterUnitId,
				contactId: await createContact(db, world, {
					email: 'sam@example.test',
					preferredPhone: null,
					wantsEmail: true,
					wantsSms: true,
					wantsPhone: true,
				}),
			});
			await subscribe(db, world, registration);

			const result = await db
				.transaction()
				.execute(async (trx) => generateMissionNotifications(trx, generateInput(world)));

			expect(result.created.map((row) => row.channel)).toEqual(['email']);
		});
	});

	/**
	 * The buffer is the whole eligibility rule, and its unit is what makes it a
	 * number. A registration priced in metres and one priced in miles with the
	 * same `buffer_distance` are different catchments, and getting that backwards
	 * would notify a neighbourhood or nobody.
	 */
	it('measures the buffer in the registration’s own unit', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db, 'mn_units');
			// 0.01° east, roughly 912 m.
			await createMissionItem(db, world, -90.49);

			const near = await createRegistration(db, world, {
				longitude: -90.5,
				bufferDistance: 500,
				unitId: world.meterUnitId,
				contactId: await createContact(db, world, { email: 'metres@example.test' }),
			});
			const far = await createRegistration(db, world, {
				longitude: -90.5,
				bufferDistance: 1,
				unitId: world.mileUnitId,
				contactId: await createContact(db, world, { email: 'miles@example.test' }),
			});
			await subscribe(db, world, near);
			await subscribe(db, world, far);

			const result = await db.transaction().execute(async (trx) =>
				generateMissionNotifications(trx, {
					...generateInput(world),
					unitMetres: [
						{ unitId: world.meterUnitId, metresPerUnit: 1 },
						{ unitId: world.mileUnitId, metresPerUnit: 1609.344 },
					],
				}),
			);

			// 912 m is outside 500 m and inside a mile.
			expect(result.created.map((row) => row.notificationRegistrationId)).toEqual([far]);
		});
	});

	it('reports a unit it was given no conversion for, rather than guessing', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db, 'mn_unpriced');
			await createMissionItem(db, world, -90.49);
			const registration = await createRegistration(db, world, {
				longitude: -90.5,
				bufferDistance: 1,
				unitId: world.mileUnitId,
				contactId: await createContact(db, world, { email: 'sam@example.test' }),
			});
			await subscribe(db, world, registration);

			const result = await db.transaction().execute(async (trx) =>
				generateMissionNotifications(trx, {
					...generateInput(world),
					// The mile is deliberately absent.
					unitMetres: [{ unitId: world.meterUnitId, metresPerUnit: 1 }],
				}),
			);

			// No catchment, so nobody is eligible — but the caller is told which unit
			// it could not price, so "nobody was nearby" is not the answer it takes
			// away.
			expect(result.created).toEqual([]);
			expect(result.unitsMissing).toEqual([world.mileUnitId]);
		});
	});

	/**
	 * Regeneration. Stops move and people subscribe, so this button gets pressed
	 * more than once, and `mission_notifications_mission_registration_channel_unique`
	 * is what stops the second press duplicating the first.
	 */
	it('adds only what is new when it runs again', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db, 'mn_regenerate');
			await createMissionItem(db, world, -90.499);
			const first = await createRegistration(db, world, {
				longitude: -90.5,
				bufferDistance: 500,
				unitId: world.meterUnitId,
				contactId: await createContact(db, world, { email: 'first@example.test' }),
			});
			await subscribe(db, world, first);

			const initial = await db
				.transaction()
				.execute(async (trx) => generateMissionNotifications(trx, generateInput(world)));
			expect(initial.created).toHaveLength(1);

			const again = await db
				.transaction()
				.execute(async (trx) => generateMissionNotifications(trx, generateInput(world)));
			expect(again.created).toEqual([]);

			// Somebody signs up after the first run.
			const second = await createRegistration(db, world, {
				longitude: -90.5,
				bufferDistance: 500,
				unitId: world.meterUnitId,
				contactId: await createContact(db, world, { email: 'second@example.test' }),
			});
			await subscribe(db, world, second);

			const third = await db
				.transaction()
				.execute(async (trx) => generateMissionNotifications(trx, generateInput(world)));
			expect(third.created.map((row) => row.notificationRegistrationId)).toEqual([second]);

			const total = await db
				.selectFrom('mission_notifications')
				.select(['id'])
				.where('mission_id', '=', world.missionId)
				.where('deleted_at', 'is', null)
				.execute();
			expect(total).toHaveLength(2);
		});
	});

	it('skips a registration that is retired, unsubscribed, or whose contact is gone', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db, 'mn_ineligible');
			await createMissionItem(db, world, -90.499);
			const near = { longitude: -90.5, bufferDistance: 500, unitId: world.meterUnitId };

			const retired = await createRegistration(db, world, {
				...near,
				contactId: await createContact(db, world, { email: 'retired@example.test' }),
			});
			await subscribe(db, world, retired);
			await db
				.updateTable('notification_registrations')
				.set({ is_active: false })
				.where('id', '=', retired)
				.execute();

			// Registered and in range, but never told us this type is their business.
			await createRegistration(db, world, {
				...near,
				contactId: await createContact(db, world, { email: 'unsubscribed@example.test' }),
			});

			const goneContactId = await createContact(db, world, { email: 'gone@example.test' });
			const goneContact = await createRegistration(db, world, {
				...near,
				contactId: goneContactId,
			});
			await subscribe(db, world, goneContact);
			await db
				.updateTable('contacts')
				.set({ deleted_at: sql`now()` })
				.where('id', '=', goneContactId)
				.execute();

			const eligible = await createRegistration(db, world, {
				...near,
				contactId: await createContact(db, world, { email: 'eligible@example.test' }),
			});
			await subscribe(db, world, eligible);

			const result = await db
				.transaction()
				.execute(async (trx) => generateMissionNotifications(trx, generateInput(world)));

			expect(result.created.map((row) => row.notificationRegistrationId)).toEqual([eligible]);
		});
	});

	it('generates nothing for a retired notification type, and says that is why', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db, 'mn_retired_type');
			await createMissionItem(db, world, -90.499);
			const registration = await createRegistration(db, world, {
				longitude: -90.5,
				bufferDistance: 500,
				unitId: world.meterUnitId,
				contactId: await createContact(db, world, { email: 'sam@example.test' }),
			});
			await subscribe(db, world, registration);
			await db
				.updateTable('notification_types')
				.set({ is_active: false })
				.where('id', '=', world.notificationTypeId)
				.execute();

			const result = await db
				.transaction()
				.execute(async (trx) => generateMissionNotifications(trx, generateInput(world)));

			// An empty result and a retired type are different things to tell an
			// operator, so both are in the answer.
			expect(result.created).toEqual([]);
			expect(result.notificationTypeActive).toBe(false);
		});
	});

	it('is a valid no-op when the mission has stops and nobody is near them', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db, 'mn_nobody');
			await createMissionItem(db, world, -90.499);

			const result = await db
				.transaction()
				.execute(async (trx) => generateMissionNotifications(trx, generateInput(world)));

			expect(result.created).toEqual([]);
			expect(result.notificationTypeActive).toBe(true);
		});
	});

	it('refuses a mission that is itemless, completed, or cancelled', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db, 'mn_refusals');

			await expect(
				db
					.transaction()
					.execute(async (trx) => generateMissionNotifications(trx, generateInput(world))),
			).rejects.toMatchObject({ reason: 'mission_has_no_items' });

			await createMissionItem(db, world, -90.499);

			await db
				.updateTable('missions')
				.set({ completed_at: sql`now()` })
				.where('id', '=', world.missionId)
				.execute();
			await expect(
				db
					.transaction()
					.execute(async (trx) => generateMissionNotifications(trx, generateInput(world))),
			).rejects.toMatchObject({ reason: 'mission_completed' });

			await db
				.updateTable('missions')
				.set({ completed_at: null, cancelled_at: sql`now()` })
				.where('id', '=', world.missionId)
				.execute();
			await expect(
				db
					.transaction()
					.execute(async (trx) => generateMissionNotifications(trx, generateInput(world))),
			).rejects.toBeInstanceOf(MissionNotificationRefusedError);
		});
	});

	it('refuses a mission with no notification type, because there is nothing to snapshot', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db, 'mn_no_type');
			await createMissionItem(db, world, -90.499);
			await db
				.updateTable('missions')
				.set({ notification_type_id: null })
				.where('id', '=', world.missionId)
				.execute();

			await expect(
				db
					.transaction()
					.execute(async (trx) => generateMissionNotifications(trx, generateInput(world))),
			).rejects.toMatchObject({ reason: 'mission_has_no_notification_type' });
		});
	});

	it('does not see another agency’s mission', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db, 'mn_owner');
			const other = await seedWorld(db, 'mn_other');
			await createMissionItem(db, world, -90.499);

			await expect(
				db.transaction().execute(async (trx) =>
					generateMissionNotifications(trx, {
						...generateInput(world),
						organizationId: other.organizationId,
					}),
				),
			).rejects.toMatchObject({ reason: 'mission_not_found' });
		});
	});

	it('reads back only the buffer units its own registrations use', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedWorld(db, 'mn_unit_read');
			await createRegistration(db, world, {
				longitude: -90.5,
				bufferDistance: 1,
				unitId: world.mileUnitId,
				contactId: await createContact(db, world, { email: 'sam@example.test' }),
			});

			const units = await db
				.transaction()
				.execute(async (trx) => readRegistrationBufferUnits(trx, world.organizationId));

			expect(units).toEqual([{ unitId: world.mileUnitId, unitCode: 'mile' }]);
		});
	});
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Db = Kysely<SimmerDatabase>;

interface World {
	readonly organizationId: string;
	readonly missionId: string;
	readonly notificationTypeId: string;
	readonly meterUnitId: string;
	readonly mileUnitId: string;
}

/** Metres priced, miles deliberately not — a test that needs both says so. */
function generateInput(world: World): {
	readonly missionId: string;
	readonly organizationId: string;
	readonly actorProfileId: null;
	readonly unitMetres: readonly UnitMetres[];
} {
	return {
		missionId: world.missionId,
		organizationId: world.organizationId,
		actorProfileId: null,
		unitMetres: [{ unitId: world.meterUnitId, metresPerUnit: 1 }],
	};
}

function byChannel(left: { channel: string }, right: { channel: string }): number {
	return left.channel.localeCompare(right.channel);
}

/** An agency with one scheduled mission, a notification type, and two units. */
async function seedWorld(db: Db, slug: string): Promise<World> {
	const organization = await db
		.insertInto('organizations')
		.values({ workos_organization_id: `workos_${slug}`, name: `${slug} District` })
		.returning(['id'])
		.executeTakeFirstOrThrow();

	const notificationType = await db
		.insertInto('notification_types')
		.values({ organization_id: organization.id, name: 'Adulticiding' })
		.returning(['id'])
		.executeTakeFirstOrThrow();

	const mission = await db
		.insertInto('missions')
		.values({
			organization_id: organization.id,
			control_type: 'application',
			scheduled_start_at: sql`now() + interval '1 day'`,
			notification_type_id: notificationType.id,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();

	return {
		organizationId: organization.id,
		missionId: mission.id,
		notificationTypeId: notificationType.id,
		meterUnitId: await unitByCode(db, 'meter', 'm', 'si'),
		mileUnitId: await unitByCode(db, 'mile', 'mi', 'us_customary'),
	};
}

/**
 * A unit row, found or created.
 *
 * `units` is global and `units_code_unique` is global with it, so a test that
 * seeds two agencies cannot insert `meter` twice. The code is the real one
 * because that is what `packages/domain` prices, and it is what
 * `readRegistrationBufferUnits` hands back for pricing.
 */
async function unitByCode(
	db: Db,
	code: string,
	abbreviation: string,
	unitSystem: 'si' | 'us_customary',
): Promise<string> {
	const existing = await db
		.selectFrom('units')
		.select(['id'])
		.where('code', '=', code)
		.executeTakeFirst();
	if (existing !== undefined) {
		return existing.id;
	}
	const row = await db
		.insertInto('units')
		.values({
			code,
			unit_name: code,
			abbreviation,
			unit_type: 'distance',
			unit_system: unitSystem,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createMissionItem(db: Db, world: World, longitude: number): Promise<string> {
	const row = await db
		.insertInto('mission_items')
		.values({
			organization_id: world.organizationId,
			mission_id: world.missionId,
			geom: sql`st_setsrid(st_makepoint(${longitude}, 35.5), 4326)`,
			position: 1,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createContact(
	db: Db,
	world: World,
	input: {
		readonly email?: string | null;
		readonly preferredPhone?: string | null;
		readonly wantsEmail?: boolean;
		readonly wantsSms?: boolean;
		readonly wantsPhone?: boolean;
	},
): Promise<string> {
	const row = await db
		.insertInto('contacts')
		.values({
			organization_id: world.organizationId,
			contact_name: 'Sam Rivera',
			email: input.email ?? null,
			preferred_phone: input.preferredPhone ?? null,
			// Email-only by default, so a test that cares about one channel does not
			// have to state the other two.
			wants_email: input.wantsEmail ?? true,
			wants_sms: input.wantsSms ?? false,
			wants_phone: input.wantsPhone ?? false,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createRegistration(
	db: Db,
	world: World,
	input: {
		readonly longitude: number;
		readonly bufferDistance: number | null;
		readonly unitId: string | null;
		readonly contactId: string;
	},
): Promise<string> {
	const row = await db
		.insertInto('notification_registrations')
		.values({
			organization_id: world.organizationId,
			contact_id: input.contactId,
			geom: sql`st_setsrid(st_makepoint(${input.longitude}, 35.5), 4326)`,
			buffer_distance: input.bufferDistance,
			buffer_unit_id: input.unitId,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function subscribe(db: Db, world: World, registrationId: string): Promise<void> {
	await db
		.insertInto('notification_registration_types')
		.values({
			organization_id: world.organizationId,
			notification_registration_id: registrationId,
			notification_type_id: world.notificationTypeId,
		})
		.execute();
}
