import { useRegionFolders } from '../queries/use-region-folders';

/** Every region folder's name by id, read once from the eager folder collection. */
export function useRegionFolderNames(): ReadonlyMap<string, string> {
	const { folders } = useRegionFolders();

	return new Map(folders.map((folder) => [folder.id, folder.name] as const));
}
