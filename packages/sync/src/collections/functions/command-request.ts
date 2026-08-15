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
 * So both paths build their requests here, and the handlers send them one at a
 * time.
 *
 * What a transaction sends is not settled. A command that writes several tables
 * is still one command with one payload, so it is probably one request rather
 * than one per mutation — in which case a transaction's mutations exist only so
 * the library can apply the change and take it back, and this builder is not what
 * produces its body. Resolve that when the transaction path is built; nothing
 * here assumes either answer.
 */

import { locationSourceFields, requireIntents } from './mutation-metadata.js';
import { commandPathFor } from './routes.js';

/** The body of a command: row fields named for their Postgres columns. */
export type CommandBody = Record<string, unknown>;

export interface CommandRequest {
	readonly method: 'POST' | 'PATCH' | 'DELETE';
	readonly url: string;
	readonly body: CommandBody;
}

/**
 * The part of a `PendingMutation` a request is built from.
 *
 * Structural rather than the library's own type, for the reason recorded through
 * this package: naming the full generic drags a collection's type parameters
 * into positions where they defeat the schema overload's inference. It also
 * means a test can describe a mutation without constructing a live collection.
 */
export interface PendingWrite<TRow extends object> {
	readonly type: 'insert' | 'update' | 'delete';
	readonly modified: TRow;
	readonly changes: Partial<TRow>;
	readonly key: unknown;
	readonly metadata: unknown;
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
function refuseIfReadOnly(mutation: PendingWrite<object>, table: string): void {
	const handler = handlerFor[mutation.type];

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
	refuseIfReadOnly(mutation, table);

	const endpoint = `${serverUrl}${commandPathFor(table)}`;
	const intents = requireIntents(mutation.metadata, table);

	if (mutation.type === 'delete') {
		// A delete has no payload of its own beyond the command it means. Which
		// acknowledgements that command demands is the server's to decide, and it
		// answers with them when it refuses.
		return { method: 'DELETE', url: `${endpoint}/${String(mutation.key)}`, body: { intents } };
	}

	if (mutation.type === 'insert') {
		return {
			method: 'POST',
			url: endpoint,
			body: {
				...withoutServerOwnedColumns(mutation.modified),
				...locationSourceFields(mutation.metadata),
				intents,
			},
		};
	}

	// A re-drawn shape is a change even when no column moved, so the location
	// instruction is folded in before the emptiness check. The intents are not:
	// naming the commands does not give the endpoint anything to write, so an
	// otherwise empty patch stays empty.
	const body = {
		...withoutServerOwnedColumns(mutation.changes),
		...locationSourceFields(mutation.metadata),
	};

	if (Object.keys(body).length === 0) {
		return null;
	}

	return {
		method: 'PATCH',
		url: `${endpoint}/${String(mutation.key)}`,
		body: { ...body, intents },
	};
}
