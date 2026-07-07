import { z } from 'zod';

// Shared URL search-param contract for the samples explorer. Lives outside the
// route module so overview panels can build type-safe deep links into the
// explorer with a preset filter state, and the route can validate incoming
// params from the same schema. Every field is optional + `.catch`-guarded so a
// malformed or hand-edited URL degrades to the explorer's own defaults instead
// of erroring.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.');
const uuid = z
	.string()
	.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Expected a UUID.');

/** Sample lifecycle states the explorer can filter to; mirrors the server enum. */
export const sampleStatusValues = [
	'identified',
	'awaiting',
	'zero_larvae',
	'unidentifiable',
] as const;

export const samplesSearchSchema = z.object({
	/** Inclusive start of the parent-inspection date window (`YYYY-MM-DD`). */
	from: isoDate.optional().catch(undefined),
	/** Inclusive end of the parent-inspection date window (`YYYY-MM-DD`). */
	to: isoDate.optional().catch(undefined),
	/** Lifecycle status to restrict to; omitted means all. */
	status: z.enum(sampleStatusValues).optional().catch(undefined),
	/** Species ids the sample must have an identified result for; omitted means all. */
	species: z.array(uuid).optional().catch(undefined),
	/** Restrict to samples flagged with non-mosquito material. */
	nonMosquito: z.boolean().optional().catch(undefined),
});

export type SamplesSearch = z.infer<typeof samplesSearchSchema>;
