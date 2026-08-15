/**
 * Writing to a collection, with the command named in the call.
 *
 * `collection.insert()` takes its metadata as a loose `Record<string, unknown>`,
 * so the one thing every SIMMER write must carry — the command it means — is a
 * key nothing checks and nothing requires. `requireIntent` catches an omission,
 * but only once the write is already in flight. This is the same rule expressed
 * where it can be enforced instead: as an argument.
 *
 * ## Why the vocabulary arrives through a factory
 *
 * `packages/sync` has no dependency on `packages/domain` and must not acquire
 * one — a transport that knew the command vocabulary would be a second place the
 * domain is written down. So the vocabulary comes in as a type argument, and the
 * frontends, which depend on both, are where the two meet.
 *
 * It has to be a factory rather than a partially-applied generic. A single
 * function taking both the intent union and the row type could only be bound as
 * `mutateCollection<DomainCommandType>`, and TypeScript rejects a partial type
 * argument list — the row type cannot be left to inference while the intent type
 * is supplied. Currying separates them: the intent union is fixed once, the row
 * type is still inferred per call.
 *
 * ```ts
 * // apps/web/src/sync/mutate.ts
 * import type { DomainCommandType } from '@simmer-mosquito/domain'
 * import { createCollectionMutator } from '@simmer-mosquito/sync'
 *
 * export const mutateCollection = createCollectionMutator<SingleRowCommandType>()
 * ```
 *
 * `SingleRowCommandType` is what keeps a command out of this call when one row
 * cannot describe it. Setting a trap collection from a stop writes the Collection
 * *and* closes the Assignment Item that produced it, and on a run page the user
 * is looking at both — so naming it here would leave the stop showing as open
 * after they closed it. The exclusion makes that a compile error rather than a
 * half-drawn screen nobody notices.
 *
 * It is deliberately a short list. A cascading delete is not on it: deleting a
 * Habitat writes four tables server-side, but the client removes one row, and the
 * Comments and detached Habitat Inspections it never had loaded arrive over sync.
 * See `MultiRowCommandType` for why the two are different questions.
 *
 * ## Why the operation is stated rather than inferred
 *
 * A single entry point could work out insert from update by looking at which
 * fields the argument carries. That is exactly the inference being removed from
 * the server, where the presence of a key decides which command fires, and it
 * fails the same way: an argument that happens to carry a `key` becomes an
 * update nobody asked for. The discriminant costs one word at the call site and
 * removes the guess.
 */

/**
 * The subset of a collection this needs.
 *
 * Structural rather than `Collection<TRow, …>` for the reason recorded in
 * `mutation-handlers.ts`: naming the full type drags its generics through
 * positions where they defeat the schema overload's inference. It also keeps the
 * wrapper testable without constructing a real Electric-backed collection.
 */
export interface MutableCollection<TRow extends object> {
	readonly insert: (row: TRow, config?: MutationConfig) => MutationTransaction;
	readonly update: (
		key: string,
		config: MutationConfig,
		draft: (row: TRow) => void,
	) => MutationTransaction;
	readonly delete: (key: string, config?: MutationConfig) => MutationTransaction;
}

/** The side channel a write travels with — see `mutation-metadata.ts`. */
export interface MutationConfig {
	readonly metadata?: Record<string, unknown>;
}

/** What a caller awaits to know the server accepted the write. */
export interface MutationTransaction {
	readonly isPersisted: { readonly promise: Promise<unknown> };
}

/**
 * The command a write means, or the commands it means.
 *
 * One name for the ordinary case; a list where one save is genuinely more than
 * one command against the same row. Renaming a Habitat and redrawing its
 * geometry is `updateHabitatDetails` and `updateHabitatLocation` — one row, one
 * save, two commands.
 *
 * Writing it twice instead does not work. TanStack DB merges two updates to one
 * key into a single mutation, and while the changed fields union, `metadata` is
 * replaced whole on last write. The second command's name would arrive carrying
 * the first command's fields, and the server would drop them without an error.
 * See `requireIntents`.
 */
export type MutationIntent<TIntent extends string> = TIntent | readonly TIntent[];

/**
 * A write, named.
 *
 * `locationSource` is an instruction rather than a geometry — `{ kind:
 * 'geometry', geometry }` for a shape the user drew, or a kind naming a row to
 * copy one from. It rides here rather than on the row because `geom` never
 * syncs, so there is no column for it to travel in.
 */
export type CollectionMutation<TRow extends object, TIntent extends string> =
	| {
			readonly operation: 'insert';
			readonly intent: MutationIntent<TIntent>;
			readonly row: TRow;
			readonly locationSource?: unknown;
	  }
	| {
			readonly operation: 'update';
			readonly intent: MutationIntent<TIntent>;
			readonly key: string;
			/**
			 * The fields to change. Applied to the collection's draft, so the library
			 * computes the diff and only what genuinely differs is sent.
			 *
			 * Shared by every named command rather than split between them. Each
			 * server-side builder already reads the fields it takes and ignores the
			 * rest, and a command named with nothing to change is refused by the
			 * domain — so a form that names a command it has no fields for fails
			 * loudly rather than writing something nobody asked for.
			 */
			readonly changes: Partial<TRow>;
			readonly locationSource?: unknown;
	  }
	| {
			readonly operation: 'delete';
			readonly intent: MutationIntent<TIntent>;
			readonly key: string;
	  };

/**
 * Apply one mutation to one collection.
 *
 * Returns the transaction, so a caller that needs to know the write landed can
 * await `isPersisted.promise` and a caller that does not can ignore it.
 *
 * One row, deliberately — but not one command. Several commands against the same
 * row belong here, as a list, because the server commits them in one transaction
 * and returns one txid.
 *
 * What does not belong here is several commands against *different* rows —
 * recording an inspection with its samples and species counts. Those have
 * different keys, so the library merges nothing and there is nothing for a list
 * to say. They need `createTransaction` grouping the optimistic mutations, which
 * is a different shape from this and should not be squeezed into it.
 */
export function createCollectionMutator<TIntent extends string>() {
	return function mutateCollection<TRow extends object>(
		collection: MutableCollection<TRow>,
		mutation: CollectionMutation<TRow, TIntent>,
	): MutationTransaction {
		// Normalized at the door so everything downstream — the request builder, the
		// server, the tests — sees one shape. The single name is sugar for a list of
		// one, not a second case to handle.
		const metadata: Record<string, unknown> = {
			intents: typeof mutation.intent === 'string' ? [mutation.intent] : [...mutation.intent],
		};

		if (mutation.operation === 'delete') {
			return collection.delete(mutation.key, { metadata });
		}

		// Absent rather than present-and-undefined: the handlers spread the location
		// instruction into the body only when there is one, and a
		// `locationSource: undefined` would read as an instruction to clear geometry.
		if (mutation.locationSource !== undefined) {
			metadata.locationSource = mutation.locationSource;
		}

		if (mutation.operation === 'insert') {
			return collection.insert(mutation.row, { metadata });
		}

		const changes = mutation.changes;
		return collection.update(mutation.key, { metadata }, (draft) => {
			Object.assign(draft, changes);
		});
	};
}
