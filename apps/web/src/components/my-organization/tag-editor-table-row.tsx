import { ColorPicker } from '@simmer-mosquito/ui-web/components/color-picker';
import { MultiSelect } from '@simmer-mosquito/ui-web/components/multi-select';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { TableCell, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { useTagMutations } from '../../hooks/mutations/use-tag-mutations';
import type { TagRecord } from '../../hooks/queries/use-tag-catalog';
import { errorMessageForSave } from '../../lib/save-error';
import { TAG_RELEVANCE_OPTIONS } from '../../lib/tag-relevance';
import { CatalogDeleteDialog } from '../catalog';
import { CloseIcon, DeleteIcon, SaveIcon } from './constants';
import { watchWrite } from './helpers';
import { tagFieldsFrom, tagFormValues } from './tag-form-values';
import type { TagFormValues } from './types';

export function TagEditorTableRow({
	onCancel,
	tag,
}: {
	readonly onCancel: () => void;
	readonly tag: TagRecord;
}) {
	const id = useId();
	const mutations = useTagMutations();
	// The draft is held beside the row it was edited from. A row that changes
	// under the editor (a sync) starts a fresh draft, with no reset and no
	// render drawing the old draft over the new row.
	const [held, setHeld] = useState<{ readonly tag: TagRecord; readonly values: TagFormValues }>(
		() => ({ tag, values: tagFormValues(tag) }),
	);
	const values = held.tag === tag ? held.values : tagFormValues(tag);
	const setValues = (next: TagFormValues) => setHeld({ tag, values: next });

	function saveTag() {
		try {
			// `current` comes back through the same round trip as the edited values, so
			// a field nobody touched compares equal to itself.
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
					<FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
					<Input
						id={`${id}-name`}
						value={values.tagName}
						className="min-w-0"
						onChange={(event) => setValues({ ...values, tagName: event.target.value })}
					/>
				</Field>
			</TableCell>
			<TableCell className="align-top whitespace-normal">
				<Field className="gap-1">
					<FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
					<Textarea
						id={`${id}-description`}
						value={values.description}
						className="min-h-14 min-w-0 max-w-full resize-y wrap-anywhere whitespace-pre-wrap"
						onChange={(event) => setValues({ ...values, description: event.target.value })}
					/>
				</Field>
			</TableCell>
			<TableCell className="w-(--tag-relevance-column) align-top">
				<Field className="gap-1">
					<FieldLabel htmlFor={`${id}-relevance`}>Suggested For</FieldLabel>
					{/* Placeholdered rather than left blank, so the empty set states what
					    it means instead of reading as unset. Ticking all six saves the
					    empty set, which the `updateTag` validator does for every caller. */}
					<MultiSelect
						id={`${id}-relevance`}
						options={TAG_RELEVANCE_OPTIONS}
						placeholder="All records"
						value={values.relevantEntityTypes}
						onValueChange={(relevantEntityTypes) => setValues({ ...values, relevantEntityTypes })}
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
					<FieldLabel htmlFor={`${id}-active`}>
						{values.isActive ? 'Active' : 'Deactivated'}
					</FieldLabel>
					{/* The visible text follows the value, so the switch is named for what it
					    turns on and reads the same in either state. */}
					<Switch
						id={`${id}-active`}
						aria-label="Active"
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
						<span className="sr-only">Cancel Editing {tag.name}</span>
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}
