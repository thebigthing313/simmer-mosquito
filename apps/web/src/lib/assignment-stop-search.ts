import { z } from 'zod';

/**
 * The stop a record form was opened from.
 *
 * A record created off an assignment stop closes that stop in the same
 * transaction, and the link is what lets the stop say afterwards what closed
 * it. The form carries the stop id from the run page to the write; nothing else
 * about the assignment travels with it, because nothing else is needed — the
 * server reads the stop's target and lifecycle for itself.
 *
 * `.catch(undefined)` throughout: a hand-edited or stale URL should open an
 * ordinary create form, not a broken one.
 */
export const assignmentStopSearchSchema = z.object({
	assignmentItemId: z.uuid().optional().catch(undefined),
	assignmentId: z.uuid().optional().catch(undefined),
});
