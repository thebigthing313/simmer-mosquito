import {
	DummyDriver,
	Kysely,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
	type Transaction,
} from 'kysely';
import { describe, expect, it } from 'vitest';
import {
	type GeomTable,
	loadGeojson,
	type OrgOwnedTable,
	softDelete,
	updateRow,
} from '../../../domains/org-owned-writes.js';
import type { SimmerDatabase } from '../../../index.js';

// `OrgOwnedTable` replaces seven hand-written `WriteTable` unions in
// `apps/server`, so the first thing worth proving is that deriving it from the
// schema did not quietly drop a table one of those unions named. Every entry
// below was written by hand in a command family before this module existed; if
// the derived type stops covering one, this fails to compile rather than
// failing at the first write.

type Covers<TDerived extends string, TNamed extends TDerived> = TNamed;

type _HandWrittenUnionsAreCovered = Covers<
	OrgOwnedTable,
	// field-work-commands/shared.ts:155
	| 'comments'
	| 'tag_items'
	| 'additional_personnel'
	| 'routes'
	| 'route_items'
	| 'assignments'
	| 'assignment_items'
	// foundation-geography-commands/shared.ts:36
	| 'region_folders'
	| 'regions'
	| 'organization_species'
	// public-engagement-records-commands/shared.ts:201
	| 'contacts'
	| 'service_requests'
	| 'notification_registrations'
	| 'notification_registration_types'
	// mission-dispatch-commands/shared.ts:253
	| 'missions'
	| 'mission_items'
	// control-operations-commands/shared.ts:328 and :353, which disagreed: the
	// first five are `updateActionRow`'s, all eight are `softDelete`'s.
	| 'applications'
	| 'source_reductions'
	| 'outreach_actions'
	| 'biocontrol_actions'
	| 'requested_control_actions'
	| 'formulations'
	| 'formulation_insecticides'
	| 'application_batches'
	// Never reached a union at all — adult-surveillance and larval-surveillance
	// inlined these writes per handler.
	| 'traps'
	| 'collections'
	| 'collection_species'
	| 'habitats'
	| 'inspections'
	| 'samples'
	| 'sample_species'
>;

// Every table the nine location-source kinds resolve to. The four hand-written
// resolvers named these between them; the shared one names all eight.
type _LocationSourceTablesAreCovered = Covers<
	GeomTable,
	| 'addresses'
	| 'habitats'
	| 'inspections'
	| 'traps'
	| 'collections'
	| 'service_requests'
	| 'requested_control_actions'
	| 'mission_items'
>;

const organizationId = '9a3d9e12-2a1c-4d5f-8f2b-6d0f47a03c31';
const rowId = 'b7c0c1d4-8f43-4f6a-9d21-5f9a7b2e14aa';
const actorProfileId = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';

describe('org-owned writes', () => {
	// The tenancy predicate these three share is the reason a guessed id from
	// another agency cannot reach a row. It was re-typed in seven families and
	// asserted in none of them.
	it.each([
		[
			'updateRow',
			async (trx: Transaction<SimmerDatabase>) =>
				updateRow(trx, 'regions', rowId, organizationId, { name: 'x' }, ['id']),
		],
		[
			'softDelete',
			async (trx: Transaction<SimmerDatabase>) =>
				softDelete(trx, 'regions', rowId, organizationId, actorProfileId, ['id']),
		],
		[
			'loadGeojson',
			async (trx: Transaction<SimmerDatabase>) =>
				loadGeojson(trx, 'habitats', rowId, organizationId),
		],
	])('scopes %s to the agency and to rows that are not deleted', async (_helper, run) => {
		const { db, queries } = compilingDatabase();

		await db.transaction().execute(run);

		const sql = normalize(lastStatement(queries));
		expect(sql).toContain('"organization_id" = $');
		expect(sql).toContain('"deleted_at" is null');
		expect(lastParameters(queries)).toContain(organizationId);
	});

	it('stamps who retired the row, and when, from the database clock', async () => {
		const { db, queries } = compilingDatabase();

		await db
			.transaction()
			.execute(async (trx) =>
				softDelete(trx, 'regions', rowId, organizationId, actorProfileId, ['id']),
			);

		const sql = normalize(lastStatement(queries));
		expect(sql).toContain('"deleted_at" = now()');
		expect(sql).toContain('"updated_at" = now()');
		expect(lastParameters(queries)).toContain(actorProfileId);
	});

	it('refreshes updated_at on every update, whatever the caller set', async () => {
		const { db, queries } = compilingDatabase();

		await db
			.transaction()
			.execute(async (trx) =>
				updateRow(trx, 'regions', rowId, organizationId, { name: 'x' }, ['id']),
			);

		expect(normalize(lastStatement(queries))).toContain('"updated_at" = now()');
	});

	it('answers null rather than throwing when nothing matched', async () => {
		// DummyDriver returns no rows, which is the same shape as a row that is
		// another agency's, deleted, or absent — the three cases the caller in
		// `apps/server` turns into one 404.
		const { db } = compilingDatabase();

		const updated = await db
			.transaction()
			.execute(async (trx) =>
				updateRow(trx, 'regions', rowId, organizationId, { name: 'x' }, ['id']),
			);
		const deleted = await db
			.transaction()
			.execute(async (trx) =>
				softDelete(trx, 'regions', rowId, organizationId, actorProfileId, ['id']),
			);
		const geojson = await db
			.transaction()
			.execute(async (trx) => loadGeojson(trx, 'habitats', rowId, organizationId));

		expect(updated).toBeNull();
		expect(deleted).toBeNull();
		expect(geojson).toBeUndefined();
	});
});

interface CompiledQuery {
	readonly sql: string;
	readonly parameters: readonly unknown[];
}

/** The helper's own statement, past the `begin` the transaction opens with. */
function lastStatement(queries: readonly CompiledQuery[]): string {
	return queries.find((query) => /^\s*(update|select)/i.test(query.sql))?.sql ?? '';
}

function lastParameters(queries: readonly CompiledQuery[]): readonly unknown[] {
	return queries.find((query) => /^\s*(update|select)/i.test(query.sql))?.parameters ?? [];
}

/** A Kysely that compiles queries and records them instead of connecting. */
function compilingDatabase(): {
	readonly db: Kysely<SimmerDatabase>;
	readonly queries: CompiledQuery[];
} {
	const queries: CompiledQuery[] = [];
	const db = new Kysely<SimmerDatabase>({
		dialect: {
			createAdapter: () => new PostgresAdapter(),
			createDriver: () => new DummyDriver(),
			createIntrospector: (instance) => new PostgresIntrospector(instance),
			createQueryCompiler: () => new PostgresQueryCompiler(),
		},
		log: (event) => {
			queries.push({ sql: event.query.sql, parameters: event.query.parameters });
		},
	});

	return { db, queries };
}

function normalize(sql: string): string {
	return sql.replace(/\s+/g, ' ').trim();
}
