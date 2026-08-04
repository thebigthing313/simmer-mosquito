/**
 * Runs tasks strictly one at a time, in the order they were enqueued.
 *
 * Commits plan their writes from a snapshot of what is already stored, so two of
 * them running at once both plan against the same pre-write state and both decide
 * the same row still needs inserting — persisting it twice. Auto-save makes that
 * easy to hit: an idle flush and an explicit save can overlap, as can a slow flush
 * and the next one. Serializing means the later task always plans against the
 * earlier one's result.
 *
 * A failing task does not stall the queue — the next one still runs — and each
 * caller sees only its own outcome.
 */
export function createCommitQueue(): <T>(task: () => Promise<T>) => Promise<T> {
	let tail: Promise<unknown> = Promise.resolve();

	return <T>(task: () => Promise<T>): Promise<T> => {
		// Chain off the previous task's settlement, whichever way it went.
		const run = tail.then(task, task);
		tail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};
}
