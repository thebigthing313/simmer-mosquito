import { z } from 'zod';

/**
 * The mission stop a control-action form was opened from.
 *
 * The mission counterpart of [assignment-stop-search]: the action created here
 * closes that stop in the same transaction, and carries its id so the stop can
 * later say what closed it. Kept separate from the assignment version because
 * the two never appear on the same form — a control action belongs to a
 * mission, a surveillance record to an assignment — and one shared param would
 * invite a form to accept the wrong kind of stop.
 */
export const missionStopSearchSchema = z.object({
	missionItemId: z.uuid().optional().catch(undefined),
	missionId: z.uuid().optional().catch(undefined),
});
