import { useState } from 'react';
import { useTagCatalog } from '../../hooks/queries/use-tag-catalog';
import { TagCreatePanel } from './tag-create-panel';
import { TagTableSection } from './tag-table-section';

export function TagSections({
	canManage,
	isCreating,
	onCancelCreate,
}: {
	readonly canManage: boolean;
	readonly isCreating: boolean;
	readonly onCancelCreate: () => void;
}) {
	// Both halves already split and in name order: `is_active` is a pushed-down
	// predicate, so the partition and the sort this used to do in the browser are
	// the query's now.
	const { activeTags, inactiveTags } = useTagCatalog();
	const [editingTagId, setEditingTagId] = useState<string | null>(null);

	/*
	 * `w-fit`: the block is as wide as the widest thing in it, which is the
	 * table at the sum of its four column widths, so the add row above and the
	 * empty-state box stretch to the table's right edge and no further. The
	 * shell draws the section at the `record` measure (#1045), and without this
	 * the create panel ran to the frame on its own (#1054). `fit-content` is
	 * capped at the available width, so below `md:` the table still scrolls
	 * inside its `overflow-x-auto` container rather than the block overflowing
	 * the page.
	 */
	return (
		<div className="grid w-fit gap-3">
			{canManage && isCreating ? <TagCreatePanel onCancel={onCancelCreate} /> : null}
			<TagTableSection
				canManage={canManage}
				editingTagId={editingTagId}
				emptyLabel="No active tags"
				onCancelEdit={() => setEditingTagId(null)}
				onEdit={setEditingTagId}
				title="Active"
				tags={activeTags}
			/>
			<TagTableSection
				canManage={canManage}
				editingTagId={editingTagId}
				emptyLabel="No deactivated tags"
				onCancelEdit={() => setEditingTagId(null)}
				onEdit={setEditingTagId}
				title="Deactivated"
				tags={inactiveTags}
			/>
		</div>
	);
}
