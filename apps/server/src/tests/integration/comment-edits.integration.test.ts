import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import {
	createActingOrganization,
	createHabitat,
	createProfile,
	describeDbIntegration,
	createComment as insertComment,
	withTestDb,
} from '@simmer-mosquito/db/test-support';
import { expect, it } from 'vitest';
import { command, commandApp } from './support/command-app.js';

/**
 * A Manager correcting and removing somebody else's comment, and the two columns
 * that record a correction (#1251).
 *
 * `command-permissions.test.ts` asserts that the author rule lets a Manager
 * through. This posts through the real `/commands/comments` surface and reads
 * the row back, because what the thread draws depends on the writer: an edited
 * marker read off `updated_at` would mark every pinned comment, so the edit
 * columns have to be written by `fieldWork.updateComment` and by nothing else.
 */
describeDbIntegration('comment corrections', () => {
	it("lets a Manager correct another Profile's comment and records who did it", async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, manager, commentId } = await createThread(db);

			const response = await commandApp(db, org, manager, 'manager').request(
				`/commands/comments/${commentId}`,
				command('PATCH', ['fieldWork.updateComment'], {
					comment_text: 'Ditch drains to the north.',
				}),
			);

			expect(response.status).toBe(200);
			const row = await readComment(db, commentId);
			expect(row.comment_text).toBe('Ditch drains to the north.');
			expect(row.edited_by_profile_id).toBe(manager);
			expect(row.edited_at).toBeInstanceOf(Date);
		});
	});

	it("lets a Manager delete another Profile's comment", async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, manager, commentId } = await createThread(db);

			const response = await commandApp(db, org, manager, 'manager').request(
				`/commands/comments/${commentId}`,
				command('DELETE', ['fieldWork.deleteComment']),
			);

			expect(response.status).toBe(200);
			const row = await readComment(db, commentId);
			expect(row.deleted_at).toBeInstanceOf(Date);
			expect(row.deleted_by_profile_id).toBe(manager);
		});
	});

	it('leaves the edit columns alone on a pin and an unpin', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, manager, commentId } = await createThread(db);
			const app = commandApp(db, org, manager, 'manager');

			const pinned = await app.request(
				`/commands/comments/${commentId}`,
				command('PATCH', ['fieldWork.pinComment']),
			);
			expect(pinned.status).toBe(200);
			const afterPin = await readComment(db, commentId);
			expect(afterPin.is_pinned).toBe(true);
			// The pin is a write, so the row's own clock moves. The edit marker must not.
			expect(afterPin.updated_by_profile_id).toBe(manager);
			expect(afterPin.edited_at).toBeNull();
			expect(afterPin.edited_by_profile_id).toBeNull();

			const unpinned = await app.request(
				`/commands/comments/${commentId}`,
				command('PATCH', ['fieldWork.unpinComment']),
			);
			expect(unpinned.status).toBe(200);
			const afterUnpin = await readComment(db, commentId);
			expect(afterUnpin.is_pinned).toBe(false);
			expect(afterUnpin.edited_at).toBeNull();
			expect(afterUnpin.edited_by_profile_id).toBeNull();
		});
	});

	it('takes the edit columns from the session and never from the body', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, manager, author, commentId } = await createThread(db);

			await commandApp(db, org, manager, 'manager').request(
				`/commands/comments/${commentId}`,
				command('PATCH', ['fieldWork.updateComment'], {
					comment_text: 'Corrected.',
					edited_by_profile_id: author,
					edited_at: '2020-01-01T00:00:00.000Z',
				}),
			);

			// Whatever the status, the columns are the session's and the server's clock.
			const row = await readComment(db, commentId);
			expect(row.edited_by_profile_id).not.toBe(author);
			expect(row.edited_at?.getUTCFullYear()).not.toBe(2020);
		});
	});
});

interface Thread {
	readonly organizationId: string;
	readonly author: string;
	readonly manager: string;
	readonly commentId: string;
}

/** A Habitat with one comment on it, written by a Profile who is not the Manager. */
async function createThread(db: Kysely<SimmerDatabase>): Promise<Thread> {
	const { organizationId, actorProfileId: author } = await createActingOrganization(db);
	const manager = await createProfile(db, organizationId, { display_name: 'Jordan Lee' });
	const habitatId = await createHabitat(db, organizationId);
	const commentId = await insertComment(
		db,
		organizationId,
		{ entityType: 'habitat', entityId: habitatId },
		{
			comment_text: 'Standing water at the north end.',
			commented_by_profile_id: author,
			commented_at: sql`now() - interval '2 days'`,
		},
	);
	return { organizationId, author, manager, commentId };
}

function readComment(db: Kysely<SimmerDatabase>, commentId: string) {
	return db
		.selectFrom('comments')
		.select([
			'comment_text',
			'is_pinned',
			'updated_by_profile_id',
			'edited_at',
			'edited_by_profile_id',
			'deleted_at',
			'deleted_by_profile_id',
		])
		.where('id', '=', commentId)
		.executeTakeFirstOrThrow();
}
