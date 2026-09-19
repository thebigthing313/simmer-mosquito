import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { ColorPicker } from '@simmer-mosquito/ui-web/components/color-picker';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type TagFields, useTagMutations } from '../../hooks/mutations/use-tag-mutations';
import { type TagRecord, useTagCatalog } from '../../hooks/queries/use-tag-catalog';
import { hexWithAlpha, validHexColor } from '../../lib/hex-color';
import { errorMessageForSave } from '../../lib/save-error';
import { CatalogDeleteDialog } from '../catalog';
import { AddIcon, CloseIcon, DeleteIcon, EditIcon, SaveIcon } from './constants';
import { watchWrite } from './helpers';
import type { TagFormValues } from './types';

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

function TagTableSection({
	canManage,
	editingTagId,
	emptyLabel,
	onCancelEdit,
	onEdit,
	tags,
	title,
}: {
	readonly canManage: boolean;
	readonly editingTagId: string | null;
	readonly emptyLabel: string;
	readonly onCancelEdit: () => void;
	readonly onEdit: (tagId: string) => void;
	readonly tags: readonly TagRecord[];
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<h3 className="eyebrow mt-0.5 mb-0">{title}</h3>
			{tags.length === 0 ? (
				<p className="m-0 rounded-md border border-border/30 bg-muted/40 px-2.5 py-2 text-sm text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<div className="overflow-hidden rounded-md border border-border/30 [--tag-actions-column:156px] [--tag-color-column:150px] [--tag-description-column:clamp(220px,30vw,360px)] [--tag-preview-column:clamp(150px,18vw,220px)]">
					{/* The width is the sum of the four column widths rather than
					    `Table`'s `w-full`: `table-fixed` hands a wider table's slack to
					    columns that already have widths, which is how the four spread
					    across 1616px at the `record` measure (#1054). No cap and no
					    second number, since the same four variables size the columns. */}
					<Table className="w-[calc(var(--tag-preview-column)+var(--tag-description-column)+var(--tag-color-column)+var(--tag-actions-column))] table-fixed">
						<TableHeader>
							<TableRow>
								<TableHead className="w-(--tag-preview-column)">Tag Preview</TableHead>
								<TableHead className="w-(--tag-description-column)">Description</TableHead>
								<TableHead className="w-(--tag-color-column)">Color</TableHead>
								{canManage ? (
									<TableHead className="w-(--tag-actions-column) text-right">Actions</TableHead>
								) : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{tags.map((tag) =>
								editingTagId === tag.id ? (
									<TagEditorTableRow key={tag.id} tag={tag} onCancel={onCancelEdit} />
								) : (
									<TagDisplayTableRow
										canManage={canManage}
										key={tag.id}
										onEdit={() => onEdit(tag.id)}
										tag={tag}
									/>
								),
							)}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}

function TagBadge({ tag }: { readonly tag: TagRecord }) {
	const color = validHexColor(tag.color);
	const style =
		color === null
			? undefined
			: ({
					'--tag-color': color,
					'--tag-bg': hexWithAlpha(color, 0.14),
					'--tag-border': hexWithAlpha(color, 0.36),
				} as React.CSSProperties);

	return (
		<Badge
			variant={color === null ? 'secondary' : 'outline'}
			className={
				color === null ? undefined : 'border-(--tag-border) bg-(--tag-bg) text-(--tag-color)'
			}
			style={style}
			title={tag.description ?? undefined}
		>
			{tag.name}
		</Badge>
	);
}

function TagColorSwatch({ color }: { readonly color: string | null }) {
	const normalized = validHexColor(color);
	const style =
		normalized === null ? undefined : ({ '--tag-color': normalized } as React.CSSProperties);

	return (
		<span className="inline-flex items-center gap-2">
			<span
				aria-hidden="true"
				className={
					normalized === null
						? 'size-3 rounded-sm border border-border bg-muted'
						: 'size-3 rounded-sm border border-border bg-(--tag-color)'
				}
				style={style}
			/>
			<span className="font-mono text-xs text-muted-foreground">{normalized ?? 'Default'}</span>
		</span>
	);
}

function TagDisplayTableRow({
	canManage,
	onEdit,
	tag,
}: {
	readonly canManage: boolean;
	readonly onEdit: () => void;
	readonly tag: TagRecord;
}) {
	return (
		<TableRow>
			<TableCell className="w-(--tag-preview-column)">
				<TagBadge tag={tag} />
			</TableCell>
			<TableCell className="w-(--tag-description-column) whitespace-normal text-muted-foreground wrap-anywhere">
				{tag.description ?? <AbsentValue />}
			</TableCell>
			<TableCell className="w-(--tag-color-column)">
				<TagColorSwatch color={tag.color} />
			</TableCell>
			{canManage ? (
				<TableCell className="w-(--tag-actions-column) text-right">
					<Button type="button" variant="outline" size="sm" onClick={onEdit}>
						<EditIcon aria-hidden="true" />
						Edit
					</Button>
				</TableCell>
			) : null}
		</TableRow>
	);
}

/**
 * A Tag as its inline form holds one, and back.
 *
 * The boundary between what the row shows — a `null` colour is no colour — and
 * what an input can hold, which is only ever a string.
 */
function tagFormValues(tag: TagRecord): TagFormValues {
	return {
		tagName: tag.name,
		description: tag.description ?? '',
		color: tag.color ?? '',
		isActive: tag.isActive,
	};
}

function tagFieldsFrom(values: TagFormValues): TagFields {
	const description = values.description.trim();
	const color = values.color.trim();
	return {
		name: values.tagName.trim(),
		description: description.length === 0 ? null : description,
		color: color.length === 0 ? null : color,
		isActive: values.isActive,
	};
}

function TagCreatePanel({ onCancel }: { readonly onCancel: () => void }) {
	const mutations = useTagMutations();
	const [values, setValues] = useState<TagFormValues>({
		tagName: '',
		description: '',
		color: '',
		isActive: true,
	});

	function createTag() {
		try {
			const write = mutations.create(tagFieldsFrom(values));
			setValues({ tagName: '', description: '', color: '', isActive: true });
			watchWrite(write, 'Unable to create tag.');
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	}

	return (
		<div className="grid gap-2 rounded-md border border-dashed border-border/50 bg-background/50 p-2.5">
			<div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_132px_auto]">
				<Field className="gap-1">
					<FieldLabel>Name</FieldLabel>
					<Input
						value={values.tagName}
						placeholder="e.g. New tag"
						onChange={(event) => setValues({ ...values, tagName: event.target.value })}
					/>
				</Field>
				<Field className="gap-1">
					<FieldLabel>Color</FieldLabel>
					<ColorPicker
						value={values.color}
						onChange={(color) => setValues({ ...values, color: color ?? '' })}
					/>
				</Field>
				<div className="flex items-end gap-2">
					<Button type="button" disabled={!mutations.canWrite} onClick={createTag}>
						<AddIcon aria-hidden="true" />
						Add
					</Button>
					<Button type="button" variant="outline" onClick={onCancel}>
						<CloseIcon aria-hidden="true" />
						Cancel
					</Button>
				</div>
			</div>
			<Field className="gap-1">
				<FieldLabel>Description</FieldLabel>
				<Textarea
					value={values.description}
					className="min-h-14"
					onChange={(event) => setValues({ ...values, description: event.target.value })}
				/>
			</Field>
		</div>
	);
}

function TagEditorTableRow({
	onCancel,
	tag,
}: {
	readonly onCancel: () => void;
	readonly tag: TagRecord;
}) {
	const mutations = useTagMutations();
	const [values, setValues] = useState<TagFormValues>(() => tagFormValues(tag));

	useEffect(() => {
		setValues(tagFormValues(tag));
	}, [tag]);

	function saveTag() {
		try {
			// `current` comes back through the same round trip as the edited values,
			// so a field nobody touched compares equal to itself and the save names
			// only the commands it has changed fields for.
			const write = mutations.save(
				tag.id,
				tagFieldsFrom(values),
				tagFieldsFrom(tagFormValues(tag)),
			);
			watchWrite(write, `Unable to save ${tag.name}.`);
			onCancel();
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	}

	function deleteTag() {
		watchWrite(mutations.remove(tag.id), `Unable to delete ${tag.name}.`);
		onCancel();
	}

	return (
		<TableRow>
			<TableCell className="w-(--tag-preview-column) align-top">
				<Field className="gap-1">
					<FieldLabel>Name</FieldLabel>
					<Input
						value={values.tagName}
						className="min-w-0"
						onChange={(event) => setValues({ ...values, tagName: event.target.value })}
					/>
				</Field>
			</TableCell>
			<TableCell className="w-(--tag-description-column) align-top whitespace-normal">
				<Field className="gap-1">
					<FieldLabel>Description</FieldLabel>
					<Textarea
						value={values.description}
						className="min-h-14 min-w-0 max-w-full resize-y wrap-anywhere whitespace-pre-wrap"
						onChange={(event) => setValues({ ...values, description: event.target.value })}
					/>
				</Field>
			</TableCell>
			<TableCell className="w-(--tag-color-column) align-top">
				<Field className="gap-1">
					<FieldLabel>Color</FieldLabel>
					<ColorPicker
						value={values.color}
						onChange={(color) => setValues({ ...values, color: color ?? '' })}
					/>
				</Field>
				<Field className="mt-2 grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/30 bg-muted/30 px-2.5 py-1">
					<FieldLabel>{values.isActive ? 'Active' : 'Deactivated'}</FieldLabel>
					<Switch
						checked={values.isActive}
						onCheckedChange={(isActive) => setValues({ ...values, isActive })}
					/>
				</Field>
			</TableCell>
			<TableCell className="w-(--tag-actions-column) align-top">
				<div className="flex justify-end gap-2">
					<CatalogDeleteDialog
						confirmLabel="Delete"
						description={
							<>
								This removes {tag.name} from the tag list. A tag still on any record cannot be
								deleted; deactivate it instead.
							</>
						}
						onConfirm={deleteTag}
						record={{ type: 'tag', id: tag.id }}
						title="Delete Tag?"
						trigger={
							<Button type="button" variant="destructive" size="icon">
								<DeleteIcon aria-hidden="true" />
								<span className="sr-only">Delete {tag.name}</span>
							</Button>
						}
					/>
					<Button type="button" variant="outline" size="icon" onClick={saveTag}>
						<SaveIcon aria-hidden="true" />
						<span className="sr-only">Save {tag.name}</span>
					</Button>
					<Button type="button" variant="outline" size="icon" onClick={onCancel}>
						<CloseIcon aria-hidden="true" />
						<span className="sr-only">Cancel editing {tag.name}</span>
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}
