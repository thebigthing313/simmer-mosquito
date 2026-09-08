/**
 * The history check and the collision check, refusing over real HTTP.
 *
 * Every acknowledgement case sends its flag as `false`, which is the only way
 * to withhold one: `acknowledged()` reads an absent flag as confirmed,
 * deliberately, so that no write a client makes today starts failing. Nothing
 * in `apps/web` sends `false` for any of these yet, and #319 is that half.
 * Without these cases the guards would be correct and unexercised, and would
 * stay that way until a form asked, by which point nobody would remember what
 * the answer was supposed to be.
 *
 * Every acknowledgement case also asserts the row is untouched. Both checks run
 * before the first write, and a refusal that has already written half of what
 * it was going to is worse than no refusal.
 *
 * The pair to read together is the rename with citing rows and the rename
 * without them. The second is the whole of the "what counts as history"
 * decision: any citing row asks, none asks nothing, and there is no interval
 * anywhere.
 *
 * The trap section holds one refusal that is neither a history question nor a
 * collision: a Trap has to keep a name or a code, and the rule is here because
 * this is where the trap write surface is driven over real HTTP. It is a
 * refusal rather than a question, so it takes no flag and nothing gets past it.
 */

import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import {
	createCollection,
	createCollectionMethod,
	createContact,
	createNotificationRegistration,
	createNotificationRegistrationType,
	createNotificationType,
	createOrganization,
	createOrganizationSpecies,
	createProfile,
	createSpecies,
	createTrap,
	createUser,
	describeDbIntegration,
	withTestDb,
} from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables, OperatorAuthContext } from '../../auth-middleware.js';
import { registerTableCommandRoutes } from '../../table-commands/dispatch.js';
import { speciesTableCommands } from '../../table-commands/taxonomy.js';
import { command, commandApp } from './support/command-app.js';

describeDbIntegration('history and collision refusals', () => {
	// -----------------------------------------------------------------------
	// A catalog rename, with and without history behind it
	// -----------------------------------------------------------------------

	it('refuses a catalog rename with collections behind it, and writes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId);
			await createCollection(
				db,
				org,
				{ trapId: trapId, collectionMethodId: methodId },
				{
					collected_at: sql`timestamptz '2026-08-02 06:00:00+00'`,
				},
			);

			const response = await commandApp(db, org, actor).request(
				`/commands/collection_methods/${methodId}`,
				command('PATCH', ['foundation.updateCollectionMethod'], {
					name: 'CDC light trap (rev 2)',
					acknowledgedHistoricalLabelChange: false,
				}),
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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);

			const response = await commandApp(db, org, actor).request(
				`/commands/collection_methods/${methodId}`,
				command('PATCH', ['foundation.updateCollectionMethod'], {
					name: 'CDC light trap (rev 2)',
					acknowledgedHistoricalLabelChange: false,
				}),
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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId);
			await createCollection(
				db,
				org,
				{ trapId: trapId, collectionMethodId: methodId },
				{
					collected_at: sql`timestamptz '2026-08-02 06:00:00+00'`,
				},
			);

			const response = await commandApp(db, org, actor).request(
				`/commands/collection_methods/${methodId}`,
				command('PATCH', ['foundation.updateCollectionMethod'], {
					description: 'Runs on a six-volt battery.',
					acknowledgedHistoricalLabelChange: false,
				}),
			);

			expect(response.status).toBe(200);
		});
	});

	// -----------------------------------------------------------------------
	// A trap rename, where the citing rows are the trap's own collections
	// -----------------------------------------------------------------------

	it('refuses a trap recode with collections behind it, and writes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId);
			await createCollection(
				db,
				org,
				{ trapId: trapId, collectionMethodId: methodId },
				{
					collected_at: sql`timestamptz '2026-08-02 06:00:00+00'`,
				},
			);

			const response = await commandApp(db, org, actor).request(
				`/commands/traps/${trapId}`,
				command('PATCH', ['adultSurveillance.updateTrapDetails'], {
					trap_code: 'NG-2',
					acknowledgedHistoricalLabelChange: false,
				}),
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
	// A trap edit that would leave the trap with no label at all
	// -----------------------------------------------------------------------

	it('refuses clearing a trap name when the trap carries no code, and writes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId, { trap_name: 'North gate' });

			const response = await commandApp(db, org, actor).request(
				`/commands/traps/${trapId}`,
				command('PATCH', ['adultSurveillance.updateTrapDetails'], { trap_name: null }),
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({
				error: 'trap_display_required',
				reason: 'A trap needs a name or a code. Keep one of the two.',
			});

			const trap = await db
				.selectFrom('traps')
				.select(['trap_name'])
				.where('id', '=', trapId)
				.executeTakeFirstOrThrow();
			expect(trap.trap_name).toBe('North gate');
		});
	});

	// The other direction of the same rule. Neither field is the one that has to
	// survive, so a suite covering only the name would leave half of it untested.
	it('refuses clearing a trap code when the trap carries no name', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId, {
				trap_name: null,
				trap_code: 'NG-1',
			});

			const response = await commandApp(db, org, actor).request(
				`/commands/traps/${trapId}`,
				command('PATCH', ['adultSurveillance.updateTrapDetails'], { trap_code: null }),
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({ error: 'trap_display_required' });
		});
	});

	it('refuses clearing both labels in one edit', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId, {
				trap_name: 'North gate',
				trap_code: 'NG-1',
			});

			const response = await commandApp(db, org, actor).request(
				`/commands/traps/${trapId}`,
				command('PATCH', ['adultSurveillance.updateTrapDetails'], {
					trap_name: null,
					trap_code: null,
				}),
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({ error: 'trap_display_required' });
		});
	});

	it('takes a cleared trap name when a code is left behind', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId, {
				trap_name: 'North gate',
				trap_code: 'NG-1',
			});

			const response = await commandApp(db, org, actor).request(
				`/commands/traps/${trapId}`,
				command('PATCH', ['adultSurveillance.updateTrapDetails'], { trap_name: null }),
			);

			expect(response.status).toBe(200);

			const trap = await db
				.selectFrom('traps')
				.select(['trap_name', 'trap_code'])
				.where('id', '=', trapId)
				.executeTakeFirstOrThrow();
			expect(trap.trap_name).toBeNull();
			expect(trap.trap_code).toBe('NG-1');
		});
	});

	// The description is not a label, so an edit naming it alone is not made to
	// answer this rule even on a trap that would fail it.
	it('takes a description edit on a trap carrying only a name', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId, { trap_name: 'North gate' });

			const response = await commandApp(db, org, actor).request(
				`/commands/traps/${trapId}`,
				command('PATCH', ['adultSurveillance.updateTrapDetails'], {
					description: 'Beside the gate',
				}),
			);

			expect(response.status).toBe(200);

			const trap = await db
				.selectFrom('traps')
				.select(['description'])
				.where('id', '=', trapId)
				.executeTakeFirstOrThrow();
			expect(trap.description).toBe('Beside the gate');
		});
	});

	// -----------------------------------------------------------------------
	// Retiring a notification type, where the count is the live subscriptions
	// -----------------------------------------------------------------------

	it('refuses retiring a notification type people are still subscribed to', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const typeId = await createNotificationType(db, org, { name: 'Adulticide notice' });
			const registrationId = await createNotificationRegistration(
				db,
				org,
				await createContact(db, org),
			);
			await createSubscription(db, org, registrationId, typeId);

			const response = await commandApp(db, org, actor).request(
				`/commands/notification_types/${typeId}`,
				command('PATCH', ['publicEngagement.deactivateNotificationType'], {
					acknowledgedActiveSubscriptionImpact: false,
				}),
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
	// The taxonomy, whose count is every organization's at once
	// -----------------------------------------------------------------------

	it('refuses a species rename and counts across every organization', async () => {
		await withTestDb(async ({ db }) => {
			const first = await createOrganization(db);
			const second = await createOrganization(db);
			const operator = await createUser(db);
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
				// Two organizations, one number. The operator already reads every
				// organization, so the total leaks nothing, and a breakdown is a
				// report.
				consequences: [
					{ key: 'speciesOrganizationLists', count: 2, singular: 'organization species list' },
				],
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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			await createTrap(db, org, methodId, { trap_code: 'NG-1' });
			const newTrapId = '00000000-0000-4000-8000-0000000003a1';

			const response = await commandApp(db, org, actor).request(
				'/commands/traps',
				command('POST', ['adultSurveillance.createTrap'], {
					id: newTrapId,
					collection_method_id: methodId,
					trap_code: ' ng-1 ',
					locationSource: {
						kind: 'geometry',
						geometry: { type: 'Point', coordinates: [-90.4, 35.6] },
					},
					acknowledgedDuplicateTrapCode: false,
				}),
			);

			// Case and spacing aside: the organization reads them as one code, so the
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
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const newTrapId = '00000000-0000-4000-8000-0000000003a2';

			const response = await commandApp(db, org, actor).request(
				'/commands/traps',
				command('POST', ['adultSurveillance.createTrap'], {
					id: newTrapId,
					collection_method_id: methodId,
					trap_code: 'NG-1',
					locationSource: {
						kind: 'geometry',
						geometry: { type: 'Point', coordinates: [-90.4, 35.6] },
					},
					acknowledgedDuplicateTrapCode: false,
				}),
			);

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

/** The operator door, which carries a SIMMER user id and no organization at all. */
function operatorMiddleware(userId: string) {
	return createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
		context.set('operatorContext', {
			localIdentity: { user: { id: userId } },
		} as OperatorAuthContext);
		await next();
	});
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

function createSubscription(
	db: Db,
	organizationId: string,
	registrationId: string,
	notificationTypeId: string,
): Promise<string> {
	return createNotificationRegistrationType(db, organizationId, {
		registrationId,
		notificationTypeId,
	});
}
