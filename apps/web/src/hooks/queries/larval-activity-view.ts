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
import { addressCardLabel } from '../../lib/address-format';
import { adhocLabel } from '../../lib/coordinate-label';
import { type LinkedAddress, resolveLinkedAddress } from './address-view';

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

/**
 * One Habitat Inspection on its own, for the map card.
 *
 * The activity row plus the two things a list does not need and a card does: the
 * kind of geometry that was recorded, so the location line can say whether this
 * was a point or a shape, and the linked Address, which titles an Ad Hoc
 * Inspection that has one.
 *
 * An extension rather than a second projection, because a card and a list row
 * showing the same inspection should not be able to disagree about it — the
 * density band, the life stages and the inspector are the same fields resolved
 * the same way.
 */
export interface InspectionCard extends LarvalActivityRow {
	readonly geometryKind: string;
	readonly addressId: string | null;
	/** Joined, not looked up — see `address-view.ts` for why it is nested here. */
	readonly address: LinkedAddress;
}

/**
 * One Habitat Inspection as a row of the inspections table.
 *
 * The activity row plus the two things the table shows and the day panels do
 * not: the dip count, which is the effort the density band is a rate over, and
 * the linked Address, which names an Ad Hoc Inspection made at a place the
 * address book already holds.
 */
export interface InspectionTableRow extends LarvalActivityRow {
	readonly dipCount: number | null;
	/** Joined, not looked up. `address-view.ts` says why it is nested here. */
	readonly address: LinkedAddress;
}

/**
 * What names an inspection: the Habitat, then the Address, then the centroid.
 *
 * An inspection has no name of its own, so it is identified by where it was
 * made. The Habitat is the usual answer, by name or by its own coordinates when
 * it has none, which is what `habitatName` already carries. An Ad Hoc Inspection
 * has no Habitat at all, and falls back to the Address it was linked to and then
 * to its own centroid, which is the only thing left that tells one ad-hoc row
 * from the next. "Ad-hoc inspection" named the category every such row already
 * belonged to.
 *
 * `address` is optional because the two day panels do not join one. They show a
 * day's work at Habitats, so they reach the ad-hoc branch only for a row that
 * has no Address to offer either.
 *
 * Not a compiled `select`: the coordinate fallback rounds to five places and the
 * address label drops its empty parts, and the expression language can do
 * neither.
 */
export function inspectionSiteLabel(row: LarvalActivityRow, address?: LinkedAddress): string {
	const linked = address === undefined ? undefined : resolveLinkedAddress(address);
	return (
		row.habitatName?.trim() ||
		addressCardLabel(linked)?.trim() ||
		adhocLabel(row.latitude, row.longitude)
	);
}

/**
 * The Habitat's type, or what to say instead.
 *
 * A row with a type id and no joined name is a Habitat pointing at a catalog
 * entry this client has not loaded, which is worth saying rather than showing
 * nothing. `null` means the Habitat names no type at all, and each surface says
 * that its own way.
 */
export function inspectionTypeLabel(row: LarvalActivityRow): string | null {
	if (row.habitatTypeId === null) {
		return null;
	}
	return row.typeName ?? 'Unknown type';
}
