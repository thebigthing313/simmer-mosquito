import {
	DeleteAcknowledgementRequiredError,
	MissionNotificationRefusedError,
	RecordDeleteBlockedError,
	RecordMergeRefusedError,
	ReferenceRefusedError,
} from '@simmer-mosquito/db';
import { DomainValidationError } from '@simmer-mosquito/domain';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import {
	type CommandContext,
	CommandError,
	commandEndpoint,
	handleCommandError,
} from '../../command-endpoint.js';
import { type CommandDb, runCommands } from '../../command-write.js';

/**
 * What a client is told when a rule refuses a write, and where in the request
 * the rule was allowed to live.
 *
 * The build phase already answered `invalid_command` for a
 * `DomainValidationError`, because `commandEndpoint` catches one around the
 * builder. The transaction is one layer past that catch, and it is where the
 * geometry source lookup, the ownership reads and the second-system calls
 * happen, so a rule that needs a stored row had no way to raise the same
 * refusal. It answered 500 with no issue list.
 */
describe('a domain refusal raised inside the write transaction', () => {
	it('answers the same invalid_command 400 a builder rejection does', async () => {
		const response = await answerFromTransaction(
			new DomainValidationError('Geometry must cover ground.', [
				{ path: 'geometry', message: 'Geometry must cover ground.' },
			]),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: 'invalid_command',
			message: 'Geometry must cover ground.',
			issues: [{ path: 'geometry', message: 'Geometry must cover ground.' }],
		});
	});

	it('carries the issue path, so the form can point at the field', async () => {
		const response = await answerFromTransaction(
			new DomainValidationError('endDate cannot be in the future.', [
				{ path: 'endDate', message: 'endDate cannot be in the future.' },
			]),
		);

		await expect(response.json()).resolves.toMatchObject({
			issues: [{ path: 'endDate' }],
		});
	});
});

describe('a domain refusal raised by the builder', () => {
	it('answers the invalid_command 400 it always has', async () => {
		const app = new Hono<{ Variables: AuthVariables }>();
		app.post(
			'/commands/region-folders',
			signedIn,
			commandEndpoint({
				build: () => {
					throw new DomainValidationError('Name is required.', [
						{ path: 'name', message: 'Name is required.' },
					]);
				},
				run: () => new Response(null, { status: 200 }),
			}),
		);

		const response = await app.request('/commands/region-folders', {
			method: 'POST',
			body: '{}',
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: 'invalid_command',
			message: 'Name is required.',
			issues: [{ path: 'name', message: 'Name is required.' }],
		});
	});
});

describe('handleCommandError', () => {
	it('leaves the refusals that were already handled where they were', () => {
		// One case per arm. The new `DomainValidationError` arm sits beside these,
		// and none of the six classes extends another, so adding it shadows
		// nothing. This is what says so.
		const answers = [
			new CommandError(403, { error: 'forbidden', reason: 'not yours' }),
			new RecordDeleteBlockedError('address', recordId, [
				{ key: 'addressTraps', count: 2, singular: 'trap', plural: 'traps' },
			]),
			new DeleteAcknowledgementRequiredError('habitat', recordId, 'acknowledgedInspectionDetach', [
				{ key: 'habitatInspections', count: 3, singular: 'inspection', plural: 'inspections' },
			]),
			new RecordMergeRefusedError('habitat', 'target_inactive', [recordId], 'Retired.'),
			new ReferenceRefusedError('insecticide', 'inactive', 'insecticide'),
			new MissionNotificationRefusedError('mission_not_found', recordId, 'No such mission.'),
		].map((error) => answered(error));

		expect(answers.map((answer) => answer.status)).toEqual([403, 409, 409, 409, 409, 404]);
		expect(answers.map((answer) => (answer.body as { error: string }).error)).toEqual([
			'forbidden',
			'delete_blocked',
			'acknowledgement_required',
			'merge_refused',
			'reference_refused',
			'mission_notifications_refused',
		]);
	});

	it('rethrows an error nobody declared', () => {
		// A 500 with a stack beats a 400 that hides one. The arms are a list of
		// refusals the domain means, not a catch-all.
		const bug = new TypeError('read of undefined');

		expect(() => handleCommandError(capturing().context, bug)).toThrow(bug);
	});
});

const recordId = 'b7c2f0a4-6f0e-4c39-9f1e-6a4a4b7c9d21';

const authContext = {
	organization: { id: 'f0dbf1c7-d278-441e-82b4-9292d390ce72' },
	profile: { id: '0105b111-e0be-46b0-b5e9-a87507889b51' },
	role: 'owner',
} as AuthContext;

const signedIn = createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
	context.set('authContext', authContext);
	await next();
});

/**
 * Run a real command route whose writer throws, and read the answer off the
 * wire.
 *
 * `foundation.createRegionFolder` is a plain role floor, so
 * `resolveCommandOwnership` answers `allowed` without a query and the fake
 * transaction below is the only database this needs.
 */
async function answerFromTransaction(error: unknown): Promise<Response> {
	const app = new Hono<{ Variables: AuthVariables }>();
	app.post('/commands/region-folders', signedIn, (context) =>
		runCommands(
			context,
			{
				db: transactionOnlyDb,
				write: () => {
					throw error;
				},
				notFound: 'region_folder_not_found',
				key: 'regionFolder',
			},
			[{ type: 'foundation.createRegionFolder', payload: { id: recordId } }] as const,
		),
	);
	return app.request('/commands/region-folders', { method: 'POST' });
}

/** Enough database to open the transaction the refusal is raised inside. */
const transactionOnlyDb = {
	transaction: () => ({
		execute: async <T>(run: (trx: never) => Promise<T>): Promise<T> => run({} as never),
	}),
} as unknown as CommandDb;

/** The status and body a refusal becomes, without standing up a route. */
function answered(error: unknown): { readonly status: number; readonly body: unknown } {
	const capture = capturing();
	handleCommandError(capture.context, error);
	return { status: capture.status, body: capture.body };
}

function capturing(): { context: CommandContext; status: number; body: unknown } {
	const capture = {
		status: 0,
		body: undefined as unknown,
		context: undefined as unknown as CommandContext,
	};
	capture.context = {
		json: (body: unknown, status: number) => {
			capture.body = body;
			capture.status = status;
			return new Response();
		},
	} as unknown as CommandContext;
	return capture;
}
