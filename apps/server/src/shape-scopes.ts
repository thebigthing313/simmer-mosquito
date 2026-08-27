/**
 * Which rows of a table exist for the agency reading it.
 *
 * Every shape route forces two things upstream: the columns, which say what a
 * client may see of a row, and a tenant predicate, which says which rows are
 * there at all. This module owns the second one, for every table in the database
 * rather than for every table someone remembered.
 *
 * It lives here rather than in `packages/sync` because it is an authorization
 * decision, and the server is the only party allowed to make one. A client never
 * sends a scope, cannot see this map, and gains nothing by knowing it — the
 * predicate is appended to the upstream request after the caller's parameters
 * have been stripped.
 *
 * ## Why the key is the database
 *
 * `keyof SimmerDatabase` is every table SIMMER has. Keying the map on it means a
 * migration that adds a table breaks this file until someone says who may read
 * it, instead of adding a table that quietly has no answer. That is the reverse
 * of the descriptor arrangement it replaces, where a table without a descriptor
 * simply had no route and nothing said so.
 *
 * ## Why the value is checked against the columns
 *
 * A scope is a `where` over columns the table must actually have. Name
 * `deleted_at` on a table without one and Electric rejects the shape; leave it
 * off a table that has one and soft-deleted rows stream to clients. Both are
 * silent until they are not, so `ScopeFor` derives the legal scopes from the
 * Kysely table type and the wrong one fails to compile, naming the table.
 *
 * The rules it encodes, all three readable off the columns:
 *
 * - No `organization_id` at all — the table is not tenant-owned, so the only
 *   predicate that can be written is none: `global`.
 * - `organization_id` nullable — a null means platform-owned, which is what the
 *   `-or-global` scopes exist to include.
 * - `deleted_at` present or absent — picks between the scope that filters
 *   soft-deleted rows and the `-no-soft-delete` one that cannot.
 *
 * That check is not a substitute for reading the entries. It rules out the
 * predicates a table cannot answer; it cannot know that `organizations` is the
 * agency's own row rather than global reference data, which is why that one table
 * is named in the type.
 */

import type { SimmerDatabase } from '@simmer-mosquito/db';

/**
 * The tenant predicate the server forces on a shape.
 *
 * The `-no-soft-delete` variants are not a decision to show deleted rows. They
 * are for tables with no `deleted_at` column, where naming one is a shape error.
 */
export type SyncShapeScope =
	/** `organization_id = $1 and deleted_at is null` — the ordinary case. */
	| 'organization'
	/** `organization_id = $1` — the table has no `deleted_at`. */
	| 'organization-no-soft-delete'
	/** Agency rows plus the platform-owned ones (`organization_id is null`). */
	| 'organization-or-global'
	/** Agency-or-global on a table with no `deleted_at`. */
	| 'organization-or-global-no-soft-delete'
	/** `id = $1` — the agency's own `organizations` row, and only that row. */
	| 'organization-row'
	/** No predicate at all: reference data every agency reads the same way. */
	| 'global';

/**
 * A table the server does not stream, and why.
 *
 * Stated rather than omitted, because "no entry" and "deliberately no shape" look
 * identical in a map and mean opposite things when a table is added.
 */
export interface UnservedShape {
	readonly served: false;
	readonly reason: string;
}

/** Whether a table's entry is a shape at all. */
export function isServedScope(entry: SyncShapeScope | UnservedShape): entry is SyncShapeScope {
	return typeof entry === 'string';
}

/** The variant of a scope pair a table's `deleted_at` column decides. */
type SoftDeleteAware<TTable, TFiltered, TUnfiltered> = TTable extends { deleted_at: unknown }
	? TFiltered
	: TUnfiltered;

/** The scopes a table's own columns can answer. See the module comment. */
type ColumnScopeFor<TTable> = TTable extends { organization_id: infer TOrganizationId }
	? null extends TOrganizationId
		? SoftDeleteAware<TTable, 'organization-or-global', 'organization-or-global-no-soft-delete'>
		: SoftDeleteAware<TTable, 'organization', 'organization-no-soft-delete'>
	: 'global';

/**
 * What one table may declare.
 *
 * `organizations` is named because no column distinguishes "the agency's own row"
 * from "reference data every agency reads" — both are tables without an
 * `organization_id`. Getting that one wrong publishes every agency's record to
 * every other agency, so it is not left to a judgement the compiler cannot check.
 */
type ScopeFor<TName extends keyof SimmerDatabase> =
	| (TName extends 'organizations' ? 'organization-row' : ColumnScopeFor<SimmerDatabase[TName]>)
	| UnservedShape;

/**
 * Every table, and who may read it.
 *
 * Ordered as `SimmerDatabase` declares them, so this file and the schema can be
 * read side by side.
 */
// `satisfies` rather than an annotation, so a missing table is still a compile
// error *and* each entry keeps its literal type. `search.ts` reads those
// literals to assert that every table in the search corpus is organization
// scoped; under an annotation every entry widens to `ScopeFor<TName>` and that
// assertion could not see the difference between `'organization'` and `'global'`.
export const syncShapeScopes = {
	/*
	 * A login, not a person in an agency. `users` has no `organization_id`, and
	 * the rows an agency may see are the ones its memberships point at — a join,
	 * which an Electric `where` cannot express: it filters one table's rows and
	 * has no subqueries. So there is no predicate that both includes an agency's
	 * colleagues and excludes every other agency's email addresses.
	 *
	 * Nothing is lost by withholding it. What an agency needs about a person is
	 * their Profile — the org-scoped record that exists precisely so attribution
	 * does not depend on a login.
	 */
	users: {
		served: false,
		reason:
			'No organization_id, and the agency-visible rows are reachable only through memberships, which a shape predicate cannot join. Read profiles instead.',
	},

	// The agency's own record, and only it. Global would hand every agency the
	// contact details and settings of every other one.
	organizations: 'organization-row',
	profiles: 'organization',
	// No `deleted_at`: a membership ends by changing status, not by being deleted.
	memberships: 'organization-no-soft-delete',

	addresses: 'organization',
	region_folders: 'organization',
	regions: 'organization',

	// The taxonomy is platform-owned and identical for everyone. Agencies choose
	// from it through `organization_species`, which is their own row.
	genera: 'global',
	species: 'global',
	organization_species: 'organization',

	collection_methods: 'organization',
	collection_lures: 'organization',
	habitat_types: 'organization',
	traps: 'organization',
	collections: 'organization',
	collection_species: 'organization',
	habitats: 'organization',
	inspections: 'organization',
	samples: 'organization',
	sample_species: 'organization',

	// Global like the taxonomy: a litre is a litre. See `packages/domain` for the
	// conversion factors, which are code rather than rows.
	units: 'global',

	application_methods: 'organization',
	vehicles: 'organization',
	equipment: 'organization',
	insecticides: 'organization',
	insecticide_batches: 'organization',
	formulations: 'organization',
	formulation_insecticides: 'organization',
	applications: 'organization',
	application_batches: 'organization',
	source_reduction_methods: 'organization',
	outreach_methods: 'organization',
	biocontrol_methods: 'organization',
	source_reductions: 'organization',
	outreach_actions: 'organization',
	biocontrol_actions: 'organization',

	contacts: 'organization',
	service_requests: 'organization',
	comments: 'organization',
	tags: 'organization',
	tag_items: 'organization',

	additional_personnel: 'organization',
	routes: 'organization',
	route_items: 'organization',
	assignments: 'organization',
	assignment_items: 'organization',
	requested_control_actions: 'organization',
	missions: 'organization',
	mission_items: 'organization',

	notification_types: 'organization',
	notification_registrations: 'organization',
	notification_registration_types: 'organization',
	mission_notifications: 'organization',

	// The three weather tables carry a nullable `organization_id`: a null row is a
	// platform-provided source or summary every agency reads, and a non-null one
	// is an agency's own. `weather_summaries` has no `deleted_at`.
	weather_sources: 'organization-or-global',
	weather_source_subscriptions: 'organization',
	weather_summaries: 'organization-or-global-no-soft-delete',
} satisfies { readonly [TName in keyof SimmerDatabase]: ScopeFor<TName> };

/**
 * The scope a table is served under, or a refusal naming why it is not.
 *
 * Called when routes are registered rather than when one is requested, so a table
 * with no shape fails at boot rather than on the request that needed it.
 */
export function shapeScopeOf(table: string): SyncShapeScope {
	if (!Object.hasOwn(syncShapeScopes, table)) {
		return unknownTable(table);
	}

	const entry = syncShapeScopes[table as keyof SimmerDatabase];

	if (!isServedScope(entry)) {
		throw new Error(`The table ${table} has no sync shape: ${entry.reason}`);
	}

	return entry;
}

function unknownTable(table: string): never {
	throw new Error(
		`No sync shape scope is declared for ${table}, which is not a table in SimmerDatabase.`,
	);
}
