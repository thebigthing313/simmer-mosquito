/**
 * What every query hook in this folder shares.
 *
 * The folder is the app's read seam: a route asks for a shape by name, and what
 * it gets back is named for the domain rather than for the columns. Below that
 * line everything is snake_case, because that is what Electric streams and what
 * a pushed-down predicate has to compile to; above it nothing knows a column
 * exists.
 *
 * One hook per file, named for the hook — `useHabitatSearch` lives in
 * `use-habitat-search.ts`. A file here that is not a `use-` file is not a hook:
 * this one, and the per-domain view model each family of hooks returns.
 *
 * ## Where a transform belongs
 *
 * In the query, not in the hook body. A `select` is compiled into the query
 * pipeline and re-runs when a row changes; a `.map()` in the hook body re-runs on
 * every render, and hands out new objects each time, so every consumer redraws
 * whether or not anything changed. The observer already caches its snapshot, so a
 * transform placed in the query inherits that for free.
 *
 * Use a compiled `select`, and reach for what the expression language offers
 * before deciding it cannot say something — `coalesce`, `caseWhen`, `concat`,
 * `upper`, `lower`, `length`, the comparisons, the arithmetic, the aggregates. A
 * projection built from those is part of the pipeline: it narrows what is
 * materialized, and a row whose other columns moved produces no change
 * downstream at all.
 *
 * `fn.select` takes arbitrary JavaScript and gives up both of those — it runs per
 * emitted row and cannot be pushed down or planned. It also receives the source
 * namespaces rather than a prior projection, so a compiled `select` in front of
 * it narrows nothing. Treat it as the last resort it is; nothing in this folder
 * has needed it.
 *
 * A `useMemo` in a hook body is a sign the transform should have been a `select`.
 * The exception is an index over the rows — a `Map` keyed by id — because a query
 * returns rows and cannot return a lookup of them.
 */

import {
	type Context,
	type ContextFromSource,
	coalesce,
	eq,
	type GetResult,
	type IR,
	type QueryBuilder,
	useLiveQuery,
} from '@tanstack/react-db';
import type { CollectionOf, SyncedRow } from '../../lib/collections/registry';

/**
 * A uuid no row has, for the moment a hook is asked about nothing.
 *
 * A live query cannot be conditional — hooks run unconditionally — so a hook
 * whose id is not known yet asks for an id that cannot match, and gets an empty
 * result rather than the whole table. Only ever compared, never written.
 */
export const unmatchableId = '00000000-0000-0000-0000-000000000000';

/**
 * How long an on-demand subset stays loaded after the last thing reading it unmounts.
 *
 * Thirty seconds, which covers the two cases it was written for: a user opening a
 * map card, closing it and opening it again, and an overview browsed back and forth
 * through, yesterday, then the day before, then back to yesterday. It is a query
 * option rather than a collection one, because the collection is shared. Every
 * on-demand read in the app takes this window, and each one used to write the
 * number out for itself: 26 private copies under `routes/` (#860), then 16 more
 * across the pickers and the query hooks and a second export for map cards
 * (#1429). Import this rather than writing 30 seconds out again.
 */
export const activityGcTimeMs = 30_000;

/**
 * What every Dashboard queue read off Electric answers with: how many are
 * pending and how old the oldest is, beside the two status flags the panel
 * draws its skeleton and its message on. Four hooks answer this shape, and the
 * page reads them through one row component.
 */
export interface ElectricQueue {
	readonly count: number;
	/** The oldest pending row's date, `YYYY-MM-DD` in the Organization's zone; null at zero. */
	readonly oldest: string | null;
	readonly isReady: boolean;
	readonly isError: boolean;
}

/** The query a caller of {@link useRecordById} builds, with the row aliased `record`. */
type RecordQuery<TRow extends SyncedRow, TContext extends Context> = (
	query: QueryBuilder<ContextFromSource<{ record: CollectionOf<TRow> }>>,
) => QueryBuilder<TContext>;

/**
 * One record by id, with the joins and projection the caller writes.
 *
 * Three things a hook stops deciding for itself: the alias, the id predicate,
 * and forwarding `isError`. The last is the one that was going wrong. A failed
 * read and a table holding no such row are different answers, and a hook that
 * returns `{record, isReady}` alone leaves a detail page unable to tell them
 * apart, so `RecordDetailPage` drew "could not be found, or you do not have
 * access to it" over a read that had failed and told the reader to stop looking
 * for a record that exists. Six hooks did that; here it is the factory's
 * behaviour rather than something each one remembers.
 *
 * The id is nullable so a form can ask before the user has chosen a record. A
 * hook cannot be called conditionally, so the absent case asks for an id no row
 * has rather than being skipped, which is an empty result instead of the table.
 *
 * ## The on-demand rule lives here now
 *
 * This reads through `useLiveQuery` and gates on status, never through
 * `useLiveSuspenseQuery`. That is the rule for an on-demand collection: the
 * suspense hook sticks after a navigation unmount over one, so a route that used
 * it would hang on the way out. Eight hooks used to restate that in their own
 * docblocks, which is eight places for it to go stale. A hook on this factory
 * inherits it and says nothing.
 *
 * The consequence a caller has to handle is that a record and a pending read both
 * read as `undefined`, which is what `isReady` separates.
 */
export function useRecordById<TRow extends SyncedRow, TContext extends Context>(options: {
	readonly collection: CollectionOf<TRow>;
	readonly id: string | null;
	readonly query: RecordQuery<TRow, TContext>;
	/** Defaults to {@link activityGcTimeMs}. */
	readonly gcTime?: number | undefined;
}): {
	readonly record: GetResult<TContext> | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const { collection, id } = options;
	const result = useLiveQuery({
		gcTime: options.gcTime ?? activityGcTimeMs,
		query: (query) =>
			options.query(
				query
					.from({ record: collection })
					.where(({ record }) => eq(record.id, id ?? unmatchableId)),
			),
	});

	// The cast is the price of the callback being generic. `useLiveQuery` reads the
	// row type off the builder its query returns, and here that builder is still
	// `QueryBuilder<TContext>` with `TContext` unresolved, so it widens the row to
	// `{}`. The signature states the caller's own `TContext` instead, and each hook
	// on this declares the view model it hands back, so a projection that does not
	// match still fails at the hook rather than reaching a page.
	return {
		record: result.data[0] as GetResult<TContext> | undefined,
		isReady: result.isReady,
		isError: result.isError,
	};
}

/**
 * The columns {@link addressSelect} reads, as a query namespace hands them over.
 *
 * `unknown` rather than the ref types, so the fragment stays out of
 * `@tanstack/db`'s ref internals: the generic passes each column's ref straight
 * through, which is what keeps the nullable brand a `left` join puts on it. Lose
 * that and the projected fields stop being `| undefined` and `LinkedAddress` no
 * longer describes what arrives.
 */
type AddressColumns = {
	id: unknown;
	display_name: unknown;
	address_line_1: unknown;
	address_line_2: unknown;
	locality: unknown;
	region: unknown;
	postal_code: unknown;
};

/**
 * The seven address columns every surface that names a place projects.
 *
 * Sixteen queries wrote the same seven lines out, and the block is the whole of
 * what `lib/address-format.ts` reads. Spread it into a `select`, either as the
 * nested `address` object a joined record carries or as the projection of a query
 * over `addresses` itself.
 *
 * It is a plain function rather than anything the query builder knows about: a
 * `select` object is built at query time, so a fragment of one is a function that
 * returns the fields. Whether the result is `Address` or `LinkedAddress` is
 * decided by the namespace it is handed, which is `address-view.ts`'s subject.
 */
export function addressSelect<TAddress extends AddressColumns>(
	address: TAddress,
): {
	id: TAddress['id'];
	displayName: TAddress['display_name'];
	addressLine1: TAddress['address_line_1'];
	addressLine2: TAddress['address_line_2'];
	locality: TAddress['locality'];
	region: TAddress['region'];
	postalCode: TAddress['postal_code'];
} {
	return {
		id: address.id,
		displayName: address.display_name,
		addressLine1: address.address_line_1,
		addressLine2: address.address_line_2,
		locality: address.locality,
		region: address.region,
		postalCode: address.postal_code,
	};
}

/** What `coalesce` accepts, which `@tanstack/db` does not export by name. */
type CoalesceArgument = Parameters<typeof coalesce>[0];

/** The value `coalesce` would type a lone column as: its non-null type. */
type CoalescedValue<TColumn extends CoalesceArgument> =
	ReturnType<typeof coalesce<[TColumn]>> extends IR.BasicExpression<infer TValue> ? TValue : never;

/**
 * A column from the optional side of a `left` join, or `null` when the join
 * matched nothing.
 *
 * It evaluates as `coalesce(column, null)`, which is what the #874 rule asks a
 * joined column to be projected as. The bare call types wrong: `coalesce` reads
 * its arguments through a type that drops the nullable brand a `left` join puts
 * on the ref, so a column that is non-null in its own row schema comes back
 * typed without `| null` while an unmatched join hands back `null`. This states
 * the `| null`, so an inferred `select` type agrees with what arrives.
 *
 * On a ref from the source side it is redundant and harmless.
 */
export function joinedOrNull<TColumn extends CoalesceArgument>(
	column: TColumn,
): IR.BasicExpression<CoalescedValue<TColumn> | null> {
	// The cast is inside the helper so no call site carries one. `coalesce`'s
	// return type is a conditional over `TColumn` that stays unresolved here.
	return coalesce(column, null) as IR.BasicExpression<CoalescedValue<TColumn> | null>;
}
