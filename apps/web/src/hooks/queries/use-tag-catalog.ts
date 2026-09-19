import { useTagHalf } from './use-tag-half';

/** A Tag as its management page shows one and its dialog edits one. */
export interface TagRecord {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	/** A hex string the organization chose, or `null`. Validated where it is rendered. */
	readonly color: string | null;
	readonly isActive: boolean;
}

/** The Tag catalog in its two lifecycle halves, with the colour and description the dialog edits. */
export function useTagCatalog(): {
	readonly activeTags: readonly TagRecord[];
	readonly inactiveTags: readonly TagRecord[];
} {
	return { activeTags: useTagHalf(true), inactiveTags: useTagHalf(false) };
}
