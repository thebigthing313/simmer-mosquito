import type { SpeciesRow } from '@simmer-mosquito/sync';
import { eq, gte, or, toArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { localDayStartAsTimestamp } from '../../lib/local-date';
import { webCollections } from '../../sync/webCollections';

// Adult overview reads entirely from synced collections — there is no adult
// server read/aggregate endpoint (unlike larval's /samples/awaiting), and traps
// are an eager shape while collections / collection_species are on-demand
// (docs/sync.md). All hooks use the status-gated useLiveQuery, not the suspense
// variant, which hangs after a navigation unmount over on-demand collections.

// Pure date helpers are shared with the larval overview; re-exported here so the
// adult panels build day strips and windows from one implementation.
export {
	addDaysToDateString,
	formatDate,
	formatMonthDay,
	formatWeekdayMonthDay,
	todayInTimeZone,
} from '../larval-surveillance/-overview-data';

/** How far back the recent-window queries reach. */
export const ADULT_ACTIVITY_WINDOW_DAYS = 14;

const activityGcTimeMs = 30_000;

// --- projected query shapes -------------------------------------------------

export interface ActivityCollection {
	readonly id: string;
	readonly trapId: string | null;
	readonly addressId: string | null;
	readonly collectionMethodId: string;
	readonly collectedAt: string | null;
	readonly collectionDate: string | null;
	readonly collectedByProfileId: string | null;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
}

export interface SpeciesTotal {
	readonly speciesId: string;
	readonly name: string;
	readonly total: number;
}

export interface AwaitingCollection {
	readonly id: string;
	readonly trapId: string | null;
	readonly collectionMethodId: string;
	readonly collectedAt: string | null;
	readonly collectionDate: string | null;
}

interface LoadState {
	readonly isReady: boolean;
	readonly isError: boolean;
}

// --- recent collections -----------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: query-builder ref proxy has no exported type
function selectCollection({ collection }: any) {
	return {
		id: collection.id,
		trapId: collection.trapId,
		addressId: collection.addressId,
		collectionMethodId: collection.collectionMethodId,
		collectedAt: collection.collectedAt,
		collectionDate: collection.collectionDate,
		collectedByProfileId: collection.collectedByProfileId,
		hasProblem: collection.hasProblem,
		isZeroResult: collection.isZeroResult,
		hasBycatch: collection.hasBycatch,
	};
}

/**
 * The window predicate for collections, over both timing modes.
 *
 * `exact_timestamps` dates a collection by `collectedAt`, a `timestamptz`;
 * `collection_date_duration` leaves that null and dates it by `collectionDate`,
 * a plain date. Reading only `collectedAt` — as this did — emptied the whole
 * overview for any agency on the second mode. Each column is compared against a
 * bound in its own type: a bare `YYYY-MM-DD` against a `timestamptz` is not a
 * predicate Electric will parse ({@link localDayStartAsTimestamp}).
 *
 * A collection with neither date set is genuinely pending, and drops out of the
 * window on its own — a comparison against null is never true.
 */
// biome-ignore lint/suspicious/noExplicitAny: query-builder ref proxy has no exported type
function withinWindow(collection: any, sinceDate: string, sinceTimestamp: string) {
	return or(gte(collection.collectedAt, sinceTimestamp), gte(collection.collectionDate, sinceDate));
}

interface Dated {
	readonly collectedAt: string | null;
	readonly collectionDate: string | null;
}

/**
 * What a collection sorts by; the empty string for one carrying neither date.
 *
 * The same fallback `collectionEffectiveDate` applies, spelled out again rather
 * than imported: `-adult-display` reads its date formatters from this module, so
 * importing back from it would close an import cycle.
 */
function sortDate(row: Dated): string {
	return row.collectedAt ?? row.collectionDate ?? '';
}

/** Newest first, by whichever column dates the collection. */
function byDateDescending(first: Dated, second: Dated): number {
	const firstDate = sortDate(first);
	const secondDate = sortDate(second);
	if (firstDate === secondDate) {
		return 0;
	}
	return firstDate > secondDate ? -1 : 1;
}

/** Collections dated on or after `sinceDate` (a `YYYY-MM-DD`), newest first. */
export function useRecentCollections(sinceDate: string): {
	readonly collections: readonly ActivityCollection[];
} & LoadState {
	const sinceTimestamp = useMemo(() => localDayStartAsTimestamp(sinceDate), [sinceDate]);

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ collection: webCollections.collections })
					.where(({ collection }) => withinWindow(collection, sinceDate, sinceTimestamp))
					.select(selectCollection),
		},
		[sinceDate, sinceTimestamp],
	);

	// Sorted here rather than in the query: the two timing modes date a collection
	// from different columns, and no single `orderBy` orders both.
	const collections = useMemo(
		() =>
			[...((result.data ?? []) as unknown as readonly ActivityCollection[])].sort(byDateDescending),
		[result.data],
	);

	return {
		collections,
		isReady: result.isReady,
		isError: result.isError,
	};
}

// --- species composition ----------------------------------------------------

/**
 * Specimen totals by species over the given window (identified_date based),
 * sorted high to low. Species names resolve from the eager `species` catalog.
 */
export function useSpeciesComposition(sinceDate: string): {
	readonly totals: readonly SpeciesTotal[];
	readonly grandTotal: number;
} & LoadState {
	const { rows: species } = useCollectionRows<SpeciesRow>(webCollections.species);
	const nameById = useMemo(
		() => new Map(species.map((row) => [row.id, row.displayName] as const)),
		[species],
	);

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ collectionSpecies: webCollections.collectionSpecies })
					.where(({ collectionSpecies }) => gte(collectionSpecies.identifiedDate, sinceDate))
					.select(({ collectionSpecies }) => ({
						speciesId: collectionSpecies.speciesId,
						count: collectionSpecies.count,
					})),
		},
		[sinceDate],
	);

	const { totals, grandTotal } = useMemo(() => {
		const rows = (result.data ?? []) as readonly { speciesId: string; count: number }[];
		const byId = new Map<string, number>();
		let sum = 0;
		for (const row of rows) {
			const count = row.count ?? 0;
			if (count <= 0) {
				continue;
			}
			byId.set(row.speciesId, (byId.get(row.speciesId) ?? 0) + count);
			sum += count;
		}
		const ranked: SpeciesTotal[] = [...byId.entries()]
			.map(([speciesId, total]) => ({
				speciesId,
				total,
				name: nameById.get(speciesId) ?? 'Unknown species',
			}))
			.sort((first, second) => second.total - first.total);
		return { totals: ranked, grandTotal: sum };
	}, [result.data, nameById]);

	return { totals, grandTotal, isReady: result.isReady, isError: result.isError };
}

// --- awaiting identification -------------------------------------------------

/**
 * Recent collections that have been retrieved but not yet identified — dated (so
 * no longer pending), not flagged zero-result, and carrying no species counts.
 * Resolved with a nested `collection_species` include correlated on
 * `collection_id`, then filtered client-side to the empty-species set.
 */
export function useAwaitingIdentification(sinceDate: string): {
	readonly awaiting: readonly AwaitingCollection[];
} & LoadState {
	const sinceTimestamp = useMemo(() => localDayStartAsTimestamp(sinceDate), [sinceDate]);

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ collection: webCollections.collections })
					.where(({ collection }) => withinWindow(collection, sinceDate, sinceTimestamp))
					.select(({ collection }) => ({
						id: collection.id,
						trapId: collection.trapId,
						collectionMethodId: collection.collectionMethodId,
						collectedAt: collection.collectedAt,
						collectionDate: collection.collectionDate,
						isZeroResult: collection.isZeroResult,
						species: toArray(
							query
								.from({ collectionSpecies: webCollections.collectionSpecies })
								.where(({ collectionSpecies }) => eq(collectionSpecies.collectionId, collection.id))
								.select(({ collectionSpecies }) => ({ id: collectionSpecies.id })),
						),
					})),
		},
		[sinceDate, sinceTimestamp],
	);

	const awaiting = useMemo(() => {
		const rows = (result.data ?? []) as unknown as readonly (AwaitingCollection & {
			readonly isZeroResult: boolean;
			readonly species: readonly { readonly id: string }[];
		})[];
		return rows
			.filter((row) => !row.isZeroResult && row.species.length === 0)
			.map(({ id, trapId, collectionMethodId, collectedAt, collectionDate }) => ({
				id,
				trapId,
				collectionMethodId,
				collectedAt,
				collectionDate,
			}))
			.sort(byDateDescending);
	}, [result.data]);

	return { awaiting, isReady: result.isReady, isError: result.isError };
}
