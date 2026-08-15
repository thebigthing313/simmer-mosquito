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
 * export const mutateCollection = createCollectionMutator<
 * 	Exclude<DomainCommandType, MultiTableCommandType>
 * >()
 * ```
 *
 * The `Exclude` is what keeps a cross-table command out of a single-collection
 * call. Recording an inspection writes the inspection, its samples and its
 * species counts; naming that command here would produce one optimistic row and
 * a server-side batch the client never accounted for. Excluding the multi-table
 * names makes that a compile error rather than a partial write nobody notices.
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

interface MutationConfig {
	readonly metadata?: Record<string, unknown>;
}

/** What a caller awaits to know the server accepted the write. */
export interface MutationTransaction {
	readonly isPersisted: { readonly promise: Promise<unknown> };
}

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
			readonly intent: TIntent;
			readonly row: TRow;
			readonly locationSource?: unknown;
	  }
	| {
			readonly operation: 'update';
			readonly intent: TIntent;
			readonly key: string;
			/**
			 * The fields to change. Applied to the collection's draft, so the library
			 * computes the diff and only what genuinely differs is sent.
			 */
			readonly changes: Partial<TRow>;
			readonly locationSource?: unknown;
	  }
	| {
			readonly operation: 'delete';
			readonly intent: TIntent;
			readonly key: string;
	  };

/**
 * Apply one mutation to one collection.
 *
 * Returns the transaction, so a caller that needs to know the write landed can
 * await `isPersisted.promise` and a caller that does not can ignore it.
 *
 * One collection, deliberately. A command that writes across tables — recording
 * an inspection with its samples and species counts — is a batch, and the
 * server already commits batches in one transaction returning one txid. What it
 * needs on this side is `createTransaction` grouping the optimistic mutations,
 * which is a different shape from this and should not be squeezed into it.
 */
export function createCollectionMutator<TIntent extends string>() {
	return function mutateCollection<TRow extends object>(
		collection: MutableCollection<TRow>,
		mutation: CollectionMutation<TRow, TIntent>,
	): MutationTransaction {
		const metadata: Record<string, unknown> = { intent: mutation.intent };

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
