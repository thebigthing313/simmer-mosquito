import { describe, expect, it } from 'vitest';
import { isServedScope, shapeScopeOf, syncShapeScopes } from '../../shape-scopes.js';

/**
 * The scopes themselves are checked twice elsewhere, and neither check is here.
 *
 * `tsc` rules out a scope a table's columns cannot answer — naming `deleted_at`
 * on a table without one, or an org predicate on a table with no
 * `organization_id`. `sync-shapes.test.ts` then asserts the exact `where` every
 * shape reaches Electric with, and those routes now read this map, so a scope
 * that changed meaning fails there against the SQL rather than against a copy of
 * this file.
 *
 * What is left for this file is the part neither can see: which tables are
 * deliberately not streamed, and what happens when something asks for one.
 */
describe('sync shape scopes', () => {
	it('withholds exactly one table, and says why', () => {
		// A table with no shape has to be a decision someone wrote down. `users` is
		// the only one: it has no `organization_id`, and the rows an organization
		// may see are reachable only through `memberships` — a join, which a shape
		// predicate cannot express. Anything else appearing here is a table that
		// quietly stopped syncing.
		const withheld = Object.entries(syncShapeScopes)
			.filter(([, entry]) => !isServedScope(entry))
			.map(([table]) => table);

		expect(withheld).toEqual(['users']);
	});

	it('refuses a withheld table by name, with the reason', () => {
		// Thrown when routes are registered rather than when one is requested, so a
		// table that lost its shape stops the server rather than the request.
		expect(() => shapeScopeOf('users')).toThrow(/users has no sync shape.*memberships/s);
	});

	it('refuses a table the database does not have', () => {
		expect(() => shapeScopeOf('habitat')).toThrow(/habitat/);
	});

	it('answers a served table with its scope', () => {
		expect([
			shapeScopeOf('habitats'),
			shapeScopeOf('species'),
			shapeScopeOf('organizations'),
			shapeScopeOf('memberships'),
			shapeScopeOf('weather_summaries'),
		]).toEqual([
			'organization',
			'global',
			'organization-row',
			'organization-no-soft-delete',
			'organization-or-global-no-soft-delete',
		]);
	});
});
