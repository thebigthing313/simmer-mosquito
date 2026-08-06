import { CLOCK_SKEW_TOLERANCE_MS } from '@simmer-mosquito/domain';

/**
 * Whether a device-stamped progress time sits before the work it belongs to
 * began.
 *
 * Both `docs/field-work-support-domain.md` and `docs/mission-dispatch-domain.md`
 * require progress timestamps to be on or after the parent's `started_at`, and
 * it is one rule rather than two: the two values come from different clocks on
 * both sides. `started_at` is stamped by the server (`now()` when the command
 * omits it) and the progress time comes from the device that finished the stop.
 * Compared strictly, a phone a minute slow would have genuinely-completed work
 * refused for happening "before" the assignment or mission it was plainly part
 * of — the same failure `CLOCK_SKEW_TOLERANCE_MS` was added to prevent from the
 * other direction, which is why it is the same allowance here rather than a
 * second number to keep in step.
 *
 * Answers false when either side is unknown. A null progress time means the
 * server is about to stamp it, and a null `started_at` means there is nothing to
 * be before — the callers refuse that case first, as `assignment_not_started` /
 * `mission_not_started`, or are on an auto-start path where the start is being
 * stamped by the very command under validation.
 */
export function isProgressBeforeStart(progressAt: Date | null, startedAt: Date | null): boolean {
	if (progressAt === null || startedAt === null) {
		return false;
	}
	return progressAt.getTime() < startedAt.getTime() - CLOCK_SKEW_TOLERANCE_MS;
}

/**
 * The clocks a progress command is judged against.
 *
 * `reopen` and `unskip` clear a timestamp rather than setting one, so they pass
 * `progressAt: null` and the comparison does not apply to them.
 */
export interface ProgressTiming {
	readonly progressAt: Date | null;
	readonly startedAt: Date | null;
}
