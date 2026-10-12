import { describe, expect, it } from 'vitest';
import { collectionTallies } from '../../../../components/adult-surveillance/trap-collection-tallies';

/**
 * A row of the trap's Collections tab reads "Species" beside "Mosquitoes" under
 * a caption saying the count reflects females. Both numbers have to be read off
 * the same rows, or a male-only collection claims a species it has no mosquito
 * for (#1662).
 */

const CULEX = 'species-culex-pipiens';
const AEDES = 'species-aedes-albopictus';
const UNIDENTIFIED = 'species-unidentified';
const unidentifiedSpeciesIds = new Set([UNIDENTIFIED]);

function row(speciesId: string, sex: 'female' | 'male' | null, count: number) {
	return { speciesId, sex, count };
}

describe('collectionTallies', () => {
	it('counts a species once when it has a female row and a male row', () => {
		const tallies = collectionTallies(
			[row(CULEX, 'female', 12), row(CULEX, 'male', 4)],
			unidentifiedSpeciesIds,
		);
		expect(tallies).toEqual({ species: 1, mosquitoes: 12 });
	});

	it('reads a male-only collection as no species and no mosquitoes', () => {
		const tallies = collectionTallies(
			[row(CULEX, 'male', 3), row(AEDES, 'male', 1)],
			unidentifiedSpeciesIds,
		);
		expect(tallies).toEqual({ species: 0, mosquitoes: 0 });
	});

	it('counts unidentified females as mosquitoes but not as a species', () => {
		const tallies = collectionTallies(
			[row(UNIDENTIFIED, 'female', 5), row(AEDES, 'female', 2)],
			unidentifiedSpeciesIds,
		);
		expect(tallies).toEqual({ species: 1, mosquitoes: 7 });
	});

	it('ignores zero-count and unsexed rows', () => {
		const tallies = collectionTallies(
			[row(CULEX, 'female', 0), row(AEDES, null, 6)],
			unidentifiedSpeciesIds,
		);
		expect(tallies).toEqual({ species: 0, mosquitoes: 0 });
	});
});
