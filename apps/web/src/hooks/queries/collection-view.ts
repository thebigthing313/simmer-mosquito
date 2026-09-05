/**
 * What an Adult Collection looks like above the query layer.
 *
 * Not a hook, so not a `use-` file: several hooks in this folder return this one.
 *
 * ## Two clocks, and why neither is resolved here
 *
 * A collection is dated one of two ways, per an organization setting:
 * `exact_timestamps` puts an instant in `collectedAt` and leaves
 * `collectionDate` null, while `collection_date_duration` puts a plain day in
 * `collectionDate` and always leaves `collectedAt` null. Which of the two a row
 * uses is `collectionTimingMode`, and reading only one of the columns empties a
 * whole surface for half the organizations — see the `collectionEffectiveDate`
 * note in `-adult-display.tsx`.
 *
 * Both columns ride up raw and the shared helper resolves them, because turning
 * the instant into a calendar day needs the organization's time zone. A zone is
 * an argument, not a column, so no compiled `select` can reach it: a projection
 * that took the UTC prefix would file a trap emptied at 10:30pm under the next
 * day, disagreeing with the server, which windows these rows in the
 * organization's zone.
 *
 * `collectedAt` is a `Date` and `collectionDate` a `YYYY-MM-DD` string, which is
 * how they are stored and what the shape streams. The helpers take both.
 */
import type { AdultCollectionTimingMode } from '@simmer-mosquito/domain';
import type { LinkedAddress } from './address-view';

export type { AdultCollectionTimingMode };

/**
 * An Adult Collection, as the surfaces that show one whole want it.
 *
 * The detail page, the explorer and the map card between them read every column,
 * so this carries every column. Narrower shapes get their own hooks.
 */
export interface AdultCollection {
	readonly id: string;
	readonly trapId: string | null;
	/**
	 * The id of the Trap row itself, `undefined` until it has streamed.
	 *
	 * `trapId` is the collection's own column and says whether there is a trap at
	 * all; this one says whether it has arrived. The two answer different questions
	 * and a title needs both — an ad-hoc collection is named for good, while one
	 * whose trap is still in flight is named in a moment.
	 */
	readonly resolvedTrapId: string | undefined;
	/**
	 * The two name columns of the Trap this came from, joined so a card can title
	 * itself without a second query. Compose them with `trapDisplayName`, and only
	 * once `resolvedTrapId` is set — before that they are `null` because the join
	 * has nothing to give, not because the trap is unnamed.
	 */
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly methodId: string;
	/** Never null — a collection must name a method. See `Trap.methodName`. */
	readonly methodName: string;
	readonly lureId: string | null;
	readonly lureName: string | null;
	readonly addressId: string | null;
	/** Joined, not looked up — see `address-view.ts` for why it is nested here. */
	readonly address: LinkedAddress;

	/** The instant the trap was emptied, or null. See the module comment. */
	readonly collectedAt: Date | null;
	/** The day it is filed under, `YYYY-MM-DD`, or null. See the module comment. */
	readonly collectionDate: string | null;
	readonly collectionTimingMode: AdultCollectionTimingMode;
	readonly collectedByProfileId: string | null;
	readonly startedAt: Date | null;
	readonly setByProfileId: string | null;
	readonly durationAmount: number | null;
	readonly durationUnitId: string | null;

	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;

	readonly latitude: number;
	readonly longitude: number;
	readonly geometryKind: string;
	readonly metadata: unknown;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
}

/** The two columns that between them date a collection. */
export interface CollectionDates {
	readonly collectedAt: Date | string | null;
	readonly collectionDate: string | null;
}

/**
 * What a collection sorts by — the stored value, not a calendar day.
 *
 * Ordering needs no zone: it needs a key that ranks the same way for everyone,
 * and the stored instant does that with finer resolution than the day it falls
 * on. Separate from `collectionEffectiveDate`, which answers "which day is this
 * filed under" — only that question needs the organization.
 *
 * ISO either way, so an instant and a plain day still rank against each other on
 * their shared `YYYY-MM-DD` prefix. Undated rows sort last.
 */
function collectionSortKey(collection: CollectionDates): string {
	const { collectedAt } = collection;
	if (collectedAt === null) {
		return collection.collectionDate ?? '';
	}
	return collectedAt instanceof Date ? collectedAt.toISOString() : collectedAt;
}

/**
 * Newest first.
 *
 * A JS sort rather than an `orderBy`, because the two timing modes date a
 * collection from different columns and no single ordering key covers both — one
 * is a `timestamptz`, the other a `date`, and a query cannot coalesce across
 * those types.
 */
export function compareByCollectionDateDesc(
	first: CollectionDates,
	second: CollectionDates,
): number {
	const firstKey = collectionSortKey(first);
	const secondKey = collectionSortKey(second);
	if (firstKey === secondKey) {
		return 0;
	}
	return firstKey > secondKey ? -1 : 1;
}
