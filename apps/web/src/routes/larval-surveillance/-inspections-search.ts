import { z } from 'zod';

// Shared URL search-param contract for the inspections explorer. Lives outside
// the route module so the overview panels can build type-safe deep links to the
// explorer with a preset filter state, and the route can validate incoming params
// from the same schema. Every field is optional + `.catch`-guarded so a malformed
// or hand-edited URL degrades to the explorer's own defaults instead of erroring.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.');
const uuid = z
	.string()
	.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Expected a UUID.');

export const inspectionDensityValues = ['none', 'light', 'medium', 'heavy', 'very_heavy'] as const;

export const inspectionsSearchSchema = z.object({
	/** Inclusive start of the inspection-date window (`YYYY-MM-DD`). */
	from: isoDate.optional().catch(undefined),
	/** Inclusive end of the inspection-date window (`YYYY-MM-DD`). */
	to: isoDate.optional().catch(undefined),
	/** Water-state filter; omitted means all. */
	water: z.enum(['all', 'wet', 'dry']).optional().catch(undefined),
	/** Larval densities to include; omitted means all. */
	density: z.array(z.enum(inspectionDensityValues)).optional().catch(undefined),
	/** Restrict to inspections where at least one life stage was found. */
	positive: z.boolean().optional().catch(undefined),
	/** Habitat-type ids to include; omitted means all. */
	types: z.array(uuid).optional().catch(undefined),
});

export type InspectionsSearch = z.infer<typeof inspectionsSearchSchema>;
