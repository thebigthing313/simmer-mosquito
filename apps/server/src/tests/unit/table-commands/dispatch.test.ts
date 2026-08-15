import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

// The txid read is the only statement `writeCommands` issues itself, and the one
// thing here that genuinely needs Postgres. Everything else — the ownership
// check, the loop, the response shape — runs for real. Same seam as
// `command-write.test.ts`.
vi.mock('@simmer-mosquito/db', () => ({ readCurrentTransactionId: async () => 1 }));

import type { AuthContext } from '../../../auth-context.js';
import type { AuthVariables } from '../../../auth-middleware.js';
import type { WritableCommand } from '../../../command-write.js';
import {
	type IntentRequest,
	registerTableCommandRoutes,
	type TableCommands,
} from '../../../table-commands/dispatch.js';

interface FakeCommand extends WritableCommand {
	readonly type: 'larvalSurveillance.createHabitat' | 'larvalSurveillance.updateHabitatDetails';
	readonly payload: Record<string, unknown>;
}

const OWNER = 'owner';
const VIEWER = 'viewer';

/** Everything the dispatcher reads off a session, and nothing it does not. */
function authContext(role: string): AuthContext {
	return {
		role,
		organization: { id: 'org-1' },
		profile: { id: 'profile-1' },
	} as unknown as AuthContext;
}

interface Recorded {
	readonly built: IntentRequest[];
	readonly ran: readonly FakeCommand[][];
}

/**
 * The routes, with the write replaced by a recorder.
 *
 * `run.write` is called once per command inside `runCommands`, which is real —
 * only the database is not. That keeps the ordering, the txid and the response
 * shape under test rather than mocked.
 */
function testApp(role: string): {
	readonly app: Hono<{ Variables: AuthVariables }>;
	readonly recorded: Recorded;
} {
	const built: IntentRequest[] = [];
	const ran: FakeCommand[][] = [];

	const spec: TableCommands<FakeCommand, { readonly id: string }> = {
		table: 'habitats',
		run: {
			db: {
				transaction: () => ({
					execute: async (
						body: (trx: unknown) => Promise<{ row: unknown; txid: number }>,
					): Promise<unknown> => body({}),
				}),
			} as never,
			write: async (_trx, command) => {
				ran.push([command]);
				return { id: 'habitat-1' };
			},
			notFound: 'habitat_not_found',
			key: 'habitat',
		},
		intents: {
			'larvalSurveillance.createHabitat': (request) => {
				built.push(request);
				return { type: 'larvalSurveillance.createHabitat', payload: request.payload };
			},
			'larvalSurveillance.updateHabitatDetails': (request) => {
				built.push(request);
				return { type: 'larvalSurveillance.updateHabitatDetails', payload: request.payload };
			},
		},
	};

	const app = new Hono<{ Variables: AuthVariables }>();
	registerTableCommandRoutes(
		app,
		{
			authContextMiddleware: async (context, next) => {
				context.set('authContext', authContext(role));
				await next();
			},
		},
		spec,
	);

	return { app, recorded: { built, ran } };
}

function post(app: Hono<{ Variables: AuthVariables }>, body: unknown) {
	return app.request('/commands/habitats', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

describe('table command dispatch', () => {
	it('refuses a request that names no command', async () => {
		const { app } = testApp(OWNER);

		for (const body of [{}, { intents: [] }, { intents: 'createHabitat' }, { intents: [''] }]) {
			const response = await post(app, body);

			expect({ body, status: response.status }).toEqual({ body, status: 400 });
		}
	});

	it('refuses a real command that belongs to another table', async () => {
		// `retireTrap` exists. It is still nonsense against habitats, and saying which
		// table refused it names the mistake better than "no such command" would.
		const { app, recorded } = testApp(OWNER);

		const response = await post(app, { intents: ['adultSurveillance.retireTrap'] });
		const body = (await response.json()) as { error: string; reason: string };

		expect(response.status).toBe(400);
		expect(body.error).toBe('unknown_command');
		expect(body.reason).toContain('habitats');
		expect(recorded.built).toHaveLength(0);
	});

	it('runs every named command over one payload, in the order given', async () => {
		// The case the list exists for: one save meaning two commands against one row.
		const { app, recorded } = testApp(OWNER);

		const response = await post(app, {
			intents: ['larvalSurveillance.createHabitat', 'larvalSurveillance.updateHabitatDetails'],
			id: 'habitat-1',
			habitat_name: 'North culvert',
		});

		expect(response.status).toBe(201);
		expect(recorded.ran.flat().map((command) => command.type)).toEqual([
			'larvalSurveillance.createHabitat',
			'larvalSurveillance.updateHabitatDetails',
		]);
		// One payload, both builders.
		expect(recorded.built.map((request) => request.payload.habitat_name)).toEqual([
			'North culvert',
			'North culvert',
		]);
	});

	it('keeps `intents` out of the payload a builder sees', async () => {
		// It is a routing instruction, not a column. A builder that saw it could write
		// it, and `habitats` has no such column.
		const { app, recorded } = testApp(OWNER);

		await post(app, { intents: ['larvalSurveillance.createHabitat'], id: 'habitat-1' });

		expect(recorded.built[0]?.payload).not.toHaveProperty('intents');
	});

	it('refuses a role that may not send the command, before building it', async () => {
		// The point of dispatching on a name: the decision needs only the name, so a
		// Viewer's payload is never validated and no builder runs.
		const { app, recorded } = testApp(VIEWER);

		const response = await post(app, {
			intents: ['larvalSurveillance.createHabitat'],
			id: 'habitat-1',
		});

		expect(response.status).toBe(403);
		expect(recorded.built).toHaveLength(0);
		expect(recorded.ran).toHaveLength(0);
	});

	it('takes the row id from the path on a patch, not from the body', async () => {
		// A body that names a different row would otherwise write somewhere else.
		const { app, recorded } = testApp(OWNER);

		await app.request('/commands/habitats/from-path', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				intents: ['larvalSurveillance.updateHabitatDetails'],
				id: 'from-body',
			}),
		});

		expect(recorded.built[0]?.id).toBe('from-path');
	});

	it('takes the row id from the body on a create, where there is no path', async () => {
		const { app, recorded } = testApp(OWNER);

		await post(app, { intents: ['larvalSurveillance.createHabitat'], id: 'client-generated' });

		expect(recorded.built[0]?.id).toBe('client-generated');
	});

	it('answers a create with 201 and an edit with 200', async () => {
		const { app } = testApp(OWNER);

		const created = await post(app, {
			intents: ['larvalSurveillance.createHabitat'],
			id: 'habitat-1',
		});
		const edited = await app.request('/commands/habitats/habitat-1', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ intents: ['larvalSurveillance.updateHabitatDetails'] }),
		});

		expect([created.status, edited.status]).toEqual([201, 200]);
	});
});
