/**
 * The history check and the collision check, refusing over real HTTP.
 *
 * Every case sends its flag as `false`, which is the only way to withhold one:
 * `acknowledged()` reads an absent flag as confirmed, deliberately, so that no
 * write a client makes today starts failing. Nothing in `apps/web` sends
 * `false` for any of these yet, and #319 is that half. Without these cases the
 * guards would be correct and unexercised, and would stay that way until a form
 * asked, by which point nobody would remember what the answer was supposed to
 * be.
 *
 * Every case also asserts the row is untouched. Both checks run before the
 * first write, and a refusal that has already written half of what it was going
 * to is worse than no refusal.
 *
 * The pair to read together is the rename with citing rows and the rename
 * without them. The second is the whole of the "what counts as history"
 * decision: any citing row asks, none asks nothing, and there is no interval
 * anywhere.
 */

import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { expect, it } from 'vitest';
import { registerAdultSurveillanceCommandRoutes } from '../../adult-surveillance-commands/index.js';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables, OperatorAuthContext } from '../../auth-middleware.js';
import { registerFoundationCommandRoutes } from '../../foundation-commands/index.js';
import { registerPublicEngagementCommandRoutes } from '../../public-engagement-commands.js';
import { registerTableCommandRoutes } from '../../table-commands/dispatch.js';
import { speciesTableCommands } from '../../table-commands/taxonomy.js';

describeDbIntegration('history and collision refusals', () => {
	// -----------------------------------------------------------------------
	// A catalog rename, with and without history behind it
	// -----------------------------------------------------------------------

	it('refuses a catalog rename with collections behind it, and writes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'method_rename_withheld');
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId);
			await createCollection(db, org, trapId, methodId);

			const response = await lookupApp(db, org, actor).request(
				`/foundation/collection-methods/${methodId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						name: 'CDC light trap (rev 2)',
						acknowledgedHistoricalLabelChange: false,
					}),
				},
			);

			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({
				error: 'acknowledgement_required',
				flag: 'acknowledgedHistoricalLabelChange',
				// The trap points at the method too, and both read under its name.
				consequences: [
					{ key: 'collectionMethodTraps', count: 1, singular: 'trap' },
					{ key: 'collectionMethodCollections', count: 1, singular: 'collection' },
				],
			});

			const method = await db
				.selectFrom('collection_methods')
				.select(['name'])
				.where('id', '=', methodId)
				.executeTakeFirstOrThrow();
			expect(method.name).toBe('CDC light trap');
		});
	});

	it('renames a catalog row nothing cites without asking', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'method_rename_free');
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);

			const response = await lookupApp(db, org, actor).request(
				`/foundation/collection-methods/${methodId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						name: 'CDC light trap (rev 2)',
						acknowledgedHistoricalLabelChange: false,
					}),
				},
			);

			// Withheld and accepted anyway. Nothing reads under this name yet, so
			// there is no question to ask, and asking would ask about nothing.
			expect(response.status).toBe(200);
			const method = await db
				.selectFrom('collection_methods')
				.select(['name'])
				.where('id', '=', methodId)
				.executeTakeFirstOrThrow();
			expect(method.name).toBe('CDC light trap (rev 2)');
		});
	});

	it('leaves an edit that changes no label alone, however much history there is', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'method_notes_edit');
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId);
			await createCollection(db, org, trapId, methodId);

			const response = await lookupApp(db, org, actor).request(
				`/foundation/collection-methods/${methodId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						description: 'Runs on a six-volt battery.',
						acknowledgedHistoricalLabelChange: false,
					}),
				},
			);

			expect(response.status).toBe(200);
		});
	});

	// -----------------------------------------------------------------------
	// A trap rename, where the citing rows are the trap's own collections
	// -----------------------------------------------------------------------

	it('refuses a trap recode with collections behind it, and writes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'trap_recode_withheld');
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId);
			await createCollection(db, org, trapId, methodId);

			const response = await trapApp(db, org, actor).request(
				`/adult-surveillance/traps/${trapId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						trapCode: 'NG-2',
						acknowledgedHistoricalLabelChange: false,
					}),
				},
			);

			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({
				error: 'acknowledgement_required',
				flag: 'acknowledgedHistoricalLabelChange',
				consequences: [{ key: 'trapCollections', count: 1, singular: 'collection' }],
			});

			const trap = await db
				.selectFrom('traps')
				.select(['trap_code'])
				.where('id', '=', trapId)
				.executeTakeFirstOrThrow();
			expect(trap.trap_code).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// Retiring a notification type, where the count is the live subscriptions
	// -----------------------------------------------------------------------

	it('refuses retiring a notification type people are still subscribed to', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'type_retire_withheld');
			const actor = await createProfile(db, org);
			const typeId = await createNotificationType(db, org);
			const registrationId = await createNotificationRegistration(db, org);
			await createSubscription(db, org, registrationId, typeId);

			const response = await notificationApp(db, org, actor).request(
				`/public-engagement/notification-types/${typeId}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						isActive: false,
						acknowledgedActiveSubscriptionImpact: false,
					}),
				},
			);

			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({
				error: 'acknowledgement_required',
				flag: 'acknowledgedActiveSubscriptionImpact',
				consequences: [
					{ key: 'notificationTypeRegistrations', count: 1, singular: 'notification registration' },
				],
			});

			const type = await db
				.selectFrom('notification_types')
				.select(['is_active'])
				.where('id', '=', typeId)
				.executeTakeFirstOrThrow();
			expect(type.is_active).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// The taxonomy, whose count is every agency's at once
	// -----------------------------------------------------------------------

	it('refuses a species rename and counts across every agency', async () => {
		await withTestDb(async ({ db }) => {
			const first = await createOrganization(db, 'taxon_first');
			const second = await createOrganization(db, 'taxon_second');
			const operator = await createOperatorUser(db, 'taxon_operator');
			const speciesId = await createSpecies(db);
			await createOrganizationSpecies(db, first, speciesId);
			await createOrganizationSpecies(db, second, speciesId);

			const response = await speciesApp(db, operator).request(`/commands/species/${speciesId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					intents: ['foundation.updateSpecies'],
					display_name: 'Culex quinquefasciatus',
					acknowledgedTaxonomyMeaningChange: false,
				}),
			});

			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({
				error: 'acknowledgement_required',
				flag: 'acknowledgedTaxonomyMeaningChange',
				// Two agencies, one number. The operator already reads every agency,
				// so the total leaks nothing, and a breakdown is a report.
				consequences: [{ key: 'speciesAgencyLists', count: 2, singular: 'agency species list' }],
			});

			const species = await db
				.selectFrom('species')
				.select(['display_name'])
				.where('id', '=', speciesId)
				.executeTakeFirstOrThrow();
			expect(species.display_name).toBe('Culex pipiens');
		});
	});

	// -----------------------------------------------------------------------
	// The collision check, which is not a history check
	// -----------------------------------------------------------------------

	it('refuses a trap whose code another active trap already carries', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'trap_code_collision');
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			await createTrap(db, org, methodId, 'NG-1');
			const newTrapId = '00000000-0000-4000-8000-0000000003a1';

			const response = await trapApp(db, org, actor).request('/adult-surveillance/traps', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: newTrapId,
					collectionMethodId: methodId,
					trapCode: ' ng-1 ',
					locationSource: {
						kind: 'geometry',
						geometry: { type: 'Point', coordinates: [-90.4, 35.6] },
					},
					acknowledgedDuplicateTrapCode: false,
				}),
			});

			// Case and spacing aside: the agency reads them as one code, so the
			// question is asked on the reading rather than on the bytes.
			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({
				error: 'acknowledgement_required',
				flag: 'acknowledgedDuplicateTrapCode',
				consequences: [{ key: 'duplicateTrapCode', count: 1, singular: 'trap' }],
			});

			const written = await db
				.selectFrom('traps')
				.select(['id'])
				.where('id', '=', newTrapId)
				.executeTakeFirst();
			expect(written).toBeUndefined();
		});
	});

	it('takes a trap code no active trap carries, whatever the flag says', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'trap_code_free');
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const newTrapId = '00000000-0000-4000-8000-0000000003a2';

			const response = await trapApp(db, org, actor).request('/adult-surveillance/traps', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: newTrapId,
					collectionMethodId: methodId,
					trapCode: 'NG-1',
					locationSource: {
						kind: 'geometry',
						geometry: { type: 'Point', coordinates: [-90.4, 35.6] },
					},
					acknowledgedDuplicateTrapCode: false,
				}),
			});

			expect(response.status).toBe(201);
		});
	});
});

// ===========================================================================
// Apps
// ===========================================================================

type Db = Kysely<SimmerDatabase>;

function authMiddleware(organizationId: string, profileId: string) {
	return createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
		context.set('authContext', {
			organization: { id: organizationId },
			profile: { id: profileId },
			role: 'owner',
		} as AuthContext);
		await next();
	});
}

/** The operator door, which carries a SIMMER user id and no agency at all. */
function operatorMiddleware(userId: string) {
	return createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
		context.set('operatorContext', {
			localIdentity: { user: { id: userId } },
		} as OperatorAuthContext);
		await next();
	});
}

function lookupApp(db: Db, organizationId: string, profileId: string) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerFoundationCommandRoutes(app, {
		db,
		authContextMiddleware: authMiddleware(organizationId, profileId),
	});
	return app;
}

function trapApp(db: Db, organizationId: string, profileId: string) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerAdultSurveillanceCommandRoutes(app, {
		db,
		authContextMiddleware: authMiddleware(organizationId, profileId),
	});
	return app;
}

function notificationApp(db: Db, organizationId: string, profileId: string) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerPublicEngagementCommandRoutes(app, {
		db,
		authContextMiddleware: authMiddleware(organizationId, profileId),
	});
	return app;
}

function speciesApp(db: Db, operatorUserId: string) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerTableCommandRoutes(
		app,
		{
			authContextMiddleware: authMiddleware('', ''),
			operatorAuthContextMiddleware: operatorMiddleware(operatorUserId),
		},
		speciesTableCommands(db),
	);
	return app;
}

// ===========================================================================
// Fixtures
// ===========================================================================

async function createOrganization(db: Db, slug: string): Promise<string> {
	const row = await db
		.insertInto('organizations')
		.values({ workos_organization_id: `workos_${slug}`, name: `${slug} District` })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createProfile(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('profiles')
		.values({ organization_id: organizationId, display_name: 'Technician' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createOperatorUser(db: Db, slug: string): Promise<string> {
	const row = await db
		.insertInto('users')
		.values({
			workos_user_id: `workos_${slug}`,
			email: `${slug}@simmer.test`,
			display_name: 'Operator',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createCollectionMethod(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('collection_methods')
		.values({ organization_id: organizationId, name: 'CDC light trap' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createTrap(
	db: Db,
	organizationId: string,
	collectionMethodId: string,
	trapCode?: string,
): Promise<string> {
	const row = await db
		.insertInto('traps')
		.values({
			organization_id: organizationId,
			collection_method_id: collectionMethodId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			trap_name: 'North gate',
			...(trapCode === undefined ? {} : { trap_code: trapCode }),
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createCollection(
	db: Db,
	organizationId: string,
	trapId: string,
	collectionMethodId: string,
): Promise<string> {
	const row = await db
		.insertInto('collections')
		.values({
			organization_id: organizationId,
			trap_id: trapId,
			collection_method_id: collectionMethodId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			collection_timing_mode: 'exact_timestamps',
			started_at: sql`timestamptz '2026-08-01 06:00:00+00'`,
			collected_at: sql`timestamptz '2026-08-02 06:00:00+00'`,
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createSpecies(db: Db): Promise<string> {
	const genus = await db
		.insertInto('genera')
		.values({ abbreviation: 'Cx', name: 'Culex' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('species')
		.values({ genus_id: genus.id, epithet: 'pipiens', display_name: 'Culex pipiens' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createOrganizationSpecies(
	db: Db,
	organizationId: string,
	speciesId: string,
): Promise<string> {
	const row = await db
		.insertInto('organization_species')
		.values({ organization_id: organizationId, species_id: speciesId })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createNotificationType(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('notification_types')
		.values({ organization_id: organizationId, name: 'Adulticide notice' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createNotificationRegistration(db: Db, organizationId: string): Promise<string> {
	const contact = await db
		.insertInto('contacts')
		.values({ organization_id: organizationId, contact_name: 'R. Alvarez' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('notification_registrations')
		.values({
			organization_id: organizationId,
			contact_id: contact.id,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createSubscription(
	db: Db,
	organizationId: string,
	notificationRegistrationId: string,
	notificationTypeId: string,
): Promise<string> {
	const row = await db
		.insertInto('notification_registration_types')
		.values({
			organization_id: organizationId,
			notification_registration_id: notificationRegistrationId,
			notification_type_id: notificationTypeId,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
