/**
 * The record kinds a merge can fold together.
 *
 * Mirrors `MergeableRecordType` in `@simmer-mosquito/db`. The web bundle does
 * not depend on the database package, so the union is restated here the way
 * `use-delete-impact.ts` restates the deletable one; both endpoints answer 404
 * for a name they do not recognize, which is what a drift between the two would
 * look like.
 *
 * It is a shorter list than the deletable types on purpose. Deleting asks what
 * blocks a record; merging asks what can be re-pointed onto another one, and
 * only these three have somewhere for their references to go.
 */
export type MergeableRecordType = 'address' | 'habitat' | 'contact';

/**
 * The record kinds a cleanup page lists proposals for.
 *
 * Shorter than the mergeable types. A duplicate habitat is a place a crew found
 * and named twice, so two records for it agree about nothing except where they
 * are; they are found from one habitat's own page, by looking around it, rather
 * than by scanning a list. `useNearbyHabitats` is that read.
 */
export type DuplicateRecordType = Exclude<MergeableRecordType, 'habitat'>;

/** Why the server put a set of records together. */
export type DuplicateReason =
	| 'same_name'
	| 'same_street'
	| 'same_email'
	| 'same_phone'
	| 'same_coordinates';

export interface DuplicateRecord {
	readonly id: string;
	/** The record's own name. Empty when it has none, which habitats often do. */
	readonly label: string;
	readonly detail: string | null;
	/**
	 * ISO, as JSON carries it — an instant, so the day it names is the
	 * Organization's, read through `lib/local-date`. `addedOn` is that read.
	 */
	readonly createdAt: string;
	readonly lat: number | null;
	readonly lng: number | null;
	/**
	 * The editable columns this record fills in, keyed by Postgres column name.
	 *
	 * What `merge-field-plan.ts` compares to work out where two records disagree,
	 * and what it sends back when the user keeps a value from a record the merge
	 * is about to retire. Blank arrives as null: the server normalizes it, because
	 * an empty string and a null are the same answer.
	 */
	readonly fields: Readonly<Record<string, string | null>>;
}

export interface DuplicateGroup {
	readonly key: string;
	readonly reason: DuplicateReason;
	/** The value the records share, normalized as it was compared. */
	readonly value: string | null;
	/** Oldest first, which is the survivor the page preselects. */
	readonly records: readonly DuplicateRecord[];
}

export function duplicateCandidatesQueryKey(recordType: DuplicateRecordType): readonly unknown[] {
	return ['duplicate-candidates', recordType];
}

/** A habitat standing near the one a merge would keep. */
export interface NearbyHabitat extends DuplicateRecord {
	/** Ground distance from the habitat being kept, in metres. */
	readonly distanceMetres: number;
	/** Whether it is still in service. Retired habitats are offered, and labelled. */
	readonly isActive: boolean;
}

export interface NearbyHabitats {
	/** The habitat being kept, read the same way as the candidates. */
	readonly target: DuplicateRecord;
	/** Nearest first. */
	readonly candidates: readonly NearbyHabitat[];
}

/**
 * Every cached search around one habitat, whatever radius it ran at.
 *
 * What a merge invalidates. The retired habitats are gone from the answer at
 * every width, and a page that only refreshed the radius currently on screen
 * would offer them again the moment somebody widened it.
 */
export function nearbyHabitatsKey(habitatId: string): readonly unknown[] {
	return ['nearby-habitats', habitatId];
}

/**
 * Keyed by the radius as a whole number of metres.
 *
 * The same rounding the request sends, so widening the search and narrowing it
 * again lands back on the cached answer rather than on a third key that differs
 * by a fraction of a metre nobody asked for.
 */
export function nearbyHabitatsQueryKey(
	habitatId: string,
	radiusMetres: number,
): readonly unknown[] {
	return [...nearbyHabitatsKey(habitatId), Math.round(radiusMetres)];
}
