/**
 * A `Kysely` that compiles every query and executes none of them.
 *
 * Two things this is good for, and one it is not.
 *
 * It proves the *shape* of the SQL a reader issues — that the tenancy
 * predicate, the soft-delete predicate and the tile envelope are all present —
 * which `map-region-filter.test.ts` already does by inspecting the compiled
 * text. And because `DummyDriver` answers every query with no rows, it puts a
 * caller in the state a missing or cross-tenant row produces, so the handling
 * of that state is testable without Postgres.
 *
 * What it cannot prove is that a predicate *excludes* what it claims to. That
 * needs a real database, and `command-authorization.integration.test.ts` makes
 * the argument at length. Reach for `describeDbIntegration` when the assertion
 * is about behaviour rather than shape.
 */

import {
	DummyDriver,
	Kysely,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
} from 'kysely';
import type { SimmerDatabase } from '../index.js';

export function createCompileOnlyDb(): Kysely<SimmerDatabase> {
	return new Kysely<SimmerDatabase>({
		dialect: {
			createAdapter: () => new PostgresAdapter(),
			createDriver: () => new DummyDriver(),
			createIntrospector: (db) => new PostgresIntrospector(db),
			createQueryCompiler: () => new PostgresQueryCompiler(),
		},
	});
}
