import type { Kysely, SimmerDatabase } from '@simmer-mosquito/db';
import {
	createCollection,
	createCollectionMethod,
	createCollectionSpecies,
	createComment,
	createContact,
	createHabitat,
	createMission,
	createNotificationRegistration,
	createNotificationType,
	createOrganization,
	createProfile,
	createSpecies,
	createTrap,
	describeDbIntegration,
	createMissionNotification as insertMissionNotification,
	withTestDb,
} from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerRecordDeletionRoutes } from '../../record-deletion.js';
import { command, commandApp } from './support/command-app.js';

/**
 * The delete policy where it meets HTTP.
 *
 * `packages/db` proves what the policy does to rows. These are the two things
 * only the server can answer: what the impact endpoint tells a caller asking
 * about someone else's record, and what `cancelPendingCollection` — which
 * quietly gained the whole policy by sharing `softDeleteCollection` — actually
 * does when a pending collection is not as empty as expected.
 */
describeDbIntegration('record deletion at the HTTP boundary', () => {
	it('answers found: false for another organization’s record rather than 404', async () => {
		await withTestDb(async ({ db }) => {
			const owner = await createOrganization(db);
			const caller = await createOrganization(db);
			const habitatId = await createHabitat(db, owner);

			const response = await impactApp(db, caller).request(
				`/records/habitat/${habitatId}/delete-impact`,
			);

			// Deliberate, and the docstring on the route says so: a 404 here would
			// differ from the answer for an id that never existed, which turns the
			// endpoint into a way to probe for other organizations' ids.
			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({
				found: false,
				blockers: [],
				cascades: [],
				detaches: [],
			});
		});
	});

	it('answers the same shape for an id that never existed', async () => {
		await withTestDb(async ({ db }) => {
			const caller = await createOrganization(db);

			const response = await impactApp(db, caller).request(
				`/records/habitat/${NEVER_EXISTED}/delete-impact`,
			);

			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({ found: false });
		});
	});

	// `softDeleteCollection` is shared by `deleteCollection` and
	// `cancelPendingCollection`, so cancelling took on the delete policy. For a
	// genuinely pending collection there is usually nothing to take — but nothing
	// pinned that, and `deleteCollection` carries an
	// `acknowledgedSpeciesCountDeletion` flag that the cancel path does not.
	it('applies the full delete policy when a pending collection is cancelled', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			// A real profile: the delete stamps `deleted_by_profile_id` and
			// `updated_by_profile_id`, both of which carry a foreign key.
			const actor = await createProfile(db, org);
			const methodId = await createCollectionMethod(db, org);
			const trapId = await createTrap(db, org, methodId);
			const collectionId = await createCollection(db, org, {
				trapId: trapId,
				collectionMethodId: methodId,
			});
			const speciesId = await createSpecies(db);
			await createCollectionSpecies(db, org, { collectionId: collectionId, speciesId: speciesId });
			await createComment(db, org, { entityType: 'collection', entityId: collectionId });

			const response = await commandApp(db, org, actor).request(
				`/commands/collections/${collectionId}`,
				command('PATCH', ['adultSurveillance.cancelPendingCollection']),
			);
			expect(response.status).toBe(200);

			// Cancelling reaches the species count and the comment, with no
			// acknowledgement asked for. That is the documented intent, and it is
			// now pinned rather than assumed.
			const collection = await db
				.selectFrom('collections')
				.select(['deleted_at'])
				.where('id', '=', collectionId)
				.executeTakeFirstOrThrow();
			expect(collection.deleted_at).not.toBeNull();

			const speciesRow = await db
				.selectFrom('collection_species')
				.select(['deleted_at'])
				.where('collection_id', '=', collectionId)
				.executeTakeFirstOrThrow();
			expect(speciesRow.deleted_at).not.toBeNull();

			const comments = await db
				.selectFrom('comments')
				.select(['id'])
				.where('entity_id', '=', collectionId)
				.where('deleted_at', 'is', null)
				.execute();
			expect(comments).toEqual([]);
		});
	});

	// The registration delete had no registry entry at all, so it soft-deleted
	// the row and left every mission notification naming it pointing at a retired
	// registration, with the foreign key still satisfied (#322). Both halves are
	// here because both were missing: the refusal, and the impact read the danger
	// zone needs before the button is pressed.
	it('refuses a registration delete a mission notification blocks, and says what blocked it', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db);
			const actor = await createProfile(db, org);
			const contactId = await createContact(db, org, { wants_email: true });
			const typeId = await createNotificationType(db, org);
			const registrationId = await createNotificationRegistration(db, org, contactId);
			await createMissionNotification(db, org, { contactId, registrationId, typeId });

			const impact = await impactApp(db, org).request(
				`/records/notificationRegistration/${registrationId}/delete-impact`,
			);
			expect(impact.status).toBe(200);
			await expect(impact.json()).resolves.toMatchObject({
				found: true,
				blockers: [
					{ key: 'registrationMissionNotifications', count: 1, plural: 'sent notifications' },
				],
			});

			const response = await commandApp(db, org, actor).request(
				`/commands/notification_registrations/${registrationId}`,
				command('DELETE', ['publicEngagement.deleteNotificationRegistration']),
			);
			expect(response.status).toBe(409);
			await expect(response.json()).resolves.toMatchObject({
				error: 'delete_blocked',
				blockers: [{ key: 'registrationMissionNotifications', count: 1 }],
			});

			const registration = await db
				.selectFrom('notification_registrations')
				.select(['deleted_at'])
				.where('id', '=', registrationId)
				.executeTakeFirstOrThrow();
			expect(registration.deleted_at).toBeNull();
		});
	});
});

// ===========================================================================
// Apps
// ===========================================================================

type Db = Kysely<SimmerDatabase>;

const NEVER_EXISTED = 'b7c2f0a4-6f0e-4c39-9f1e-6a4a4b7c9d21';

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

function impactApp(db: Db, organizationId: string): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerRecordDeletionRoutes(app, {
		db,
		authContextMiddleware: authMiddleware(organizationId, NEVER_EXISTED),
	});
	return app;
}

// ===========================================================================
// Fixtures
// ===========================================================================

async function createMissionNotification(
	db: Db,
	organizationId: string,
	links: {
		readonly contactId: string;
		readonly registrationId: string;
		readonly typeId: string;
	},
): Promise<string> {
	return insertMissionNotification(db, organizationId, {
		missionId: await createMission(db, organizationId),
		registrationId: links.registrationId,
		contactId: links.contactId,
		notificationTypeId: links.typeId,
	});
}
