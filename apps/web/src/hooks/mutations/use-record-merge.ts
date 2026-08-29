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
 * It is a multi-row command: every retired record is a row that changes, so it
 * goes through `commandTransaction` rather than `mutateCollection`, and the
 * optimistic delete of the sources is what takes them off the screen the moment
 * the button is pressed.
 */

import { CommandError, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { addresses } from '../../lib/collections/addresses';
import { contacts } from '../../lib/collections/contacts';
import { habitats } from '../../lib/collections/habitats';
import { commandTransaction } from '../../lib/collections/transact';
import type { MergeableRecordType } from '../use-merge-candidates';

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
} as const;

/**
 * The collection each merge retires rows from.
 *
 * Read here rather than passed in: a merge that optimistically deleted from the
 * wrong collection would take unrelated records off the screen and put them back
 * when the write settled.
 */
const MERGE_COLLECTIONS = {
	address: addresses,
	habitat: habitats,
	contact: contacts,
} as const;

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
	readonly intent: (typeof MERGE_COMMANDS)[MergeableRecordType]['intent'];
	readonly request: {
		readonly table: string;
		readonly method: 'PATCH';
		readonly key: string;
		readonly body: Record<string, unknown>;
	};
} {
	const command = MERGE_COMMANDS[recordType];
	return {
		intent: command.intent,
		request: {
			table: command.table,
			method: 'PATCH',
			// The record that stays. Everything else is retired.
			key: plan.targetId,
			body: {
				[command.sourceKey]: [...plan.sourceIds],
				[command.acknowledgementKey]: plan.acknowledged,
			},
		},
	};
}

export function useRecordMerge(recordType: MergeableRecordType) {
	return useCallback(
		async (plan: RecordMergePlan): Promise<void> => {
			const collection = MERGE_COLLECTIONS[recordType];

			await settleWrite(
				commandTransaction({
					...recordMergeRequest(recordType, plan),
					apply: () => {
						for (const sourceId of plan.sourceIds) {
							collection.delete(sourceId);
						}
					},
				}),
			);
		},
		[recordType],
	);
}
