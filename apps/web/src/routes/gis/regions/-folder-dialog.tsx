import type { RegionFolderRow } from '@simmer-mosquito/sync';
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
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';

/**
 * One dialog for both region-folder writes — `folder === null` creates, otherwise
 * it edits in place. Callers mount it only while open, so the fields start from
 * the folder being edited without a sync-back effect.
 */
export function RegionFolderDialog({
	organizationId,
	actorProfileId,
	folder,
	onClose,
	onSaved,
}: {
	readonly organizationId: string;
	readonly actorProfileId: string | null;
	readonly folder: RegionFolderRow | null;
	readonly onClose: () => void;
	/** Runs with the written folder's id before the dialog closes. */
	readonly onSaved?: (folderId: string) => void;
}) {
	const [name, setName] = useState(folder?.name ?? '');
	const [description, setDescription] = useState(folder?.description ?? '');
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const canSave = organizationId.length > 0 && name.trim().length > 0;

	const onSave = useCallback(async () => {
		if (!canSave) {
			return;
		}
		setIsSaving(true);
		setError(null);
		const trimmedName = name.trim();
		const trimmedDescription = description.trim();
		const nextDescription = trimmedDescription.length === 0 ? null : trimmedDescription;
		const now = new Date().toISOString();
		try {
			let savedId: string;
			if (folder === null) {
				const row: RegionFolderRow = {
					id: crypto.randomUUID(),
					organizationId,
					name: trimmedName,
					description: nextDescription,
					createdByProfileId: actorProfileId,
					updatedByProfileId: actorProfileId,
					createdAt: now,
					updatedAt: now,
				};
				savedId = row.id;
				await settleWrite(webCollections.regionFolders.insert(row));
			} else {
				savedId = folder.id;
				await settleWrite(
					webCollections.regionFolders.update(folder.id, (draft) => {
						const writable = draft as {
							-readonly [K in keyof RegionFolderRow]: RegionFolderRow[K];
						};
						writable.name = trimmedName;
						writable.description = nextDescription;
						if (actorProfileId !== null) {
							writable.updatedByProfileId = actorProfileId;
						}
						writable.updatedAt = now;
					}),
				);
			}
			onSaved?.(savedId);
			onClose();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to save folder.');
		} finally {
			setIsSaving(false);
		}
	}, [canSave, organizationId, name, description, actorProfileId, folder, onClose, onSaved]);

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
