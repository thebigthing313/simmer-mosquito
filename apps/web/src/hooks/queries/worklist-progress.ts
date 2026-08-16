/**
 * How far through its stops a worklist is.
 *
 * Shared by both kinds of worklist, because a mission and an assignment count
 * their stops the same way: the two had a field-for-field identical counts type
 * and an identical fold, and the only thing that differed was which table the
 * rows came from.
 *
 * Skipped counts as handled. A stop the crew passed over is not outstanding work
 * — it is a decision that was made — which is why "3 of 8 done" and the gate on
 * completing a worklist both read `handled` rather than `completed`.
 */

export interface WorklistProgress {
	readonly total: number;
	readonly completed: number;
	readonly skipped: number;
	readonly pending: number;
	/** Completed or skipped — the two ways a stop is done being worked. */
	readonly handled: number;
}

export const NO_STOPS: WorklistProgress = {
	total: 0,
	completed: 0,
	skipped: 0,
	pending: 0,
	handled: 0,
};

/**
 * The three tallies a query can produce, as the five a surface reads.
 *
 * `pending` and `handled` are derived here rather than aggregated because the
 * expression language has addition but no subtraction, and because deriving them
 * is what guarantees the five agree: `handled + pending` is `total` by
 * construction rather than by three aggregates happening to line up.
 */
export function worklistProgress(
	total: number,
	completed: number,
	skipped: number,
): WorklistProgress {
	const handled = completed + skipped;
	return { total, completed, skipped, pending: total - handled, handled };
}
