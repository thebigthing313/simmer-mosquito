/**
 * The habitats collection, defined plainly.
 *
 * No descriptor, no shared options factory — everything this collection is sits
 * in this file so the whole shape of one table can be read in one place.
 *
 * Field names are the Postgres column names, unchanged. Electric already streams
 * snake_case (the server forces the column list upstream), so leaving it alone
 * means no `columnMapper`, and the predicates a live query pushes down as subset
 * requests compile to SQL that needs no identifier rewriting.
 */

import { createCollection } from '@tanstack/db';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { z } from 'zod';
import { type CommandBody, createMutationHandlers } from './functions/mutation-handlers.js';
import { readLocationSource } from './functions/mutation-metadata.js';

/**
 * Where this table's shape is served.
 *
 * `/sync/shapes/*` is a SIMMER convention, not something Electric or TanStack DB
 * knows about — both only ever see a URL. The path therefore has to agree with
 * the route the server registers, so it is written once, here, for the server to
 * read when it registers from this module rather than from a descriptor.
 */
export const habitatsShapePath = '/sync/shapes/habitats';

/**
 * A habitat row as it arrives on the client — the `habitats` table, minus what
 * a client never receives.
 *
 * `geom` and `geojson` are absent on purpose: full geometry is served by the
 * `/map/*` endpoints and never streamed through a shape. What syncs is the
 * trigger-maintained centroid (`lat`, `lng`, `geom_type`).
 *
 * `deleted_at` and `deleted_by_profile_id` are absent too — the server's shape
 * predicate filters soft-deleted rows out upstream, so a deleted habitat never
 * reaches this collection.
 *
 * The schema validates the *mutation* path only — what `insert()` and `update()`
 * accept. Rows arriving over the shape stream bypass it; parsing those is
 * `shapeOptions.parser`'s job, and there is nothing to parse while every column
 * here is already a JSON primitive.
 */
export const habitatSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	lat: z.number(),
	lng: z.number(),
	geom_type: z.string(),
	address_id: z.uuid().nullable(),
	habitat_type_id: z.uuid().nullable(),
	habitat_name: z.string().nullable(),
	description: z.string(),
	is_active: z.boolean(),
	is_inaccessible: z.boolean(),
	// `JsonColumn` in the database is `unknown | null`; the domain narrows it to a
	// JSON object on the way in, but a row can carry whatever is already stored.
	metadata: z.unknown().nullable(),
	// The audit columns are stamped by the server inside the write transaction, so
	// a caller has nothing true to say about them. `.default()` rather than
	// `.optional()`: it drops them from the accepted input while keeping them
	// required on the stored row, which every synced habitat does carry. The
	// defaults only ever fill an optimistic row that the next sync replaces.
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	// Both columns are `timestamptz`, and Electric hands those over as ISO strings
	// rather than parsing them. `z.coerce.date()` covers the mutation path; the
	// `parser` below covers the sync path. Coercion rather than a bare `z.date()`
	// because `update()` hands the schema a draft that already holds a `Date`, so
	// the accepted input has to be a superset of the stored output.
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Habitat = z.infer<typeof habitatSchema>;

/**
 * The create payload.
 *
 * Deliberately narrower than the row: `organization_id` comes from the session,
 * the centroid columns are derived from the geometry, and the audit columns are
 * stamped by the server. Sending the client's guesses at those would be sending
 * values the server is about to overwrite.
 *
 * The location instruction itself is not built here — every location-bearing
 * table forwards it identically, so the handler folds it in. What is specific to
 * habitats is that one is *required*: a habitat is a place, and there is nothing
 * to create without knowing where. `createHabitatCommand` refuses the same write
 * server-side, so this only saves a round trip.
 */
export function toHabitatInsertBody(row: Habitat, metadata: unknown): CommandBody {
	if (readLocationSource(metadata) === undefined) {
		throw new Error('Habitat geometry is required.');
	}

	return {
		id: row.id,
		addressId: row.address_id,
		habitatTypeId: row.habitat_type_id,
		habitatName: row.habitat_name,
		description: row.description,
		metadata: row.metadata,
	};
}

/**
 * The patch payload: the columns this endpoint accepts, of the ones that changed.
 *
 * `changes` is the library's own diff, so a field is here because it genuinely
 * differs — not because a hand-maintained key list happened to include it. The
 * projection then drops what the endpoint does not take: an edit form stamps
 * `updated_at` and `updated_by_profile_id` on every save so the optimistic row
 * looks right, and the server stamps its own inside the transaction.
 */
export function toHabitatUpdateBody(changes: Partial<Habitat>): CommandBody {
	const body: CommandBody = {};

	if ('habitat_name' in changes) body.habitatName = changes.habitat_name;
	if ('description' in changes) body.description = changes.description;
	if ('address_id' in changes) body.addressId = changes.address_id;
	if ('habitat_type_id' in changes) body.habitatTypeId = changes.habitat_type_id;
	if ('is_active' in changes) body.isActive = changes.is_active;
	if ('is_inaccessible' in changes) body.isInaccessible = changes.is_inaccessible;
	if ('metadata' in changes) body.metadata = changes.metadata;

	return body;
}

/**
 * `serverUrl` is a parameter rather than a constant because this package has no
 * environment to read: the frontends talk to the API cross-origin and each one
 * resolves its own base URL.
 */
export function createHabitatsCollection(options: { readonly serverUrl: string }) {
	const handlers = createMutationHandlers<Habitat>({
		// Writes go to the command endpoint, not to the shape route: reads are
		// authorized per shape, writes per command.
		endpoint: `${options.serverUrl}/larval-surveillance/habitats`,
		fallbackMessage: 'Unable to save habitat.',
		toInsertBody: toHabitatInsertBody,
		toUpdateBody: toHabitatUpdateBody,
	});

	return createCollection(
		// No explicit type parameter: the schema is the single declaration and the
		// row type is inferred from it. Passing both is a documented anti-pattern —
		// the generic and the schema become conflicting type constraints.
		electricCollectionOptions({
			id: 'habitats',
			schema: habitatSchema,
			getKey: (row) => row.id,
			...handlers,

			// Habitat catalogs run to tens of thousands of rows per agency, so rows
			// load as the subsets live queries ask for, not as one baseline.
			syncMode: 'on-demand',

			shapeOptions: {
				// One route per table. The server owns the shape: it forces `table`,
				// `columns`, and the tenant `where` from the session cookie, and strips
				// any the client sends — so there is no `params` to set here.
				url: `${options.serverUrl}${habitatsShapePath}`,

				// The session cookie is the whole authorization story; nothing about the
				// agency travels in the request itself.
				fetchClient: (request, init) => fetch(request, { ...init, credentials: 'include' }),

				// The sync path does not run the schema — rows off the stream are parsed
				// here instead, keyed by Postgres type. Every `timestamptz` column on
				// this table lands as a `Date`, matching what the schema stores.
				parser: {
					timestamptz: (value) => new Date(value),
				},
			},
		}),
	);
}
