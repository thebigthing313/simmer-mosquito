import type { SpeciesSex, SpeciesStatus } from '@simmer-mosquito/sync';
import { useMemo } from 'react';
import { type TrapListing, useActiveTraps } from '../../hooks/queries/use-active-traps';
import {
	collectionEffectiveDate,
	collectionSortKey,
	isPendingCollection,
	trapDisplayName,
} from './-adult-display';

/**
 * The fold behind the trap directory's right half: a trap's flat run of
 * collections, cut into the seasons an operator reads it by.
 *
 * Kept apart from the component because every way this can be wrong is a way
 * the screen still looks right — a year that silently swallows the collections
 * of the year before it, or a specimen total that counts a row twice, reads as
 * plausible data rather than as a defect.
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
	 * Whether a filter is holding traps back. An empty list means two different
	 * things — an agency with no traps deployed, and a search that matched none —
	 * and only one of them is the reader's to fix.
	 */
	readonly isNarrowed: boolean;
}

/**
 * Which of the standing inventory the filters leave on screen.
 *
 * The inventory itself arrives sorted and with its method names joined
 * ({@link useActiveTraps}), off an eager shape, so the list resolves without a
 * fetch — only the selected trap's collections are on-demand, which is what makes
 * the selection rule below worth stating carefully.
 */
export function useTrapDirectory(filters: DirectoryFilters): TrapDirectory {
	const { traps: activeTraps } = useActiveTraps();

	// A method only gets a tab if an active trap actually uses it. An agency that
	// has never run a gravid trap should not be offered an empty gravid tab — which
	// is why the tabs are built from the traps rather than from the catalog.
	const methodTabs = useMemo(() => {
		const byId = new Map<string, string>();
		for (const trap of activeTraps) {
			byId.set(trap.methodId, trap.methodName);
		}
		return [...byId.entries()]
			.map(([id, label]) => ({ id, label }))
			.sort((first, second) => first.label.localeCompare(second.label));
	}, [activeTraps]);

	// A method id left in the URL after its last trap was retired falls back to
	// All, rather than an empty list under a tab that is no longer there.
	const method = methodTabs.some((tab) => tab.id === filters.method) ? filters.method : ALL_METHODS;
	const search = filters.search.trim().toLowerCase();

	// Filtered here rather than in the query, for the reason the label is composed
	// here: a search runs against `Code - Name`, and the query cannot spell that.
	// The inventory is one eager, active-only shape, so this is a few hundred rows.
	const visibleTraps = useMemo(
		() =>
			activeTraps.filter((trap) => {
				if (method !== ALL_METHODS && trap.methodId !== method) {
					return false;
				}
				return search === '' || trapDisplayName(trap).toLowerCase().includes(search);
			}),
		[activeTraps, method, search],
	);

	/*
	 * The selection survives a search — narrowing the list is not a request to look
	 * at a different trap, and re-anchoring on every keystroke would fire an
	 * on-demand collections query per letter. Switching method tabs does re-anchor,
	 * because the held trap is no longer one of the ones on screen.
	 */
	const held = activeTraps.find((trap) => trap.id === filters.trap);
	const selectedTrap =
		held !== undefined && (method === ALL_METHODS || held.methodId === method)
			? held
			: (visibleTraps[0] ?? null);

	return {
		methodTabs,
		method,
		visibleTraps,
		selectedTrap,
		hasActiveTraps: activeTraps.length > 0,
		isNarrowed: search !== '' || method !== ALL_METHODS,
	};
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
	 * A `Date` off `useTrapCollections`, which is what the row schema parses a
	 * `timestamptz` into. Stated as either because these are the shapes the pure
	 * functions below work over, and a fixture is easier to read as a string.
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
 * ahead of them.
 *
 * The year comes off the *effective* date — the two collection timing modes
 * store it in different columns, and reading `collectedAt` alone would file
 * every date-and-duration collection under "undated". What is left after that
 * fallback is genuinely undated: a trap still out, or a record whose date was
 * never filled in. Both belong at the top, where work that is not finished is
 * what an operator is looking for.
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
			collections: [...bucket].sort(compareByDateDesc),
		}));

	if (undated.length === 0) {
		return years;
	}
	return [
		{
			key: UNDATED_GROUP_KEY,
			// "Trap out" is the domain name for this, but only while every row in the
			// bucket is genuinely pending — a date-and-duration collection missing its
			// date is undated for an unrelated reason and should not be called set.
			label: undated.every(isPendingCollection) ? 'Trap out' : 'Undated',
			collections: undated,
		},
		...years,
	];
}

/** Most recent first. Undated rows sort last, which the year buckets never mix. */
function compareByDateDesc(first: DirectoryCollection, second: DirectoryCollection): number {
	const firstDate = collectionSortKey(first);
	const secondDate = collectionSortKey(second);
	if (firstDate === secondDate) {
		return 0;
	}
	return firstDate < secondDate ? 1 : -1;
}

/**
 * What a collection caught. Non-positive counts are ignored, so a zero row
 * neither inflates the specimen total nor claims a species was present.
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
 * The one line a closed row carries.
 *
 * A collection that is still out, or empty by declaration, says so rather than
 * showing a zero: "0 species · 0 specimens" is a tally, and reads as a trap that
 * caught nothing rather than as a sample nobody has keyed out yet.
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
	return `${totals.species} species · ${totals.specimens.toLocaleString()} specimens`;
}
