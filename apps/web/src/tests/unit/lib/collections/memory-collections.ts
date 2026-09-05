/**
 * The second collection source: rows in memory, no server.
 *
 * `sync-source.ts` is the one the app installs. This is the one a test
 * installs, and having two is what makes the registry a seam rather than an
 * indirection. A test that wants to read through `useHabitat` installs this,
 * seeds the rows, and renders the hook; nothing opens a shape and nothing
 * needs a server URL.
 *
 * The collections are real TanStack DB collections rather than object stubs.
 * A stub would make every assertion be about a query the engine never ran:
 * joins, `orderBy`, `where` and the compiled `select` are the engine's work,
 * and they are the part of a read hook worth testing.
 *
 * Installing forgets what the last install built, so each test starts from
 * empty tables. Call it from a `beforeEach`.
 */

import { createCollection } from '@tanstack/db';
import { expect } from 'vitest';
import {
	type CollectionDeclaration,
	type CollectionOf,
	type CollectionResolver,
	installCollections,
	type SyncedRow,
} from '../../../../lib/collections/registry';

/** A row as a collection holds one: snake_case columns, keyed by `id`. */
export type MemoryRow = Record<string, unknown> & { readonly id: string };

/** What a collection's sync function is handed, narrowed to what a test drives. */
interface SyncControls {
	readonly begin: () => void;
	readonly write: (message: { readonly type: 'insert'; readonly value: MemoryRow }) => void;
	readonly commit: () => void;
	readonly markReady: () => void;
}

const open = new Map<string, SyncControls>();

/**
 * What a live query asked the sync layer to load, as the sync layer receives it.
 *
 * The real Electric collection compiles exactly this into the shape request:
 * `where` becomes the shape's `where`, `orderBy` its `order_by`, `limit` its
 * `limit`. So a request recorded here is the narrowing that reaches Postgres,
 * and a predicate that is not here is one the browser applied to rows it had
 * already been sent.
 */
export interface SubsetRequest {
	readonly where?: unknown;
	readonly orderBy?: unknown;
	readonly limit?: number;
}

const subsets = new Map<string, SubsetRequest[]>();

export interface MemoryCollectionOptions {
	/**
	 * Whether a collection reports itself synced as soon as it is built.
	 *
	 * `true` by default, which is a table that has finished syncing and holds no
	 * rows. Pass `false` to hold every collection unsynced until
	 * {@link seedRows} or {@link markSynced}: that is the difference between "no
	 * rows" and "not yet", and a read hook that cannot tell a caller which of
	 * the two it is showing has an empty state that lies.
	 */
	readonly ready?: boolean;
	/**
	 * Build the tables their modules declare `on-demand` in on-demand mode, and
	 * record what each live query asks the sync layer to load.
	 *
	 * Off by default, because it changes what a collection is: on-demand is the
	 * mode that has a `loadSubset` handler at all, and the rest of these suites
	 * are about what a query returns rather than about what it requested. Turn it
	 * on to read {@link subsetRequests}, which is the only way from here to tell a
	 * predicate the server answered from one the browser applied afterwards.
	 */
	readonly recordSubsets?: boolean;
}

/** Build every collection in memory from here on. */
export function installMemoryCollections(options: MemoryCollectionOptions = {}): void {
	const ready = options.ready ?? true;
	const recordSubsets = options.recordSubsets ?? false;
	open.clear();
	subsets.clear();
	installCollections({
		build: (declaration) => buildMemoryCollection(declaration, ready, recordSubsets),
	});
}

/**
 * What the collection for `resolver`'s table was asked to load, oldest first.
 *
 * Empty unless {@link installMemoryCollections} was called with
 * `recordSubsets`, and empty for a table declared eager whatever the option
 * says: an eager collection streams the whole table and never asks for a subset.
 */
export function subsetRequests<TRow extends SyncedRow>(
	resolver: CollectionResolver<TRow>,
): readonly SubsetRequest[] {
	resolver();
	return subsets.get(resolver.declaration.table) ?? [];
}

/**
 * A recorded request's `where`, written out the way the shape request reads it.
 *
 * `compileSQL` in `@tanstack/electric-db-collection` turns the same tree into
 * the shape's `where` string, one operator at a time, with every value a bound
 * parameter. This renders the operators the same way and puts the values inline,
 * so a suite can assert on the predicate that travelled rather than on a tree of
 * library internals. The library's compiler is not importable from here: the
 * package exports `electricCollectionOptions` and nothing else.
 *
 * A column reference is written as its whole path. `compileSQL` throws on a path
 * with more than one segment, so a predicate that would not compile shows up in
 * the assertion as `inspection.is_wet` rather than `is_wet`.
 */
export function subsetPredicate(request: SubsetRequest): string {
	return request.where === undefined ? '' : renderExpression(request.where);
}

interface ExpressionNode {
	readonly type: string;
	readonly path?: readonly string[];
	readonly value?: unknown;
	readonly name?: string;
	readonly args?: readonly unknown[];
}

/** The operators `compileSQL` writes, spelled the way it spells them. */
const SQL_OPERATORS: Readonly<Record<string, string>> = {
	eq: '=',
	gt: '>',
	gte: '>=',
	lt: '<',
	lte: '<=',
	in: '= ANY',
	like: 'LIKE',
	ilike: 'ILIKE',
};

function renderExpression(node: unknown): string {
	const expression = node as ExpressionNode;
	if (expression.type === 'ref') {
		return (expression.path ?? []).join('.');
	}
	if (expression.type === 'val') {
		return renderValue(expression.value);
	}
	return renderCall(expression.name ?? '?', (expression.args ?? []).map(renderExpression));
}

function renderCall(name: string, args: readonly string[]): string {
	if (name === 'and' || name === 'or') {
		return `(${args.join(` ${name} `)})`;
	}
	if (name === 'isNull' || name === 'isUndefined') {
		return `${args[0]} IS NULL`;
	}
	if (name === 'not') {
		return `NOT (${args[0]})`;
	}
	const operator = SQL_OPERATORS[name];
	return operator === undefined
		? `${name}(${args.join(', ')})`
		: `${args[0]} ${operator} ${args[1]}`;
}

function renderValue(value: unknown): string {
	return Array.isArray(value) ? `[${value.map(renderValue).join(', ')}]` : String(value);
}

function buildMemoryCollection<TRow extends SyncedRow>(
	declaration: CollectionDeclaration<TRow>,
	ready: boolean,
	recordSubsets: boolean,
): CollectionOf<TRow> {
	const isOnDemand = recordSubsets && declaration.syncMode === 'on-demand';
	const recorded: SubsetRequest[] = [];
	if (isOnDemand) {
		subsets.set(declaration.table, recorded);
	}
	const collection = createCollection<MemoryRow>({
		id: declaration.table,
		getKey: (row) => row.id,
		// Eagerly, so the controls are registered before a test seeds through them.
		startSync: true,
		...(isOnDemand ? { syncMode: 'on-demand' as const } : {}),
		sync: {
			sync: (controls) => {
				open.set(declaration.table, controls as unknown as SyncControls);
				if (ready) controls.markReady();
				if (!isOnDemand) return;
				// `true` rather than a promise: the rows are already seeded, so there
				// is nothing to await, and an unresolved promise would hold every
				// subscription at `loadingSubset`.
				return {
					loadSubset: (options: SubsetRequest) => {
						recorded.push(options);
						return true;
					},
				};
			},
		},

		// Spread rather than assigned, so a table this app only reads has no
		// handlers at all and refuses a write the way the real collection does.
		...(declaration.mutations
			? {
					onInsert: () => Promise.resolve(),
					onUpdate: () => Promise.resolve(),
					onDelete: () => Promise.resolve(),
				}
			: {}),
	});

	return collection as unknown as CollectionOf<TRow>;
}

/**
 * Put rows in a collection as though they had synced, and report it synced.
 *
 * Takes the module's resolver rather than a table name, so seeding a table
 * nothing imports is a compile error and the columns are checked against the
 * generated row schema. Seeding twice adds to what is there rather than
 * replacing it, which is what a shape does.
 */
export function seedRows<TRow extends SyncedRow>(
	collection: CollectionResolver<TRow>,
	rows: readonly MemoryRow[],
): void {
	const controls = controlsFor(collection);
	controls.begin();
	for (const row of rows) {
		controls.write({ type: 'insert', value: row });
	}
	controls.commit();
	controls.markReady();
}

/** Report a collection synced and empty, without seeding anything. */
export function markSynced<TRow extends SyncedRow>(collection: CollectionResolver<TRow>): void {
	controlsFor(collection).markReady();
}

/** Resolving is what registers the controls, so ask for the collection first. */
function controlsFor<TRow extends SyncedRow>(collection: CollectionResolver<TRow>): SyncControls {
	collection();
	const table = collection.declaration.table;
	const controls = open.get(table);
	expect(controls, `the ${table} collection was never resolved`).toBeDefined();
	return controls as SyncControls;
}
