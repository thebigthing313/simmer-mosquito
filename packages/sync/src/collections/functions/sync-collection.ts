/**
 * What every synced table has in common, in one call.
 *
 * A table's own file is then only the parts that differ: its schema, and the
 * projection between its columns and the vocabulary its command endpoint speaks.
 * Everything below was the same across all 55 descriptors before it — the
 * difference is that a descriptor described a shape for something else to
 * assemble, and this returns the assembled thing.
 *
 * Deliberately not general beyond this repo: the shape route convention, the
 * cookie credential, and the two Postgres types SIMMER actually stores are all
 * fixed here, because each is a decision rather than a parameter.
 *
 * ## Why this returns a config and not the collection
 *
 * `electricCollectionOptions` is overloaded on whether a `schema` is present, and
 * the schema overload infers the row type through `InferSchemaOutput<T>`. A
 * conditional type cannot be evaluated while `T` is an unresolved generic, so a
 * wrapper that took the schema as `<TSchema extends ...>` and called the library
 * on the caller's behalf would have that overload rejected and fall through to
 * the schemaless one — where the row silently degrades to
 * `Record<string, unknown>`, `getKey` returns `unknown`, and typos stop being
 * errors. Asserting past it needs a hand-written return type built from library
 * internals, which is a worse thing to own than four lines at each call site.
 *
 * So the schema stays where it is concrete — in the table's own file, one line
 * from the type it defines — and this contributes everything else, including the
 * parts that do depend on the row type but not on which table it is. Every table
 * therefore ends the same way:
 *
 * ```ts
 * return createCollection(
 * 	electricCollectionOptions({
 * 		...syncCollectionConfig<Habitat>({ table: 'habitats', ...options }),
 * 		schema: habitatSchema,
 * 	}),
 * )
 * ```
 */

import type { SyncMode } from '@tanstack/db';
import type { z } from 'zod';
import { createMutationHandlers } from './mutation-handlers.js';
import { shapePathFor } from './routes.js';

/**
 * Raw geometry that must never stream through a shape.
 *
 * `geom` is binary and `geojson` runs to megabytes per row; both are served by
 * the `/map/*` endpoints instead. What may sync is the trigger-maintained
 * centroid (`lat`, `lng`, `geom_type`), which is why this names columns rather
 * than refusing spatial tables outright.
 *
 * Exported rather than checked here because columns now come from the schema, and
 * the schema is not visible to this function — see the module comment. The
 * invariant is asserted across every collection module in the unit tests, which
 * is already how the descriptors enforce it.
 */
export const serverOnlyGeometryColumns: readonly string[] = ['geom', 'geojson'];

/** The columns a schema declares, which is what its shape route must serve. */
export function syncedColumnsOf(schema: z.ZodObject<z.ZodRawShape>): readonly string[] {
	return Object.keys(schema.shape);
}

/**
 * How Electric's text wire format becomes the values a row holds, keyed by
 * Postgres type.
 *
 * The schema does not run on the sync path — it validates what `insert()` and
 * `update()` accept — so this is the only thing standing between the wire and the
 * collection. Whatever it produces is what comparisons order, what `deepEquals`
 * diffs into `mutation.changes`, and what the subset compiler serializes back
 * into a shape request. One entry is four decisions at once.
 *
 * SIMMER's migrations contain exactly two date/time types: 188 `timestamptz` and
 * 13 `date`. There is no `timestamp` without a zone, no `time`, no `interval`. So
 * this map is closed, not a registry awaiting entries.
 *
 * **`date` is absent on purpose. Do not add it.** A `date` column is a calendar
 * day, and every way of turning one into a `Date` picks a timezone the column
 * does not have: `new Date('2026-08-14')` is UTC midnight, the previous day for
 * every agency west of Greenwich, and local midnight makes the stored value
 * differ between two clients reading the same row. Left alone it stays the
 * `YYYY-MM-DD` string Postgres sent — fixed-width and zero-padded, so
 * lexicographic order *is* chronological order, equality is `===`, and the subset
 * compiler emits `'2026-08-14'`, exactly the literal a `date` column wants.
 * `Temporal.PlainDate` would say all of that in the type system rather than in
 * this comment, and cannot be used yet: see issue #161.
 *
 * `timestamptz` does need parsing. Its Postgres text form is neither fixed-width
 * nor normalized, so string comparison misorders silently instead of failing, and
 * `Date` is handled explicitly on all four paths — `getTime()` ordering,
 * `getTime()` equality (so a re-parsed value is never a spurious change),
 * `getTime()` index keys, and `toISOString()` on the way back out to SQL.
 */
const shapeParsers = {
	timestamptz: (value: string) => new Date(value),
};

/**
 * The session cookie is the whole authorization story; nothing about the agency
 * travels in the request itself.
 *
 * Annotated `typeof fetch` rather than given parameter types of its own. Electric
 * declares `fetchClient?: typeof fetch`, whose first parameter is
 * `RequestInfo | URL` — writing `(request: Request, …)` narrows it, and
 * `strictFunctionTypes` rejects a narrowed parameter in a function-type position.
 * That rejection is not reported where it happens: it invalidates the whole
 * config object, so the schema overload is dropped and the error surfaces as the
 * schemaless overload complaining that a schema is not assignable to `never`.
 */
const fetchWithSession: typeof fetch = (request, init) =>
	fetch(request, { ...init, credentials: 'include' });

/**
 * How long a collection survives with no subscribers before it is collected.
 *
 * Five minutes, which is what the library would do anyway — stated here so there
 * is one place to change it rather than a default inherited silently from a
 * dependency.
 *
 * Not tied to `syncMode`: an eager collection with nothing mounted against it is
 * garbage collected on the same rule. What differs is the cost of being wrong,
 * since re-syncing an eager table is a whole snapshot.
 */
const defaultGcTime = 5 * 60 * 1000;

/**
 * `eager` streams the table up front, `on-demand` loads the subsets live queries
 * ask for, and `progressive` serves a snapshot while the full stream catches up.
 *
 * Electric's own union, restated rather than imported — the package exports the
 * type from its internals but not from its entry point.
 */
export type CollectionSyncMode = SyncMode | 'progressive';

/**
 * What a client says about a collection it wants.
 *
 * Everything else is a fact about the table, and every fact about a table is in
 * its schema. None of these are: the same table is wanted differently by
 * different apps, so this package holds no opinion about any of them.
 *
 * `apps/mobile` needs habitats `eager` or `progressive`, because working offline
 * means every habitat has to be on the device before the signal goes. `apps/web`
 * is online-only and wants the same table `on-demand`. A default here would be
 * this package quietly answering a question it cannot know the answer to — and
 * the wrong answer is either a snapshot before first paint or an app that cannot
 * work in the field.
 */
export interface SyncCollectionClientOptions {
	/** Base URL of the API. A parameter because this package has no environment. */
	readonly serverUrl: string;
	/** Required, and deliberately not defaulted. See above. */
	readonly syncMode: CollectionSyncMode;
	/**
	 * Whether this client may write to the table.
	 *
	 * Also per-app rather than per-table: `apps/admin` maintains the global species
	 * taxonomy, `apps/web` and `apps/mobile` only read it. Declaring `false` leaves
	 * the collection with no `onInsert`/`onUpdate`/`onDelete` at all, so a write is
	 * refused by the collection instead of travelling to a server that would refuse
	 * it anyway — which keeps an app from carrying an API it has no business
	 * offering.
	 */
	readonly mutations: boolean;
	/** Override {@link defaultGcTime} for a surface that returns to this table. */
	readonly gcTime?: number;
}

export interface SyncCollectionConfigOptions extends SyncCollectionClientOptions {
	/** The Postgres table. Names the collection and derives both its routes. */
	readonly table: string;
}

/**
 * Everything about a synced collection that does not depend on its row type.
 *
 * Spread into `electricCollectionOptions` alongside the table's own `schema` and
 * `getKey`.
 *
 * The return type is written out rather than inferred so it cannot become a
 * union — an argument of union type cannot select the schema overload, which
 * would put the row type back to `Record<string, unknown>` at every call site.
 */
export interface SyncCollectionConfig<TRow extends SyncedRow>
	extends Partial<ReturnType<typeof createMutationHandlers<TRow>>> {
	readonly id: string;
	readonly syncMode: CollectionSyncMode;
	readonly gcTime: number;
	readonly getKey: (row: TRow) => string;
	readonly shapeOptions: {
		readonly url: string;
		/** Literal rather than `string`, so it still selects Electric's POST overload. */
		readonly subsetMethod: 'POST';
		readonly fetchClient: typeof fetch;
		readonly parser: typeof shapeParsers;
	};
}

/**
 * Every synced table has a single `uuid` primary key named `id`.
 *
 * That is a property of the migrations rather than a convention this package
 * hopes for: all fifty-six of them declare `id uuid primary key`, join tables
 * included — `collection_species` and `route_items` carry a surrogate key rather
 * than a composite one. So `getKey` is not a per-table decision, and stating it
 * here means a table that ever broke the rule would fail to compile rather than
 * quietly key its collection on `undefined`.
 */
export interface SyncedRow {
	readonly id: string;
}

export function syncCollectionConfig<TRow extends SyncedRow>(
	options: SyncCollectionConfigOptions,
): SyncCollectionConfig<TRow> {
	return {
		id: options.table,
		syncMode: options.syncMode,
		gcTime: options.gcTime ?? defaultGcTime,
		getKey: (row) => row.id,

		// Spread rather than assigned so a read-only client has no `onInsert` key at
		// all, rather than one holding `undefined` — which is both what
		// `exactOptionalPropertyTypes` means and what makes the collection refuse a
		// write outright rather than attempting one.
		//
		// This is not the authorization decision. The server still owns which writes
		// are permitted, and still refuses them; declaring `false` here only stops an
		// app offering a write API it was never going to be allowed to use.
		...(options.mutations
			? createMutationHandlers<TRow>({
					serverUrl: options.serverUrl,
				})
			: {}),

		shapeOptions: {
			// One route per table. The server owns the shape: it forces `table`,
			// `columns`, and the tenant `where` from the session cookie, and strips any
			// the client sends — so there is no `params` to set here.
			url: `${options.serverUrl}${shapePathFor(options.table)}`,

			// Subset snapshot requests ride in a POST body so a large id set never hits
			// the URL-length ceiling. The live shape-log stream stays on GET.
			//
			// This is what a join needs. The compiler loads the joined side lazily by
			// collecting the join keys the driving side produced and asking for exactly
			// those rows — one `IN` over as many ids as the query matched. A day of
			// Habitat Inspections is a couple of hundred uuids, which is past what a URL
			// will carry, so on GET the request never lands and the joined side stays
			// empty: names simply do not appear, with no error to say why.
			//
			// Electric 2.0 deprecates GET for subsets regardless.
			subsetMethod: 'POST',

			fetchClient: fetchWithSession,

			parser: shapeParsers,
		},
	};
}
