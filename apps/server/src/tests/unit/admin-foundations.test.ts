import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAdminFoundationRoutes } from '../../admin-foundations.js';
import type { AuthVariables } from '../../auth-middleware.js';

const dbMock = vi.hoisted(() => ({
	deleteUnitWithTxid: vi.fn(),
}));

vi.mock('@simmer-mosquito/db', () => dbMock);

/** What `pg` throws when a delete would orphan a row. */
function foreignKeyViolation(): Error {
	return Object.assign(new Error('update or delete on table violates foreign key constraint'), {
		code: '23503',
	});
}

const ID = 'b0a5d1e8-6c1f-4a2b-9d3e-1f2a3b4c5d6e';
const UNIT_PATH = `/admin/units/${ID}`;

function createApp() {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerAdminFoundationRoutes(app, {
		db: {} as never,
		operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()) as never,
	});
	return app;
}

/**
 * Units are the last global catalog `/admin/*` writes.
 *
 * Genera and species were here too and are now served by `/commands/genera` and
 * `/commands/species`; their half of this suite moved to
 * `table-commands/taxonomy.test.ts`, which makes the same three arguments about
 * the same refusal raised from inside the command transaction.
 *
 * The catalogs are deliberately restrictive and the console says so before it
 * asks for confirmation. Before this, nothing caught Postgres refusing, so the
 * rule the dialog had just explained arrived as an unhandled 500 with a
 * plain-text body — which the console could only report as "Server response was
 * unreadable".
 */
describe('operator catalog deletes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('explains a refused unit delete instead of throwing', async () => {
		dbMock.deleteUnitWithTxid.mockRejectedValue(foreignKeyViolation());

		const response = await createApp().request(UNIT_PATH, { method: 'DELETE' });

		expect(response.status).toBe(409);
		const body = (await response.json()) as { error: string; reason: string };
		expect(body.error).toBe('unit_in_use');
		// The reason is what the operator reads, so it has to say something.
		expect(body.reason.length).toBeGreaterThan(10);
	});

	it('still answers 404 for a unit that is not there', async () => {
		dbMock.deleteUnitWithTxid.mockResolvedValue({ row: null, txid: '1' });

		const response = await createApp().request(UNIT_PATH, { method: 'DELETE' });

		expect(response.status).toBe(404);
	});

	// A delete that failed for some other reason is not a rule being enforced.
	// It stays a 500 — dressing it up as a 409 would tell the operator their
	// catalog is in use when the database merely fell over.
	it('lets an unrelated unit failure through as a failure', async () => {
		dbMock.deleteUnitWithTxid.mockRejectedValue(new Error('connection terminated'));

		const response = await createApp().request(UNIT_PATH, { method: 'DELETE' });

		expect(response.status).toBe(500);
	});
});

/**
 * The six taxonomy write routes are gone, not moved to a sibling path.
 *
 * A stale caller has to get a 404 rather than a 405 or a silent success: two
 * doors on one table with different checks is what retiring these removed, and
 * the way that regresses is somebody re-registering one.
 */
describe('the retired taxonomy door', () => {
	const gone = [
		{ method: 'POST', path: '/admin/genera' },
		{ method: 'PATCH', path: `/admin/genera/${ID}` },
		{ method: 'DELETE', path: `/admin/genera/${ID}` },
		{ method: 'POST', path: '/admin/species' },
		{ method: 'PATCH', path: `/admin/species/${ID}` },
		{ method: 'DELETE', path: `/admin/species/${ID}` },
	];

	for (const { method, path } of gone) {
		it(`no longer answers ${method} ${path}`, async () => {
			const response = await createApp().request(path, { method });

			expect(response.status).toBe(404);
		});
	}
});
