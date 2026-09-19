import type { useRegionMutations } from '../mutations/use-region-mutations';
import type { RegionListing } from '../queries/use-region-directory';

/**
 * The two writes the region tree makes in place, rename and move, each
 * skipped when it would change nothing on the current row and each swallowing
 * a failed optimistic write, since the tree already shows the synced value.
 */
export function useRegionEdits(
	mutations: ReturnType<typeof useRegionMutations>,
	regions: readonly RegionListing[],
) {
	const renameRegion = async (id: string, rawName: string) => {
		const name = rawName.trim();
		const current = regions.find((region) => region.id === id);
		if (current === undefined || name.length === 0 || name === current.name) {
			return;
		}
		try {
			await mutations.rename(id, name);
		} catch {
			// Optimistic mutation rolled back; the tree already shows the synced name.
		}
	};
	const moveRegion = async (id: string, folderId: string | null) => {
		const current = regions.find((region) => region.id === id);
		if (current === undefined || current.folderId === folderId) {
			return;
		}
		try {
			await mutations.move(id, folderId);
		} catch {
			// Optimistic mutation rolled back; the tree already shows the prior folder.
		}
	};
	return { moveRegion, renameRegion };
}
