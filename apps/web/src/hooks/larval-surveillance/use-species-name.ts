import { useSpeciesNames } from '../queries/use-species-names';

/** One species' display name through the shared taxonomy read. */
export function useSpeciesName(speciesId: string): string {
	return useSpeciesNames().get(speciesId) ?? 'Unknown species';
}
