/**
 * Folding duplicate records into one survivor.
 *
 * One hook for the three merges, because the three commands are the same shape:
 * the record that stays is named in the path, the records being retired travel
 * in the body, and one acknowledgement covers the whole thing.
 *
 * ## The path id is the survivor
 *
 * There is no column for "records being folded into this one", so the asymmetry
 * lives entirely in which id goes where. Read backwards, the merge retires the
 * record the user was looking at and keeps a duplicate; no type, permission
 * check or server test at the seam notices, because both sides are ids of the
 * same table. {@link RecordMergePlan} is why the two are never two strings in a
 * row at a call site.
 *
 * ## The acknowledgement is this app's job alone
 *
 * `acknowledged()` in `apps/server/src/table-commands/shared.ts` is
 * `value !== false`, so an **absent** flag arrives confirmed. That convention is
 * deliberate and repo-wide. It means a form that forgets to send the flag has
 * silently agreed on the user's behalf to something with no undo, so this sends
 * it explicitly on every request and takes it as an argument rather than
 * defaulting it.
 *
 * ## Sent as a plain request, not through a collection
 *
 * It is a multi-row command, so `commandTransaction` is the usual door. That
 * door does not work here, and both of its failure modes are silent.
 *
 * A transaction's optimistic `apply` would be `collection.delete(sourceId)` on
 * `addresses`, `habitats` or `contacts`, all of which are on-demand. The cleanup
 * page reads its proposals over `/records/{type}/duplicates` and holds no live
 * query over any of those collections, so the source rows are not in local
 * state. `collection.delete` throws `DeleteKeyNotFoundError` for a key it does
 * not hold, and `transaction.mutate` runs `apply` synchronously, so the throw
 * escapes before the request is ever sent.
 *
 * Guarding the delete on the row being present is worse. `Transaction.commit`
 * returns early when `mutations.length === 0` and never calls its `mutationFn`,
 * so an `apply` that skipped every absent row would resolve as a success having
 * sent nothing at all.
 *
 * So the merge goes out as a plain command request, the way
 * `commitWeatherImport` does: a command whose result the client re-reads rather
 * than draws optimistically. There is nothing to draw optimistically here, and
 * the retired rows reach every surface that *is* watching them over Electric,
 * the same as any other write. The cleanup page refetches its proposals.
 *
 * The intent is still typed as a `MultiRowCommandType`, so a name the domain
 * does not define is a compile error rather than a 400.
 */

import type { MultiRowCommandType, SingleRowCommandType } from '@simmer-mosquito/domain';
import { CommandError, writeCommand } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { getServerUrl } from '../../auth';
import type { MergeableRecordType } from '../use-merge-candidates';

/**
 * Values carried onto the survivor as part of the merge.
 *
 * Built by `mergeFieldPlan` on the cleanup page, which is where the rule about
 * which value wins lives. The shape is here because the request is: these
 * columns travel in the same body as the merge and commit in the same
 * transaction, and splitting them into a second write is the failure this avoids
 * (the merge lands, the values do not, and the record they came from is already
 * retired).
 */
export interface MergeFieldUpdates {
	/** The commands that write these columns. Empty when nothing changes. */
	readonly intents: readonly SingleRowCommandType[];
	/** Keyed by Postgres column, which is what the command endpoint reads. */
	readonly values: Readonly<Record<string, string | null>>;
}

/**
 * A merge, stated so the survivor cannot be confused with the retired records.
 *
 * `targetId` is the one that stays.
 */
export interface RecordMergePlan {
	readonly targetId: string;
	readonly sourceIds: readonly string[];
	/**
	 * Whether the user has agreed. Sent as `false` until they have, because the
	 * server reads an absent flag as agreement.
	 */
	readonly acknowledged: boolean;
	/** Values kept from the retired records. Absent when the survivor keeps its own. */
	readonly fieldUpdates?: MergeFieldUpdates;
}

/** Why the server refused a merge. */
export type MergeRefusalReason = 'target_not_found' | 'source_not_found' | 'target_inactive';

/**
 * The refusal reason, or null for any other failure.
 *
 * The three mean different things to the person at the form: two of them say
 * the proposal is stale and the third says the survivor is retired, which is
 * something they can go and fix.
 */
export function mergeRefusalReason(error: unknown): MergeRefusalReason | null {
	if (!(error instanceof CommandError) || typeof error.body !== 'object' || error.body === null) {
		return null;
	}
	const body = error.body as { readonly error?: unknown; readonly reason?: unknown };
	if (body.error !== 'merge_refused') {
		return null;
	}
	return body.reason === 'target_not_found' ||
		body.reason === 'source_not_found' ||
		body.reason === 'target_inactive'
		? body.reason
		: null;
}

interface MergeCommand {
	/** Typed against the vocabulary, so a name the domain lacks fails to compile. */
	readonly intent: MultiRowCommandType;
	readonly table: string;
	readonly sourceKey: string;
	readonly acknowledgementKey: string;
}

/** Per record type: the command, the endpoint's table, and what it calls its sources. */
const MERGE_COMMANDS = {
	address: {
		intent: 'foundation.mergeAddresses',
		table: 'addresses',
		sourceKey: 'sourceAddressIds',
		acknowledgementKey: 'acknowledgedMergeConsolidatesHistory',
	},
	habitat: {
		intent: 'larvalSurveillance.mergeHabitats',
		table: 'habitats',
		sourceKey: 'sourceHabitatIds',
		acknowledgementKey: 'acknowledgedMergeConsolidatesHistory',
	},
	contact: {
		intent: 'publicEngagement.mergeContacts',
		table: 'contacts',
		sourceKey: 'sourceContactIds',
		// Its own flag rather than the shared one. The command predates the other
		// two and the server still reads this name.
		acknowledgementKey: 'acknowledgedContactMerge',
	},
} as const satisfies Record<MergeableRecordType, MergeCommand>;

/**
 * The command a merge is, as a value.
 *
 * Pure and exported for its test, because the one thing that can go wrong here
 * is invisible from the call site: the survivor and the retired records are ids
 * of the same table, so swapping them type-checks, passes the permission check
 * and commits. The assertion that `key` is the survivor and the body holds
 * everything else is the only place that mistake can be caught.
 */
export function recordMergeRequest(
	recordType: MergeableRecordType,
	plan: RecordMergePlan,
): {
	/**
	 * The commands this one request means, updates before the merge.
	 *
	 * `runCommands` commits them in the order they arrive. Either order writes the
	 * same rows, because the survivor is not one of the records a merge retires,
	 * but updating first is the order that reads the way the dialog does: keep
	 * these values, then fold the rest in.
	 */
	readonly intents: readonly (MultiRowCommandType | SingleRowCommandType)[];
	readonly request: {
		readonly table: string;
		readonly method: 'PATCH';
		readonly key: string;
		readonly body: Record<string, unknown>;
	};
} {
	const command = MERGE_COMMANDS[recordType];
	const updates = plan.fieldUpdates;
	return {
		intents: [...(updates?.intents ?? []), command.intent],
		request: {
			table: command.table,
			method: 'PATCH',
			// The record that stays. Everything else is retired.
			key: plan.targetId,
			body: {
				// Columns first, so a field named the same as a merge argument could
				// never displace one. Nothing shares a name today; the merge arguments
				// are camelCase and the columns are snake_case.
				...(updates?.values ?? {}),
				[command.sourceKey]: [...plan.sourceIds],
				[command.acknowledgementKey]: plan.acknowledged,
			},
		},
	};
}

export function useRecordMerge(recordType: MergeableRecordType) {
	return useCallback(
		async (plan: RecordMergePlan): Promise<void> => {
			const { intents, request } = recordMergeRequest(recordType, plan);
			await writeCommand(
				`${getServerUrl()}/commands/${request.table}/${request.key}`,
				request.method,
				{ ...request.body, intents },
				'Unable to merge these records.',
			);
		},
		[recordType],
	);
}
