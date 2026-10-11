import { useState } from 'react';
import { catalogs } from '../../hooks/queries/catalog-register';
import { useCatalogRecords } from '../../hooks/queries/use-catalog-records';
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
	// Both halves arrive split and in name order: `is_active` is a pushed-down
	// predicate.
	const { activeRecords, inactiveRecords } = useCatalogRecords(catalogs.tags);
	const [editingTagId, setEditingTagId] = useState<string | null>(null);

	return (
		<div className="grid gap-3">
			{canManage && isCreating ? <TagCreatePanel onCancel={onCancelCreate} /> : null}
			<TagTableSection
				canManage={canManage}
				editingTagId={editingTagId}
				emptyLabel="No active tags"
				onCancelEdit={() => setEditingTagId(null)}
				onEdit={setEditingTagId}
				title="Active"
				tags={activeRecords}
			/>
			<TagTableSection
				canManage={canManage}
				editingTagId={editingTagId}
				emptyLabel="No deactivated tags"
				onCancelEdit={() => setEditingTagId(null)}
				onEdit={setEditingTagId}
				title="Deactivated"
				tags={inactiveRecords}
			/>
		</div>
	);
}
