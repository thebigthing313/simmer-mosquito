import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { useCallback, useState } from 'react';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useRegionFolderMutations } from '../../../hooks/mutations/use-region-folder-mutations';
import type { RegionFolderListing } from '../../../hooks/queries/use-region-folders';

/**
 * One dialog for both region-folder writes — `folder === null` creates, otherwise
 * it edits in place. Callers mount it only while open, so the fields start from
 * the folder being edited without a sync-back effect.
 */
export function RegionFolderDialog({
	folder,
	onClose,
	onSaved,
}: {
	readonly folder: RegionFolderListing | null;
	readonly onClose: () => void;
	/** Runs with the written folder's id before the dialog closes. */
	readonly onSaved?: (folderId: string) => void;
}) {
	const [name, setName] = useState(folder?.name ?? '');
	const [description, setDescription] = useState(folder?.description ?? '');
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const mutations = useRegionFolderMutations();

	const canSave = mutations.canWrite && name.trim().length > 0;

	const onSave = useCallback(async () => {
		if (!canSave) {
			return;
		}
		setIsSaving(true);
		setError(null);
		const trimmedDescription = description.trim();
		const fields = {
			name: name.trim(),
			description: trimmedDescription.length === 0 ? null : trimmedDescription,
		};
		try {
			let savedId: string;
			if (folder === null) {
				savedId = newRecordId();
				await mutations.create(savedId, fields);
			} else {
				savedId = folder.id;
				await mutations.save(folder.id, fields, {
					name: folder.name,
					description: folder.description,
				});
			}
			onSaved?.(savedId);
			onClose();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to save folder.');
		} finally {
			setIsSaving(false);
		}
	}, [canSave, name, description, folder, mutations, onClose, onSaved]);

	const isEdit = folder !== null;

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			open
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{isEdit ? 'Edit Region Folder' : 'New Region Folder'}</DialogTitle>
					<DialogDescription>Group related regions under a named folder.</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="grid gap-1.5">
						<Label htmlFor="folder-name">Name</Label>
						<Input
							id="folder-name"
							onChange={(event) => setName(event.target.value)}
							placeholder="e.g. Districts"
							value={name}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="folder-description">Description</Label>
						<Input
							id="folder-description"
							onChange={(event) => setDescription(event.target.value)}
							placeholder="What this folder groups"
							value={description}
						/>
					</div>
					{error === null ? null : <p className="m-0 text-destructive text-sm">{error}</p>}
				</div>
				<DialogFooter>
					<Button onClick={onClose} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={!canSave || isSaving} onClick={onSave} type="button">
						{isEdit ? 'Save Folder' : 'Create Folder'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
