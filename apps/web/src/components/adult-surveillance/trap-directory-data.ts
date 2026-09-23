import type { SpeciesSex, SpeciesStatus } from '@simmer-mosquito/domain';
import { compareByCollectionDateDesc } from '../../hooks/queries/collection-view';
import type { TrapListing } from '../../hooks/queries/use-active-traps';
import { collectionEffectiveDate, isPendingCollection } from './adult-display';

/**
 * The fold behind the trap directory's right half: a trap's flat run of
 * collections, cut into seasons. Pure, so a year that swallows the year before
 * it or a total that counts a row twice can be asserted.
 */

/** The bucket undated collections fall into, kept ahead of the dated years. */
export const UNDATED_GROUP_KEY = 'undated';

/** The tab that narrows to nothing: every active trap, whatever it collects with. */
export const ALL_METHODS = 'all';

export interface DirectoryFilters {
	readonly search: string;
	/** A collection method id, or blank for every method. */
	readonly method: string;
	/** The trap whose collections fill the right half. Blank falls to the first. */
	readonly trap: string;
}

export interface MethodTab {
	readonly id: string;
	readonly label: string;
}

export interface TrapDirectory {
	/** Only the methods an active trap actually uses. */
	readonly methodTabs: readonly MethodTab[];
	/** The open tab: a method id, or {@link ALL_METHODS}. */
	readonly method: string;
	readonly visibleTraps: readonly TrapListing[];
	readonly selectedTrap: TrapListing | null;
	readonly hasActiveTraps: boolean;
	/**
	 * Whether a filter is holding traps back. An empty list is either an
	 * organization with no traps or a search that matched none.
	 */
	readonly isNarrowed: boolean;
}

export interface DirectorySpecies {
	readonly id: string;
	readonly speciesId: string;
	readonly count: number;
	readonly sex: SpeciesSex | null;
	readonly status: SpeciesStatus | null;
}

export interface DirectoryCollection {
	readonly id: string;
	/**
	 * A `Date` off `useTrapCollections`, or a string, because a fixture is easier
	 * to read as a string.
	 */
	readonly collectedAt: Date | string | null;
	readonly collectionDate: string | null;
	readonly collectionTimingMode: string;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	readonly species: readonly DirectorySpecies[];
}

export interface CollectionYear {
	readonly key: string;
	readonly label: string;
	readonly collections: readonly DirectoryCollection[];
}

export interface SpecimenTotals {
	readonly specimens: number;
	readonly species: number;
}

/**
 * Cut a trap's collections into years, most recent first, with the undated ones
 * ahead of them. The year comes off the effective date, because the two timing
 * modes store it in different columns. What is left is a trap still out, or a
 * record whose date was never filled in.
 */
export function groupByYear(
	collections: readonly DirectoryCollection[],
	timeZone: string,
): readonly CollectionYear[] {
	const byYear = new Map<string, DirectoryCollection[]>();
	for (const collection of collections) {
		const date = collectionEffectiveDate(collection, timeZone);
		const key = date === null ? UNDATED_GROUP_KEY : date.slice(0, 4);
		const bucket = byYear.get(key);
		if (bucket === undefined) {
			byYear.set(key, [collection]);
		} else {
			bucket.push(collection);
		}
	}

	const undated = byYear.get(UNDATED_GROUP_KEY) ?? [];
	byYear.delete(UNDATED_GROUP_KEY);

	const years: CollectionYear[] = [...byYear.entries()]
		.sort(([first], [second]) => (first < second ? 1 : -1))
		.map(([key, bucket]) => ({
			key,
			label: key,
			collections: [...bucket].sort(compareByCollectionDateDesc),
		}));

	if (undated.length === 0) {
		return years;
	}
	return [
		{
			key: UNDATED_GROUP_KEY,
			// "Trap out" only while every row in the bucket is pending; a
			// date-and-duration collection missing its date is undated for another reason.
			label: undated.every(isPendingCollection) ? 'Trap out' : 'Undated',
			collections: undated,
		},
		...years,
	];
}

/**
 * What a collection caught. Non-positive counts are ignored, so a zero row
 * neither inflates the total nor claims a species was present.
 */
export function specimenTotals(species: readonly DirectorySpecies[]): SpecimenTotals {
	let specimens = 0;
	const distinct = new Set<string>();
	for (const entry of species) {
		const count = entry.count ?? 0;
		if (count <= 0) {
			continue;
		}
		specimens += count;
		distinct.add(entry.speciesId);
	}
	return { specimens, species: distinct.size };
}

/**
 * The one line a closed row carries. A collection still out, or empty by
 * declaration, says so rather than showing "0 species · 0 specimens".
 */
export function summaryLabel(collection: DirectoryCollection, totals: SpecimenTotals): string {
	if (isPendingCollection(collection)) {
		return 'Not yet collected';
	}
	if (collection.isZeroResult) {
		return 'No specimens';
	}
	if (totals.specimens === 0) {
		return 'Not identified';
	}
	return `${totals.species} species · ${totals.specimens.toLocaleString('en-US')} specimens`;
}
