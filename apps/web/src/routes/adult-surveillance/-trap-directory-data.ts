import type {
	CollectionMethodRow,
	SpeciesSex,
	SpeciesStatus,
	TrapRow,
} from '@simmer-mosquito/sync';
import { useMemo } from 'react';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { webCollections } from '../../sync/webCollections';
import { collectionEffectiveDate, isPendingCollection, trapDisplayName } from './-adult-display';

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
	readonly methodNameById: ReadonlyMap<string, string>;
	/** Only the methods an active trap actually uses. */
	readonly methodTabs: readonly MethodTab[];
	/** The open tab: a method id, or {@link ALL_METHODS}. */
	readonly method: string;
	readonly visibleTraps: readonly TrapRow[];
	readonly selectedTrap: TrapRow | null;
	readonly hasActiveTraps: boolean;
}

/**
 * The standing inventory the directory lists, and which of it the filters leave
 * on screen.
 *
 * Both reads are eager shapes, so the list resolves without a fetch — only the
 * selected trap's collections are on-demand, which is what makes the selection
 * rule below worth stating carefully.
 */
export function useTrapDirectory(filters: DirectoryFilters): TrapDirectory {
	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);
	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);

	const methodNameById = useMemo(
		() => new Map(methods.map((method) => [method.id, method.name] as const)),
		[methods],
	);

	const activeTraps = useMemo(
		() =>
			traps
				.filter((trap) => trap.isActive)
				.sort((first, second) => trapDisplayName(first).localeCompare(trapDisplayName(second))),
		[traps],
	);

	// A method only gets a tab if an active trap actually uses it. An agency that
	// has never run a gravid trap should not be offered an empty gravid tab.
	const methodTabs = useMemo(() => {
		const inUse = new Set(activeTraps.map((trap) => trap.collectionMethodId));
		return methods
			.filter((method) => inUse.has(method.id))
			.map((method) => ({ id: method.id, label: method.name }))
			.sort((first, second) => first.label.localeCompare(second.label));
	}, [activeTraps, methods]);

	// A method id left in the URL after its last trap was retired falls back to
	// All, rather than an empty list under a tab that is no longer there.
	const method = methodTabs.some((tab) => tab.id === filters.method) ? filters.method : ALL_METHODS;
	const search = filters.search.trim().toLowerCase();

	const visibleTraps = useMemo(
		() =>
			activeTraps.filter((trap) => {
				if (method !== ALL_METHODS && trap.collectionMethodId !== method) {
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
		held !== undefined && (method === ALL_METHODS || held.collectionMethodId === method)
			? held
			: (visibleTraps[0] ?? null);

	return {
		methodNameById,
		methodTabs,
		method,
		visibleTraps,
		selectedTrap,
		hasActiveTraps: activeTraps.length > 0,
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
	readonly collectedAt: string | null;
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
): readonly CollectionYear[] {
	const byYear = new Map<string, DirectoryCollection[]>();
	for (const collection of collections) {
		const date = collectionEffectiveDate(collection);
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
	const firstDate = collectionEffectiveDate(first) ?? '';
	const secondDate = collectionEffectiveDate(second) ?? '';
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
