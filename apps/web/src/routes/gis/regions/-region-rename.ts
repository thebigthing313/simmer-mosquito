import { useMemo, useState } from 'react';

/** Shared inline-rename state + actions threaded down to every region row. */
export interface RegionRename {
	readonly renamingId: string | null;
	readonly start: (id: string) => void;
	readonly commit: (id: string, name: string) => void;
	readonly cancel: () => void;
}

/**
 * Transient inline-rename state for the region tree, plus the write it commits.
 *
 * Committing closes the field before the write is awaited, so the row goes back
 * to reading its name from the collection immediately — the optimistic update
 * is what shows the new name, and a failed write reverts to the synced one.
 * Waiting would leave an open text box over a name that had already changed.
 */
export function useRegionRename(
	onRename: (id: string, name: string) => void | Promise<void>,
): RegionRename {
	const [renamingId, setRenamingId] = useState<string | null>(null);

	return useMemo<RegionRename>(
		() => ({
			renamingId,
			start: (id) => setRenamingId(id),
			commit: (id, name) => {
				setRenamingId(null);
				void onRename(id, name);
			},
			cancel: () => setRenamingId(null),
		}),
		[renamingId, onRename],
	);
}
