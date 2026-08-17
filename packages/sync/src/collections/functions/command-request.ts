/**
 * One pending mutation, as the request that carries it.
 *
 * This is the whole of what a SIMMER write *is* on the wire: which route, which
 * verb, which fields, and the command it means. It is a pure function of the
 * mutation, so nothing here sends anything.
 *
 * ## Why it is separate from the handlers
 *
 * A collection's `onInsert`/`onUpdate`/`onDelete` are not the only path a write
 * can take. Inside `createTransaction`, TanStack DB applies the mutations to the
 * ambient transaction and never calls the collection's handlers at all — the
 * transaction's own `mutationFn` becomes responsible for persisting every one of
 * them, across every collection they touch.
 *
 * A command that writes several tables has to go that way. If this logic lived
 * in the handlers, that path would have to restate it: which columns the server
 * owns, how the location instruction rides along, when an edit is a no-op, and
 * where the intent goes. Four rules, restated once for the simple path and once
 * for the batch, is the shape of the duplication this layer exists to remove.
 *
 * ## What a transaction sends, now settled
 *
 * One request, and this builder is not what produces its body — see
 * `command-transaction.ts`. Every member of `MultiRowCommandType` is a single
 * command with a single payload: a move takes an id list, a merge takes a losing
 * -row list, a create takes its children. There is no member for which one
 * request per mutation is the right answer, and doing it that way would be worse
 * than the two-phase writes it replaces: if the parent lands and a child is
 * refused, the library rolls the whole group back on screen while the server
 * keeps the parent.
 *
 * So a transaction's mutations exist only so the library can apply the change and
 * take it back. What both paths do share is {@link refuseIfReadOnly}, because a
 * transaction is exactly where the library stops checking.
 */

import {
	acknowledgementFields,
	argumentFields,
	contextFields,
	locationSourceFields,
	requireIntents,
} from './mutation-metadata.js';
import { commandPathFor } from './routes.js';

/** The body of a command: row fields named for their Postgres columns. */
export type CommandBody = Record<string, unknown>;

export interface CommandRequest {
	readonly method: 'POST' | 'PATCH' | 'DELETE';
	readonly url: string;
	readonly body: CommandBody;
}

/**
 * The least a mutation has to be for the read-only guard to judge it.
 *
 * Separate from {@link PendingWrite} because a transaction holds mutations from
 * several collections at once and never looks at their rows — it builds one body
 * of its own — but must still refuse a write to a collection the client declared
 * read-only. This is the part both paths share.
 */
export interface WriteTarget {
	readonly type: 'insert' | 'update' | 'delete';
	/**
	 * The collection the mutation belongs to.
	 *
	 * Its `id` is the table, and its `config` records what the client declared —
	 * an absent handler is how `mutations: false` is written down. Both are read
	 * off the mutation rather than passed alongside it, because a transaction
	 * spans collections and holds no configuration of its own.
	 */
	readonly collection: {
		readonly id: string;
		readonly config: {
			readonly onInsert?: unknown;
			readonly onUpdate?: unknown;
			readonly onDelete?: unknown;
		};
	};
}

/**
 * The part of a `PendingMutation` a request is built from.
 *
 * Structural rather than the library's own type, for the reason recorded through
 * this package: naming the full generic drags a collection's type parameters
 * into positions where they defeat the schema overload's inference. It also
 * means a test can describe a mutation without constructing a live collection.
 */
export interface PendingWrite<TRow extends object> extends WriteTarget {
	readonly modified: TRow;
	readonly changes: Partial<TRow>;
	readonly key: unknown;
	readonly metadata: unknown;
}

/** The handler whose absence means the client declared this write unavailable. */
const handlerFor = {
	insert: 'onInsert',
	update: 'onUpdate',
	delete: 'onDelete',
} as const;

/**
 * Refuse a write to a collection the client declared read-only.
 *
 * TanStack DB makes this check itself — and then skips it. Its guard reads
 * `!ambientTransaction && !config.onInsert`, so a collection with no handlers
 * throws when written to directly and accepts the same write inside a
 * `createTransaction`, where the transaction's own `mutationFn` becomes
 * responsible and the handlers are never consulted. This restores the rule for
 * the path that steps over it.
 *
 * Reading the handler rather than a flag we carry separately keeps one source of
 * truth: `mutations: false` *is* the absence of these three, so there is nothing
 * that can disagree. It also gives the check per-operation granularity for free.
 *
 * Not authorization. The server decides whether a Profile's role may write this
 * table and refuses what it does not permit. What this prevents is narrower and
 * still worth preventing: a write an app declared it does not make, applied
 * optimistically and then rolled back when the server says no — which the user
 * sees as a record that changes and changes back.
 */
export function refuseIfReadOnly(mutation: WriteTarget): void {
	const handler = handlerFor[mutation.type];
	const table = mutation.collection.id;

	if (mutation.collection.config[handler] === undefined) {
		throw new Error(
			`This client cannot ${mutation.type} ${table}: the collection was created with mutations disabled.`,
		);
	}
}

/**
 * Columns the server owns, on every table.
 *
 * Stripped from outgoing bodies not because sending them would be *rejected* —
 * the endpoints read the fields they want and ignore the rest — but because the
 * server overwrites them regardless, so a client value for any of them is noise
 * that reads as an intention.
 *
 * It also keeps a no-op detectable. An edit form stamps `updated_at` and
 * `updated_by_profile_id` on every save so the optimistic row looks right, which
 * means an unmodified record still produces a non-empty diff. Without this, an
 * edit that changed nothing would still become a request, and the server would
 * refuse it for asking for nothing.
 *
 * The same set for all 55 tables — the tenant, the trigger-maintained centroid,
 * and the four audit columns — so it is a fact about how SIMMER writes rather
 * than knowledge about any one table.
 */
const serverOwnedColumns: ReadonlySet<string> = new Set([
	'organization_id',
	'lat',
	'lng',
	'geom_type',
	'created_at',
	'updated_at',
	'created_by_profile_id',
	'updated_by_profile_id',
]);

function withoutServerOwnedColumns(source: object): CommandBody {
	const body: CommandBody = {};

	for (const [key, value] of Object.entries(source)) {
		if (!serverOwnedColumns.has(key)) {
			body[key] = value;
		}
	}

	return body;
}

/**
 * A body built from a row rather than from a mutation.
 *
 * `commandRequestFor` builds a single-row write's body out of what the library
 * diffed for it. A transaction has no such mutation to read — it states its own
 * body, because only the caller knows how a parent and its children fit into one
 * command — but the rules about what may be in one do not change: the server
 * still owns the tenant, the centroid and the four audit columns, and the
 * instructions still ride at the top level where the endpoints read them.
 *
 * Restating those in each hook is how one of them ends up sending
 * `organization_id`, or spelling `acknowledgements` as a nested object the
 * endpoint never looks in.
 */
export function commandBodyFromRow(
	row: object,
	instructions: {
		readonly locationSource?: unknown;
		readonly context?: unknown;
		readonly acknowledgements?: Readonly<Record<string, boolean>>;
	} = {},
): CommandBody {
	return {
		...withoutServerOwnedColumns(row),
		// Absent rather than present-and-undefined, as everywhere else: a
		// `locationSource: undefined` reads as an instruction to clear the geometry,
		// and an absent context leaves an attachment alone where `{ kind: 'none' }`
		// detaches it.
		...(instructions.locationSource === undefined
			? {}
			: { locationSource: instructions.locationSource }),
		...(instructions.context === undefined ? {} : { context: instructions.context }),
		// Flattened, because that is where the endpoints read them.
		...instructions.acknowledgements,
	};
}

/**
 * The request one mutation becomes, or `null` when it asks for nothing.
 *
 * A `null` is only ever an update whose changed fields were all server-owned.
 * Inserts and deletes always mean something.
 *
 * The route is derived from the collection rather than passed in, so a caller
 * holding mutations from several collections — which is what a transaction
 * holds — does not have to carry a map of endpoints alongside them.
 */
export function commandRequestFor<TRow extends object>(
	mutation: PendingWrite<TRow>,
	serverUrl: string,
): CommandRequest | null {
	const table = mutation.collection.id;
	refuseIfReadOnly(mutation);

	const endpoint = `${serverUrl}${commandPathFor(table)}`;
	const intents = requireIntents(mutation.metadata, table);

	if (mutation.type === 'delete') {
		// A delete has no payload of its own beyond the command it means and the
		// refusals it answers — a cascade the caller has agreed to is the whole
		// reason a delete carries a body at all.
		return {
			method: 'DELETE',
			url: `${endpoint}/${String(mutation.key)}`,
			body: { ...acknowledgementFields(mutation.metadata), intents },
		};
	}

	if (mutation.type === 'insert') {
		return {
			method: 'POST',
			url: endpoint,
			body: {
				...withoutServerOwnedColumns(mutation.modified),
				...locationSourceFields(mutation.metadata),
				...contextFields(mutation.metadata),
				...argumentFields(mutation.metadata),
				...acknowledgementFields(mutation.metadata),
				intents,
			},
		};
	}

	// A re-drawn shape is a change even when no column moved, so the location
	// instruction is folded in before the emptiness check — and the context with
	// it, for the same reason: re-attaching a record to a different Habitat is an
	// edit the server derives the columns from, not one it reads them from. The
	// intents are not: naming the commands does not give the endpoint anything to
	// write, so an otherwise empty patch stays empty.
	const body = {
		...withoutServerOwnedColumns(mutation.changes),
		...locationSourceFields(mutation.metadata),
		...contextFields(mutation.metadata),
		// Before the emptiness check, with the location and the context rather than
		// with the acknowledgements: an argument is content the server writes, so a
		// patch carrying one is not an empty patch. Reopening a Mission would
		// otherwise be a request the reason could not reach.
		...argumentFields(mutation.metadata),
	};

	if (Object.keys(body).length === 0) {
		return null;
	}

	// Folded in after the check, with the intents: answering a refusal says this
	// attempt may proceed, not that anything more should change. A patch that
	// carried nothing but acknowledgements would be asking the server to write
	// nothing, which is the empty request the check exists to suppress.
	return {
		method: 'PATCH',
		url: `${endpoint}/${String(mutation.key)}`,
		body: { ...body, ...acknowledgementFields(mutation.metadata), intents },
	};
}
