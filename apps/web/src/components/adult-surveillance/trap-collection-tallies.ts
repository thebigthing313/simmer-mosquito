import type { SpeciesSex } from '@simmer-mosquito/domain';

/**
 * The two numbers a row of a trap's Collections tab carries, and the filter the
 * Species tab shares with them. Pure, so a species counted from a male row can
 * be asserted.
 */

/** One identification row, as `useTrapCollections` hands it up. */
export interface TalliedIdentification {
	readonly speciesId: string;
	readonly count: number;
	readonly sex: SpeciesSex | null;
}

export interface CollectionTallies {
	/** Distinct identified species among the female rows. */
	readonly species: number;
	/** Female mosquitoes, identified or not. */
	readonly mosquitoes: number;
}

/**
 * A female row keyed out to a real species. The catalog's "Unidentified
 * mosquito" placeholder is still a mosquito, but it is not a species.
 */
export function isIdentifiedFemale(
	entry: TalliedIdentification,
	unidentifiedSpeciesIds: ReadonlySet<string>,
): boolean {
	return entry.sex === 'female' && !unidentifiedSpeciesIds.has(entry.speciesId);
}

/**
 * Species and mosquitoes for one collection, both read off its female rows. A
 * species with a female row and a male row counts once, and a male-only
 * collection reads zero for both. Non-positive counts are ignored.
 */
export function collectionTallies(
	species: readonly TalliedIdentification[],
	unidentifiedSpeciesIds: ReadonlySet<string>,
): CollectionTallies {
	let mosquitoes = 0;
	const distinct = new Set<string>();
	for (const entry of species) {
		const count = entry.count ?? 0;
		if (entry.sex !== 'female' || count <= 0) {
			continue;
		}
		mosquitoes += count;
		if (isIdentifiedFemale(entry, unidentifiedSpeciesIds)) {
			distinct.add(entry.speciesId);
		}
	}
	return { species: distinct.size, mosquitoes };
}
