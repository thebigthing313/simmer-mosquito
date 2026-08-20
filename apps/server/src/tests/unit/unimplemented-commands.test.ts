import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AuthVariables } from '../../auth-middleware.js';
import {
	registerUnimplementedCommandRoutes,
	unimplementedCommandRoutes,
} from '../../unimplemented-commands.js';

/** Registers the stubs with a middleware that resolves nothing, so only the refusal runs. */
function stubbedApp(): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerUnimplementedCommandRoutes(app, {
		authContextMiddleware: async (_context, next) => {
			await next();
		},
	});
	return app;
}

describe('unimplemented command routes', () => {
	it('claims each verb and path once', () => {
		// Two entries on the same verb and path both register, and the second is
		// unreachable. Nothing else would notice, because both answer 501 — the
		// symptom is one command name that can never be reported.
		const seen = unimplementedCommandRoutes.map((route) => `${route.verb} ${route.path}`);

		expect(new Set(seen).size).toBe(seen.length);
	});

	it('names each command once', () => {
		const commands = unimplementedCommandRoutes.map((route) => route.command);

		expect(new Set(commands).size).toBe(commands.length);
	});

	it('refuses with 501 and names the command it would have run', async () => {
		const app = stubbedApp();

		const response = await app.request('/public-engagement/missions/some-id/notifications', {
			method: 'POST',
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toEqual({
			error: 'command_not_implemented',
			reason: expect.stringContaining('publicEngagement.generateMissionNotifications'),
			command: 'publicEngagement.generateMissionNotifications',
		});
	});

	it('refuses before reading the body, so a malformed one is still a 501', async () => {
		// A stub that validated first would be an implementation with the write
		// missing. The point is to answer "not built" to every caller, including the
		// one whose payload is wrong.
		const app = stubbedApp();

		const response = await app.request('/public-engagement/missions/some-id/notifications', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: 'not json at all',
		});

		expect(response.status).toBe(501);
	});

	it('answers every registered route, on the verb it was registered with', async () => {
		const app = stubbedApp();

		for (const route of unimplementedCommandRoutes) {
			// Path parameters are filled with anything; nothing reads them.
			const path = route.path.replaceAll(/:[A-Za-z]+/g, 'some-id');
			const response = await app.request(path, { method: route.verb.toUpperCase() });

			expect({ path, status: response.status }).toEqual({ path, status: 501 });
		}
	});

	it('does not answer a verb it was not registered with', async () => {
		// GET is nobody's command verb, so a 501 here would mean the stubs are
		// claiming more of the routing table than they were given.
		const app = stubbedApp();

		const response = await app.request('/public-engagement/missions/some-id/notifications', {
			method: 'GET',
		});

		expect(response.status).toBe(404);
	});
});
