import { describe, expect, it } from 'vitest';
import { type CommitBaseline, type CommitStep, planCommit } from './commit-plan';
import { createCommitQueue } from './commit-queue';
import {
	applyPress,
	applySetCount,
	applyUndo,
	EMPTY_TALLY_STATE,
	entryKeyFor,
	NO_VARIANT,
	type TallyEntry,
	type TallyState,
	tallyEntries,
} from './use-key-entry-tally';

const aegypti = 'species-aegypti';
const pipiens = 'species-pipiens';
const female = { sex: 'female', status: null };
const femaleBloodfed = { sex: 'female', status: 'bloodfed' };

function press(state: TallyState, speciesId: string, variant = NO_VARIANT, times = 1): TallyState {
	let next = state;
	for (let index = 0; index < times; index += 1) {
		next = applyPress(next, speciesId, variant);
	}
	return next;
}

function countFor(state: TallyState, speciesId: string, variant = NO_VARIANT): number {
	return state.counts.get(entryKeyFor(speciesId, variant))?.count ?? 0;
}

describe('tally presses', () => {
	it('accumulates repeated presses of the same species', () => {
		const state = press(EMPTY_TALLY_STATE, aegypti, NO_VARIANT, 3);

		expect(countFor(state, aegypti)).toBe(3);
		expect(tallyEntries(state)).toHaveLength(1);
	});

	it('keeps the same species on separate lines per sex and status', () => {
		let state = press(EMPTY_TALLY_STATE, aegypti, female, 2);
		state = press(state, aegypti, femaleBloodfed);

		expect(countFor(state, aegypti, female)).toBe(2);
		expect(countFor(state, aegypti, femaleBloodfed)).toBe(1);
		expect(tallyEntries(state)).toHaveLength(2);
	});

	it('lists the most recently touched line first', () => {
		let state = press(EMPTY_TALLY_STATE, aegypti);
		state = press(state, pipiens);

		expect(tallyEntries(state).map((entry) => entry.speciesId)).toEqual([pipiens, aegypti]);
	});
});

describe('tally undo', () => {
	it('retracts the last press, not the last line', () => {
		let state = press(EMPTY_TALLY_STATE, aegypti, NO_VARIANT, 2);
		state = press(state, pipiens);
		state = applyUndo(state);

		expect(countFor(state, pipiens)).toBe(0);
		expect(countFor(state, aegypti)).toBe(2);

		state = applyUndo(state);
		expect(countFor(state, aegypti)).toBe(1);
	});

	it('drops a line once its count reaches zero', () => {
		let state = press(EMPTY_TALLY_STATE, aegypti);
		state = applyUndo(state);

		expect(tallyEntries(state)).toHaveLength(0);
		expect(state.counts.size).toBe(0);
	});

	it('is a no-op on an empty tally', () => {
		expect(applyUndo(EMPTY_TALLY_STATE)).toBe(EMPTY_TALLY_STATE);
	});
});

describe('tally direct edits', () => {
	it('sets a line to an exact count and keeps undo consistent with it', () => {
		let state = press(EMPTY_TALLY_STATE, aegypti, NO_VARIANT, 5);
		state = applySetCount(state, entryKeyFor(aegypti, NO_VARIANT), 2);

		expect(countFor(state, aegypti)).toBe(2);
		expect(state.history).toHaveLength(2);

		state = applyUndo(state);
		expect(countFor(state, aegypti)).toBe(1);
	});

	it('removes a line when set to zero or below', () => {
		let state = press(EMPTY_TALLY_STATE, aegypti, NO_VARIANT, 2);
		state = applySetCount(state, entryKeyFor(aegypti, NO_VARIANT), -3);

		expect(tallyEntries(state)).toHaveLength(0);
		expect(state.history).toHaveLength(0);
	});
});

// --- commit queue ------------------------------------------------------------

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((resolveFn, rejectFn) => {
		resolve = resolveFn;
		reject = rejectFn;
	});
	return { promise, resolve, reject };
}

describe('commit queue', () => {
	// Regression: an idle auto-save flush and an explicit save could run at once, both
	// plan against the same pre-write state, and insert the same row twice.
	it('never runs two tasks at the same time', async () => {
		const enqueue = createCommitQueue();
		const first = deferred<void>();
		let running = 0;
		let maxConcurrent = 0;

		const track = async (body: Promise<void>) => {
			running += 1;
			maxConcurrent = Math.max(maxConcurrent, running);
			try {
				await body;
			} finally {
				running -= 1;
			}
		};

		const a = enqueue(() => track(first.promise));
		const b = enqueue(() => track(Promise.resolve()));

		first.resolve();
		await Promise.all([a, b]);

		expect(maxConcurrent).toBe(1);
	});

	it('runs tasks in the order they were enqueued', async () => {
		const enqueue = createCommitQueue();
		const order: string[] = [];
		const gate = deferred<void>();

		const a = enqueue(async () => {
			await gate.promise;
			order.push('a');
		});
		const b = enqueue(async () => {
			order.push('b');
		});

		gate.resolve();
		await Promise.all([a, b]);

		expect(order).toEqual(['a', 'b']);
	});

	it('keeps draining after a task fails, and reports each outcome to its caller', async () => {
		const enqueue = createCommitQueue();
		const failure = enqueue(() => Promise.reject(new Error('write rejected')));
		const recovery = enqueue(() => Promise.resolve('ok'));

		await expect(failure).rejects.toThrow('write rejected');
		await expect(recovery).resolves.toBe('ok');
	});
});

// --- commit planning ---------------------------------------------------------

function entry(speciesId: string, count: number, variant = NO_VARIANT): TallyEntry {
	return { entryKey: entryKeyFor(speciesId, variant), speciesId, variant, count };
}

const noBaseline: ReadonlyMap<string, CommitBaseline> = new Map();
const nothingInserted: ReadonlyMap<string, string> = new Map();
const nothingFlushed: ReadonlySet<string> = new Set();

describe('commit planning', () => {
	it('inserts a new row for a species with no stored count', () => {
		const steps = planCommit({
			entries: [entry(aegypti, 3)],
			baseline: noBaseline,
			inserted: nothingInserted,
			flushed: nothingFlushed,
		});

		expect(steps).toEqual<CommitStep[]>([
			{
				kind: 'insert',
				entryKey: entryKeyFor(aegypti, NO_VARIANT),
				speciesId: aegypti,
				variant: NO_VARIANT,
				count: 3,
			},
		]);
	});

	it('adds the tally on top of what was already stored', () => {
		const steps = planCommit({
			entries: [entry(aegypti, 3)],
			baseline: new Map([[entryKeyFor(aegypti, NO_VARIANT), { rowId: 'row-1', count: 10 }]]),
			inserted: nothingInserted,
			flushed: nothingFlushed,
		});

		expect(steps).toEqual<CommitStep[]>([{ kind: 'update', rowId: 'row-1', count: 13 }]);
	});

	it('is idempotent: flushing the same tally again writes the same target', () => {
		const input = {
			entries: [entry(aegypti, 3)],
			baseline: new Map([[entryKeyFor(aegypti, NO_VARIANT), { rowId: 'row-1', count: 10 }]]),
			inserted: nothingInserted,
			flushed: new Set([entryKeyFor(aegypti, NO_VARIANT)]),
		};

		expect(planCommit(input)).toEqual(planCommit(input));
		expect(planCommit(input)).toEqual<CommitStep[]>([
			{ kind: 'update', rowId: 'row-1', count: 13 },
		]);
	});

	it('updates rather than re-inserts a row this session already created', () => {
		const steps = planCommit({
			entries: [entry(aegypti, 5)],
			baseline: noBaseline,
			inserted: new Map([[entryKeyFor(aegypti, NO_VARIANT), 'row-new']]),
			flushed: new Set([entryKeyFor(aegypti, NO_VARIANT)]),
		});

		expect(steps).toEqual<CommitStep[]>([{ kind: 'update', rowId: 'row-new', count: 5 }]);
	});

	it('deletes a session-created row that was fully undone after a flush', () => {
		const entryKey = entryKeyFor(aegypti, NO_VARIANT);
		const steps = planCommit({
			entries: [],
			baseline: noBaseline,
			inserted: new Map([[entryKey, 'row-new']]),
			flushed: new Set([entryKey]),
		});

		expect(steps).toEqual<CommitStep[]>([{ kind: 'delete', rowId: 'row-new', entryKey }]);
	});

	it('restores a pre-existing row to its opening count when its tally is undone', () => {
		const entryKey = entryKeyFor(aegypti, NO_VARIANT);
		const steps = planCommit({
			entries: [],
			baseline: new Map([[entryKey, { rowId: 'row-1', count: 10 }]]),
			inserted: nothingInserted,
			flushed: new Set([entryKey]),
		});

		expect(steps).toEqual<CommitStep[]>([{ kind: 'update', rowId: 'row-1', count: 10 }]);
	});

	// Regression: an emptied tally reads as "nothing to do" but is the opposite —
	// every line written this session was retracted and must be walked back. Callers
	// must drive a commit on an empty tally, not skip it.
	it('still has work to do when the whole tally is undone after a flush', () => {
		const albopictus = entryKeyFor(aegypti, NO_VARIANT);
		const pipiensKey = entryKeyFor(pipiens, NO_VARIANT);

		const steps = planCommit({
			entries: [],
			baseline: new Map([[pipiensKey, { rowId: 'row-existing', count: 9 }]]),
			inserted: new Map([[albopictus, 'row-new']]),
			flushed: new Set([albopictus, pipiensKey]),
		});

		expect(steps).toHaveLength(2);
		expect(steps).toContainEqual<CommitStep>({
			kind: 'delete',
			rowId: 'row-new',
			entryKey: albopictus,
		});
		expect(steps).toContainEqual<CommitStep>({
			kind: 'update',
			rowId: 'row-existing',
			count: 9,
		});
	});

	it('leaves rows alone that this session never touched', () => {
		const steps = planCommit({
			entries: [entry(aegypti, 1)],
			baseline: new Map([
				[entryKeyFor(aegypti, NO_VARIANT), { rowId: 'row-1', count: 2 }],
				[entryKeyFor(pipiens, NO_VARIANT), { rowId: 'row-2', count: 7 }],
			]),
			inserted: nothingInserted,
			flushed: nothingFlushed,
		});

		expect(steps).toEqual<CommitStep[]>([{ kind: 'update', rowId: 'row-1', count: 3 }]);
	});

	it('keeps sex and status variants on separate rows', () => {
		const steps = planCommit({
			entries: [entry(aegypti, 2, female), entry(aegypti, 1, femaleBloodfed)],
			baseline: new Map([[entryKeyFor(aegypti, female), { rowId: 'row-f', count: 4 }]]),
			inserted: nothingInserted,
			flushed: nothingFlushed,
		});

		expect(steps).toEqual<CommitStep[]>([
			{ kind: 'update', rowId: 'row-f', count: 6 },
			{
				kind: 'insert',
				entryKey: entryKeyFor(aegypti, femaleBloodfed),
				speciesId: aegypti,
				variant: femaleBloodfed,
				count: 1,
			},
		]);
	});
});
