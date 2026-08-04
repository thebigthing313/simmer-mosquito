import type { TallyEntry, TallyVariant } from './use-key-entry-tally';

/** A species-count row as it stood when the modal opened. */
export interface CommitBaseline {
	readonly rowId: string;
	readonly count: number;
}

export type CommitStep =
	| { readonly kind: 'update'; readonly rowId: string; readonly count: number }
	| {
			readonly kind: 'insert';
			readonly entryKey: string;
			readonly speciesId: string;
			readonly variant: TallyVariant;
			readonly count: number;
	  }
	| { readonly kind: 'delete'; readonly rowId: string; readonly entryKey: string };

export interface CommitPlanInput {
	/** The current session tally. */
	readonly entries: readonly TallyEntry[];
	/** Stored counts captured when the modal opened, keyed by entry key. */
	readonly baseline: ReadonlyMap<string, CommitBaseline>;
	/** Rows this session has already inserted, keyed by entry key. */
	readonly inserted: ReadonlyMap<string, string>;
	/** Entry keys a previous flush wrote, so retractions can be reconciled. */
	readonly flushed: ReadonlySet<string>;
}

/**
 * Turn a session tally into the writes that make storage match it.
 *
 * Every step sets an absolute target (`baseline + tally`) rather than applying an
 * increment, which is what makes auto-save safe: the same tally can be flushed any
 * number of times and the stored count lands in the same place. Lines retracted since
 * the last flush are walked back — a row this session created is deleted, and a row
 * that already existed returns to the count it held when the modal opened.
 */
export function planCommit(input: CommitPlanInput): readonly CommitStep[] {
	const steps: CommitStep[] = [];

	for (const entry of input.entries) {
		const baseline = input.baseline.get(entry.entryKey);
		const target = (baseline?.count ?? 0) + entry.count;

		if (baseline !== undefined) {
			steps.push({ kind: 'update', rowId: baseline.rowId, count: target });
			continue;
		}

		const insertedRowId = input.inserted.get(entry.entryKey);
		if (insertedRowId !== undefined) {
			steps.push({ kind: 'update', rowId: insertedRowId, count: target });
			continue;
		}

		steps.push({
			kind: 'insert',
			entryKey: entry.entryKey,
			speciesId: entry.speciesId,
			variant: entry.variant,
			count: target,
		});
	}

	const current = new Set(input.entries.map((entry) => entry.entryKey));
	for (const entryKey of input.flushed) {
		if (current.has(entryKey)) {
			continue;
		}
		const insertedRowId = input.inserted.get(entryKey);
		if (insertedRowId !== undefined) {
			steps.push({ kind: 'delete', rowId: insertedRowId, entryKey });
			continue;
		}
		const baseline = input.baseline.get(entryKey);
		if (baseline !== undefined) {
			steps.push({ kind: 'update', rowId: baseline.rowId, count: baseline.count });
		}
	}

	return steps;
}

/** The entry keys a plan leaves written, to carry into the next flush. */
export function flushedKeysAfter(entries: readonly TallyEntry[]): ReadonlySet<string> {
	return new Set(entries.map((entry) => entry.entryKey));
}
