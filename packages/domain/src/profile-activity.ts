/**
 * The vocabulary of one Profile's field work: what kinds of record count as
 * activity, which part of the program each belongs to, and how a person was
 * involved in it.
 *
 * This lives in the domain rather than beside the query that produces it
 * because two layers have to agree on it: the reader that assembles the log and
 * the surface that renders it. `packages/db` imports these four lists and
 * `apps/web` reads them off the same declaration, so there is nothing to pin.
 *
 * Nothing here describes a *command*. Activity is a read: it is assembled from
 * columns that other commands already wrote, and no command writes an "activity".
 */

/**
 * The nine record kinds that can place a person somewhere.
 *
 * `samples` is deliberately absent: it carries no attribution column and no
 * geometry of its own, inheriting both from the inspection that is already
 * plotted.
 */
export const ACTIVITY_CATEGORIES = [
	'habitat',
	'inspection',
	'trap',
	'collection',
	'application',
	'sourceReduction',
	'biocontrol',
	'outreach',
	'serviceRequest',
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** The four operational families the nine categories group into. */
export const ACTIVITY_FAMILIES = ['larval', 'adult', 'control', 'publicEngagement'] as const;

export type ActivityFamily = (typeof ACTIVITY_FAMILIES)[number];

/**
 * Whether the Profile is named on the record itself, or was recorded as
 * assisting on it via `additional_personnel`.
 */
export const ACTIVITY_INVOLVEMENTS = ['primary', 'assisting'] as const;

export type ActivityInvolvement = (typeof ACTIVITY_INVOLVEMENTS)[number];

/**
 * What the Profile did to the record.
 *
 * `created` is the one to read carefully. Habitats and traps carry no domain
 * attribution column, so creating the site record is the only signal there is,
 * and it means "recorded this site", not "stood here". The other seven verbs
 * name field work.
 */
export const ACTIVITY_ROLES = [
	'created',
	'inspected',
	'set',
	'collected',
	'applied',
	'reduced',
	'released',
	'engaged',
	'received',
	'closed',
	'assisted',
] as const;

export type ActivityRole = (typeof ACTIVITY_ROLES)[number];
