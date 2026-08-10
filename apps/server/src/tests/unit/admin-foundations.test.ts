import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAdminFoundationRoutes } from '../../admin-foundations.js';
import type { AuthVariables } from '../../auth-middleware.js';

const dbMock = vi.hoisted(() => ({
	deleteGenusWithTxid: vi.fn(),
	deleteSpeciesWithTxid: vi.fn(),
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

function createApp() {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerAdminFoundationRoutes(app, {
		db: {} as never,
		operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()) as never,
	});
	return app;
}

/**
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

	const cases = [
		{
			what: 'genus',
			path: `/admin/genera/${ID}`,
			mock: dbMock.deleteGenusWithTxid,
			code: 'genus_in_use',
		},
		{
			what: 'species',
			path: `/admin/species/${ID}`,
			mock: dbMock.deleteSpeciesWithTxid,
			code: 'species_in_use',
		},
		{
			what: 'unit',
			path: `/admin/units/${ID}`,
			mock: dbMock.deleteUnitWithTxid,
			code: 'unit_in_use',
		},
	];

	for (const { what, path, mock, code } of cases) {
		it(`explains a refused ${what} delete instead of throwing`, async () => {
			mock.mockRejectedValue(foreignKeyViolation());

			const response = await createApp().request(path, { method: 'DELETE' });

			expect(response.status).toBe(409);
			const body = (await response.json()) as { error: string; reason: string };
			expect(body.error).toBe(code);
			// The reason is what the operator reads, so it has to say something.
			expect(body.reason.length).toBeGreaterThan(10);
		});

		it(`still answers 404 for a ${what} that is not there`, async () => {
			mock.mockResolvedValue({ row: null, txid: '1' });

			const response = await createApp().request(path, { method: 'DELETE' });

			expect(response.status).toBe(404);
		});

		// A delete that failed for some other reason is not a rule being enforced.
		// It stays a 500 — dressing it up as a 409 would tell the operator their
		// catalog is in use when the database merely fell over.
		it(`lets an unrelated ${what} failure through as a failure`, async () => {
			mock.mockRejectedValue(new Error('connection terminated'));

			const response = await createApp().request(path, { method: 'DELETE' });

			expect(response.status).toBe(500);
		});
	}
});
