/**
 * One Habitat Inspection, with the site it was made at already attached.
 *
 * Not a hook, so not a `use-` file: the two larval activity hooks return this, and
 * they differ only in which inspections they ask for.
 *
 * ## Why the site travels with the row
 *
 * A Habitat Inspection is shown with the name of the Habitat it inspected, and the
 * Habitat's name lives on another table. Reading the inspections first and then
 * looking their Habitats up is a waterfall: the second query cannot start until the
 * first has rendered, and it re-runs whenever the id set moves.
 *
 * A join is one query. The compiler makes the joined side lazy — it collects the
 * distinct join keys the inspections produce and asks the `habitats` collection for
 * exactly those rows, building the index it needs to do so. That is the same subset
 * the waterfall requested, minus the round trip through React, and it keeps up as
 * new inspections arrive rather than settling once.
 *
 * The joins are `left` because a Habitat Inspection need not have a Habitat: an
 * Ad Hoc Inspection is somewhere a crew found water, and it identifies itself by
 * its centroid instead.
 */

import type { Inspection } from '@simmer-mosquito/sync';
import type { LifeStageFlags } from '../../components/larval-display';

export interface LarvalActivityRow extends LifeStageFlags {
	readonly id: string;
	readonly inspectionDate: string;
	readonly inspectedByProfileId: string | null;
	/**
	 * The Profile that made the inspection, already resolved. `null` when nobody was
	 * recorded — which the panels group under "Unassigned" rather than treating as a
	 * missing name.
	 */
	readonly inspectedByName: string | null;
	readonly isWet: boolean;
	/**
	 * Taken from the row schema rather than from a hand-written union, so a
	 * migration that adds a band reaches this without anything being edited.
	 */
	readonly density: Inspection['density'];
	readonly larvaeCount: number | null;

	readonly habitatId: string | null;
	/**
	 * The Habitat's name, or its coordinates when it has none. `null` only for an
	 * Ad Hoc Inspection, which has no Habitat to name.
	 */
	readonly habitatName: string | null;
	readonly habitatTypeId: string | null;
	readonly typeName: string | null;

	/**
	 * The inspection's own centroid — what titles an Ad Hoc Inspection. Kept as
	 * numbers rather than formatted here: `formatCoordinates` rounds to five places
	 * and the query language has no `round`, so formatting stays where it already
	 * lives.
	 *
	 * Not nullable: the centroid is trigger-maintained on every row, which is what
	 * lets an Ad Hoc Inspection identify itself at all.
	 */
	readonly latitude: number;
	readonly longitude: number;
}
