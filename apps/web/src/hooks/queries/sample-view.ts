/**
 * What a Sample looks like above the query layer.
 *
 * Not a hook, so not a `use-` file.
 *
 * ## A Sample is only ever read with its Inspection
 *
 * A Sample is a jar of water. Where it was taken, when, and from which Habitat
 * are all facts about the Habitat Inspection that produced it — the Sample table
 * carries none of them. So every surface that shows a Sample immediately reads its
 * Inspection, and then the Inspection's Habitat, and the shape below is what that
 * costs when it is asked for once instead of three times.
 *
 * The identifications are a second shape rather than a field on this one. A Sample
 * has many, they arrive later than the Sample does (that is what "awaiting
 * identification" means), and a query returns rows — so they are their own hook.
 */

import type { LinkedAddress } from './address-view';

/** Where a Sample is in its life: what the badge on every Sample surface reads. */
export type SampleStatus = 'identified' | 'awaiting' | 'zero_larvae' | 'unidentifiable';

export interface Sample {
	readonly id: string;
	/**
	 * The parent Inspection's Address, joined rather than looked up.
	 *
	 * A Sample links no Address of its own, for the reason it carries no
	 * geometry: both are facts about the Inspection that produced it. It is the
	 * rung between the Habitat name and the coordinates on every surface that
	 * titles a Sample by where it was taken. `address-view.ts` says why it is
	 * nested here.
	 */
	readonly address: LinkedAddress;
	/**
	 * The organization's own name for the jar, or `null` when it named none.
	 *
	 * The one name in this folder that is nullable for the record's own sake.
	 * Everywhere else the query resolves the fallback so no call site has to: a
	 * Habitat with no name reads out its coordinates, through `habitatNameSelect`
	 * in `habitat-view.ts`. A Sample's fallback is a short id, and the expression
	 * language has no substring to take one with, so it stays where it can be
	 * written.
	 */
	readonly name: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;

	readonly inspectionId: string;
	/** `null` while the parent Inspection is still arriving. */
	readonly inspectionDate: string | null;

	readonly habitatId: string | null;
	/**
	 * The Habitat's name, or its coordinates when it has none. `null` when the
	 * parent Inspection was one-off and so has no Habitat to name, and `null`
	 * while the Habitat's row is still arriving, which `habitatId` tells apart:
	 * it is set in the second case, and `habitatLabel` names the row by it.
	 * `habitat-view.ts` carries the rule.
	 */
	readonly habitatName: string | null;

	/**
	 * The parent Inspection's centroid — a Sample has no geometry of its own, and
	 * this is what places one taken at no Habitat. Nullable, unlike the Inspection's
	 * own centroid, because the join can be waiting.
	 */
	readonly latitude: number | null;
	readonly longitude: number | null;
	readonly geometryKind: string | null;
}

/** One species identified in a Sample, with the count found and the name to show. */
export interface SampleIdentification {
	readonly speciesId: string;
	readonly speciesName: string;
	readonly larvaeCount: number;
	readonly identifiedAt: string;
}
